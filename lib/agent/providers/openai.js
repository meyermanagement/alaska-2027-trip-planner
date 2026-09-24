// OpenAI adapter, on the Responses API (POST /v1/responses).
//
// Ask Aly's plain answers run here: GPT-5.6 Luna at low reasoning answered all
// eight made-up household questions in the model test, faster than Gemini 3.7
// Flash and at about a quarter of the cost. Grounded answers (web lookups) and
// every other feature stay on Gemini; lib/agent/llm.js decides which is which.
//
// Why Responses and not Chat Completions: Chat Completions refuses function
// tools together with a reasoning effort on these models ("use /v1/responses or
// set reasoning_effort to 'none'"), and reasoning off made unrequested writes in
// the test. So the adapter speaks the API that allows both.
//
// store: false on every request. Responses otherwise keeps application state for
// at least 30 days so a later call can refer back to it; this app sends the
// whole conversation every time and never refers back, so nothing is gained by
// letting it be kept. What OpenAI still keeps is its abuse-monitoring log, up to
// 30 days, which the consent screens say.

import { ModelError, tooSlow } from "../model-error";
import { textWithNotes } from "../finish";

const BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const MODELS = (process.env.OPENAI_MODELS || "gpt-5.6-luna")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const RETRYABLE = new Set([500, 502, 503, 504]);
const NEXT_MODEL = new Set([429]);

const OWN_BUDGET_MS = 46000;
const MIN_ATTEMPT_MS = 8000;
const ATTEMPT_CAP_MS = 45000;

/** The models this adapter would try, in order. */
export function modelList() {
  return [...MODELS];
}

/** Whether a model id belongs to this adapter. */
export function owns(model) {
  return /^(gpt-|o\d)/i.test(String(model || ""));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The app's thinking levels, in the words the Responses API uses. Null means
// the same "low" the model test was run at, not the vendor's own default.
export function effortFor(thinking) {
  const level = String(thinking || "").toLowerCase();
  if (level === "high") return "medium";
  if (level === "minimal" || level === "none") return "minimal";
  return "low";
}

// The same narrowing the Gemini adapter does with VALIDATED and NONE: the
// declarations stay in the request, only the permission moves.
export function toolChoice(tools, allowedTools) {
  if (!Array.isArray(allowedTools)) return "auto";
  const declared = new Set((tools || []).map((t) => t?.name).filter(Boolean));
  const names = [...new Set(allowedTools)].filter((n) => declared.has(n));
  if (!names.length) return "none";
  return {
    type: "allowed_tools",
    mode: "auto",
    tools: names.map((name) => ({ type: "function", name })),
  };
}

// Neutral request -> Responses request. Exported so the harness exercises the
// same translation the app uses.
export function buildRequest({
  system,
  messages,
  tools,
  thinking = null,
  allowedTools = null,
  responseFormat = "text",
}) {
  const body = {
    input: [
      { role: "developer", content: system },
      ...(messages || []).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: textWithNotes(m),
      })),
    ],
    reasoning: { effort: effortFor(thinking) },
    store: false,
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: false,
    }));
    body.tool_choice = toolChoice(tools, allowedTools);
  }
  if (responseFormat === "json") body.text = { format: { type: "json_object" } };
  return body;
}

// What the call cost, in the same shape the Gemini adapter reports, so one
// model_usage row per call works for both vendors.
export function usageFrom(usage) {
  const count = (v) => (Number.isFinite(v) ? v : null);
  const reasoning = count(usage?.output_tokens_details?.reasoning_tokens);
  const output = count(usage?.output_tokens);
  return {
    promptTokens: count(usage?.input_tokens),
    // Output less reasoning, so the two columns mean what they mean for Gemini.
    candidatesTokens:
      output === null ? null : Math.max(0, output - (reasoning || 0)),
    thoughtsTokens: reasoning,
    cachedTokens: count(usage?.input_tokens_details?.cached_tokens),
    toolTokens: null,
    totalTokens: count(usage?.total_tokens),
  };
}

// Responses output -> neutral result.
export function parseResponse(json) {
  let text = "";
  const calls = [];
  for (const item of json?.output || []) {
    if (item?.type === "message") {
      for (const part of item.content || []) {
        if (part?.type === "output_text" && typeof part.text === "string")
          text += part.text;
        if (part?.type === "refusal" && typeof part.refusal === "string")
          text += part.refusal;
      }
    } else if (item?.type === "function_call") {
      try {
        calls.push({ name: item.name, args: JSON.parse(item.arguments || "{}") });
      } catch {
        /* a malformed argument blob is dropped; validateAction would reject it */
      }
    }
  }
  if (!text && typeof json?.output_text === "string") text = json.output_text;
  return {
    text: text.trim(),
    calls,
    finishReason:
      json?.status === "incomplete"
        ? json?.incomplete_details?.reason || "incomplete"
        : json?.status || null,
  };
}

export async function generate({
  system,
  messages,
  tools,
  thinking = null,
  deadline = Date.now() + OWN_BUDGET_MS,
  avoid = [],
  models: only = [],
  attempts = null,
  allowedTools = null,
  responseFormat = "text",
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new ModelError(
      "The assistant is not configured yet — OPENAI_API_KEY is missing.",
      503,
    );
  }

  const body = buildRequest({ system, messages, tools, thinking, allowedTools, responseFormat });

  let ladder = modelList();
  const pinned = (Array.isArray(only) ? only : []).filter(owns);
  if (pinned.length) ladder = pinned;
  else if (Array.isArray(avoid) && avoid.length) {
    const kept = ladder.filter((m) => !avoid.includes(m));
    if (kept.length) ladder = kept;
  }
  const tries = Number.isFinite(attempts) && attempts > 0 ? attempts : 3;

  let lastMessage = "The assistant could not be reached.";
  let lastStatus = 502;
  let ranOutOfTime = false;
  const spend = [];
  let asked = 0;
  const left = () => deadline - Date.now();

  outer: for (let modelIndex = 0; modelIndex < ladder.length; modelIndex++) {
    const model = ladder[modelIndex];
    for (let attempt = 0; attempt < tries; attempt++) {
      const remaining = left();
      if (remaining < MIN_ATTEMPT_MS) {
        ranOutOfTime = true;
        break outer;
      }
      const startedAt = Date.now();
      asked++;
      let res;
      try {
        res = await fetch(`${BASE}/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ ...body, model }),
          signal: AbortSignal.timeout(Math.min(ATTEMPT_CAP_MS, remaining)),
        });
      } catch {
        lastMessage = "The assistant timed out. Try again.";
        lastStatus = 504;
        spend.push({ provider: "openai", model, attempt: asked - 1, status: 504, ok: false, ms: Date.now() - startedAt });
        await sleep(600 * (attempt + 1));
        continue;
      }

      if (res.ok) {
        const json = await res.json();
        const parsed = parseResponse(json);
        spend.push({
          provider: "openai",
          model,
          grounded: false,
          searches: 0,
          attempt: asked - 1,
          status: 200,
          finishReason: parsed.finishReason,
          ok: true,
          ms: Date.now() - startedAt,
          ...usageFrom(json?.usage),
        });
        return {
          ...parsed,
          sources: [],
          searched: false,
          refusals: [],
          usage: spend,
          model,
          modelIndex,
        };
      }

      let message = `Request failed (${res.status}).`;
      try {
        const errJson = await res.json();
        message = errJson?.error?.message || message;
      } catch {
        /* non-JSON error body */
      }
      lastMessage = message;
      lastStatus = res.status;
      spend.push({ provider: "openai", model, attempt: asked - 1, status: res.status, ok: false, ms: Date.now() - startedAt });

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        const err = new ModelError(
          res.status === 400
            ? message
            : "The model API key was rejected. Check the key in Vercel.",
          res.status,
        );
        err.usage = spend;
        throw err;
      }
      if (NEXT_MODEL.has(res.status)) break;
      if (!RETRYABLE.has(res.status)) break;
      await sleep(600 * (attempt + 1));
    }
  }

  const failure = ranOutOfTime ? tooSlow() : new ModelError(lastMessage, lastStatus);
  failure.usage = spend;
  throw failure;
}
