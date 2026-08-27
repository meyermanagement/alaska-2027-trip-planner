// Gemini adapter. Translates the neutral request shape defined in lib/agent/llm.js
// into Google's generateContent format and back again.
//
// Falls back across models because the flash models intermittently return 503
// "high demand", and because quota is tracked per model.

import { ModelError } from "../model-error";

const MODELS = (process.env.GEMINI_MODELS || "")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Newest first, then the model we ran on for months, then the cheap small one.
//
// Deliberately absent:
//   gemini-flash-latest    an alias Google re-points under us with two weeks'
//                          notice, and it draws on the same per-model daily
//                          quota as whatever it currently points at, so it buys
//                          no headroom and costs predictability.
//   gemini-3.1-flash-lite  measured on this app's own tools it invented an id
//                          and proposed deleting an itinerary item that was
//                          never there, twice out of two runs, and it shuts
//                          down 2027-05-07 anyway.
const DEFAULT_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Worth retrying the same model: transient server-side hiccups.
const RETRYABLE = new Set([500, 502, 503, 504]);
// Quota is tracked per model, so a 429 means move on rather than wait.
const NEXT_MODEL = new Set([429]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The caller owns the clock: lib/agent/llm.js hands down an absolute deadline so
// several vendors can share one budget. This default only applies when the
// adapter is called directly, as the test harness does.
const OWN_BUDGET_MS = 46000;
// Below this there is no point starting another call.
const MIN_ATTEMPT_MS = 8000;

/** The models this adapter would try, in order. */
export function modelList() {
  return MODELS.length ? [...MODELS] : [...DEFAULT_MODELS];
}

// Neutral request -> Gemini request. Exported so the test harness exercises the
// same translation the app uses rather than a copy of it.
export function buildRequest({ system, messages, tools, temperature = 0.2 }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: (messages || []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    generationConfig: { temperature },
  };
  if (tools?.length) {
    body.tools = [{ functionDeclarations: tools }];
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
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
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new ModelError(
      "The assistant is not configured yet — GEMINI_API_KEY is missing.",
      503,
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
        res = await fetch(`${BASE}/${model}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
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
        // The model ran into its own output ceiling, so whatever it did say is
        // half a plan. Applying half of a list replacement is worse than
        // applying none of it.
        if (parsed.finishReason === "MAX_TOKENS") {
          throw new ModelError(
            "That was too much to work out in one go. Send it in two halves and I will handle each one.",
            413,
          );
        }
        return { ...parsed, model, modelIndex };
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

      if (res.status === 400 || res.status === 403) {
        throw new ModelError(
          res.status === 403
            ? "The Gemini API key was rejected. Check the key in Vercel."
            : message,
          res.status,
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

// Gemini response -> neutral result.
export function parseResponse(json) {
  const candidate = json?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const calls = [];
  let text = "";
  for (const part of parts) {
    if (part.functionCall) {
      calls.push({
        name: part.functionCall.name,
        args: part.functionCall.args || {},
      });
    } else if (typeof part.text === "string") {
      text += part.text;
    }
  }
  return { text: text.trim(), calls, finishReason: candidate?.finishReason };
}
