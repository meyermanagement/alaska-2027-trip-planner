// Anthropic adapter. Translates the neutral request shape defined in
// lib/agent/llm.js into the Messages API format and back again.
//
// This exists as a second vendor, not a replacement. When Google is out of
// quota, over capacity, or simply down, every model in the Gemini chain fails
// together, because they are all the same account behind the same door. On the
// only independent tool-calling benchmark that publishes numbers, Claude Haiku
// 4.5 placed sixth overall, well ahead of the small OpenAI models, which makes
// it the sensible thing to fall through to.
//
// Headers and field names per the Messages API reference: x-api-key plus a
// required anthropic-version, tools carry `input_schema` rather than Gemini's
// `parameters`, and max_tokens is mandatory rather than optional.

import { ModelError } from "../model-error";

const MODELS = (process.env.ANTHROPIC_MODELS || "")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const DEFAULT_MODELS = ["claude-haiku-4-5-20251001"];

const BASE = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";
// Unlike Gemini, a reply ceiling is required rather than optional. Aly's longest
// honest turn is a sentence plus a pile of tool calls, and a pasted itinerary
// can be forty of them.
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS || 4096);

const RETRYABLE = new Set([500, 502, 503, 504, 529]);
// 429 here is rate limiting rather than a daily allowance, but the answer is the
// same as with Gemini: this request cannot wait, so move on.
const NEXT_MODEL = new Set([429]);

const OWN_BUDGET_MS = 46000;
const MIN_ATTEMPT_MS = 8000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The models this adapter would try, in order. */
export function modelList() {
  return MODELS.length ? [...MODELS] : [...DEFAULT_MODELS];
}

// Gemini forgives a transcript that opens with the assistant or repeats a role;
// the Messages API rejects it. Our transcripts always begin with the question
// that was asked, but a conversation can lose its first row to a failed write,
// and a turn that proposed changes stores a reply with no question after it.
export function normalizeMessages(messages) {
  const list = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: m.text.trim(),
    }));

  // Nothing before the first question is usable context.
  while (list.length && list[0].role === "assistant") list.shift();

  const merged = [];
  for (const m of list) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) prev.text += `\n\n${m.text}`;
    else merged.push({ ...m });
  }
  // A trailing assistant turn would leave the model answering itself.
  while (merged.length && merged[merged.length - 1].role === "assistant") {
    merged.pop();
  }
  return merged;
}

// Neutral request -> Messages API request. Exported so the harness exercises the
// same translation the app uses rather than a copy of it.
export function buildRequest({
  system,
  messages,
  tools,
  temperature = 0.2,
  model = modelList()[0],
  withTemperature = true,
}) {
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    system,
    messages: normalizeMessages(messages).map((m) => ({
      role: m.role,
      content: m.text,
    })),
  };
  if (withTemperature && typeof temperature === "number") {
    body.temperature = temperature;
  }
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      // Same JSON Schema, different key.
      input_schema: t.parameters,
    }));
    body.tool_choice = { type: "auto" };
  }
  return body;
}

// Messages API response -> neutral result.
export function parseResponse(json) {
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const calls = [];
  let text = "";
  for (const block of blocks) {
    if (block?.type === "tool_use") {
      calls.push({ name: block.name, args: block.input || {} });
    } else if (block?.type === "text" && typeof block.text === "string") {
      text += block.text;
    }
  }
  return { text: text.trim(), calls, finishReason: json?.stop_reason };
}

export async function generate({
  system,
  messages,
  tools,
  temperature = 0.2,
  deadline = Date.now() + OWN_BUDGET_MS,
}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new ModelError(
      "The Anthropic fallback is not configured — ANTHROPIC_API_KEY is missing.",
      503,
    );
  }

  const left = () => deadline - Date.now();
  const models = modelList();

  let lastMessage = "The assistant could not be reached.";
  let lastStatus = 502;
  let ranOutOfTime = false;
  // Some models refuse a temperature they do not honor rather than ignoring it.
  // Rather than guess per model, drop it once the model says so.
  let withTemperature = true;

  outer: for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = left();
      if (remaining < MIN_ATTEMPT_MS) {
        ranOutOfTime = true;
        break outer;
      }

      const body = buildRequest({
        system,
        messages,
        tools,
        temperature,
        model,
        withTemperature,
      });

      let res;
      try {
        res = await fetch(BASE, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": VERSION,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(Math.min(45000, remaining)),
        });
      } catch {
        lastMessage = "The assistant timed out. Try again.";
        lastStatus = 504;
        await sleep(600 * (attempt + 1));
        continue;
      }

      if (res.ok) {
        const json = await res.json();
        const parsed = parseResponse(json);
        // Half a plan is worse than none: applying half of a list replacement
        // leaves the family with a list that is neither the old one nor the new.
        if (
          parsed.finishReason === "max_tokens" ||
          parsed.finishReason === "model_context_window_exceeded"
        ) {
          throw new ModelError(
            "That was too much to work out in one go. Send it in two halves and I will handle each one.",
            413,
          );
        }
        if (parsed.finishReason === "refusal") {
          throw new ModelError(
            "I could not answer that one. Try asking it a different way.",
            422,
          );
        }
        return { ...parsed, model, modelIndex };
      }

      let message = `Request failed (${res.status}).`;
      let raw = "";
      try {
        raw = await res.text();
        message = JSON.parse(raw)?.error?.message || message;
      } catch {
        /* non-JSON error body */
      }
      lastMessage = message;
      lastStatus = res.status;

      if (
        res.status === 400 &&
        /temperature/i.test(message) &&
        withTemperature
      ) {
        // Same model, same request, minus the setting it objected to.
        withTemperature = false;
        continue;
      }
      if (res.status === 400) throw new ModelError(message, 400);
      if (res.status === 401 || res.status === 403) {
        throw new ModelError(
          "The Anthropic API key was rejected. Check the key in Vercel.",
          403,
        );
      }
      if (NEXT_MODEL.has(res.status)) break;
      if (!RETRYABLE.has(res.status)) break;
      await sleep(600 * (attempt + 1));
    }
  }

  if (ranOutOfTime) {
    throw new ModelError(
      "That took longer than I am allowed to think. Try it in two smaller pieces \u2014 or ask me to empty the list first, then paste the new one.",
      504,
    );
  }
  throw new ModelError(lastMessage, lastStatus);
}
