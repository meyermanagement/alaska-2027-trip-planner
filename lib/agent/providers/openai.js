// OpenAI-compatible adapter (OpenAI, Azure OpenAI, Groq, OpenRouter, or any
// endpoint that speaks /chat/completions).
//
// This exists to keep the seam honest: the conversation history lives in our own
// Supabase table and the tool definitions are plain JSON Schema, so switching
// models is a matter of setting LLM_PROVIDER=openai and OPENAI_API_KEY rather
// than touching the app.
//
// NOTE: written to the documented API shape but not yet exercised against a live
// key. Verify the first time it is switched on.

import { ModelError, tooSlow } from "../model-error";

const BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
// gpt-4.1-mini was the default here for a year and is now the weakest thing in
// the building: 50.45% on the Berkeley function-calling leaderboard against
// 68.70% for Claude Haiku 4.5. Left addressable through OPENAI_MODELS, but no
// longer the default anything falls back to.
const MODELS = (process.env.OPENAI_MODELS || "gpt-5.6-luna")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const RETRYABLE = new Set([500, 502, 503, 504]);
const NEXT_MODEL = new Set([429]);

const OWN_BUDGET_MS = 46000;
const MIN_ATTEMPT_MS = 8000;

/** The models this adapter would try, in order. */
export function modelList() {
  return [...MODELS];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Neutral request -> OpenAI request. Same seam as the Gemini adapter so both can
// be checked the same way.
export function buildRequest({ system, messages, tools, temperature = 0.2 }) {
  const body = {
    messages: [
      { role: "system", content: system },
      ...(messages || []).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text,
      })),
    ],
    temperature,
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = "auto";
  }
  return body;
}

export async function generate({
  system,
  messages,
  tools,
  temperature = 0.2,
  deadline = Date.now() + OWN_BUDGET_MS,
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new ModelError(
      "The assistant is not configured yet — OPENAI_API_KEY is missing.",
      503
    );
  }

  const body = buildRequest({ system, messages, tools, temperature });

  let lastMessage = "The assistant could not be reached.";
  let lastStatus = 502;
  let ranOutOfTime = false;

  const left = () => deadline - Date.now();
  const models = modelList();

  outer: for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = left();
      if (remaining < MIN_ATTEMPT_MS) {
        ranOutOfTime = true;
        break outer;
      }
      let res;
      try {
        res = await fetch(`${BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ ...body, model }),
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
        return { ...parseResponse(json), model, modelIndex };
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

      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new ModelError(
          res.status === 400
            ? message
            : "The model API key was rejected. Check the key in Vercel.",
          res.status
        );
      }
      if (NEXT_MODEL.has(res.status)) break;
      if (!RETRYABLE.has(res.status)) break;
      await sleep(600 * (attempt + 1));
    }
  }

  if (ranOutOfTime) {
    throw tooSlow();
  }
  throw new ModelError(lastMessage, lastStatus);
}

// OpenAI response -> neutral result.
export function parseResponse(json) {
  const choice = json?.choices?.[0];
  const message = choice?.message || {};
  const calls = [];
  for (const call of message.tool_calls || []) {
    if (call?.type && call.type !== "function") continue;
    let args = {};
    try {
      args = JSON.parse(call?.function?.arguments || "{}");
    } catch {
      /* a malformed argument blob is dropped; validateAction would reject it */
      continue;
    }
    calls.push({ name: call?.function?.name, args });
  }
  return {
    text: typeof message.content === "string" ? message.content.trim() : "",
    calls,
    finishReason: choice?.finish_reason,
  };
}
