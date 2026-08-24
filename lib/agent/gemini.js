// Thin Gemini client. Falls back across models because flash models
// intermittently return 503 "high demand".

const MODELS = [
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Worth retrying the same model: transient server-side hiccups.
const RETRYABLE = new Set([500, 502, 503, 504]);
// Quota is tracked per model, so a 429 means move on rather than wait.
const NEXT_MODEL = new Set([429]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.system      system instruction text
 * @param {Array}  opts.contents    Gemini `contents` array
 * @param {Array}  [opts.tools]     function declarations
 */
export async function generate({ system, contents, tools }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiError(
      "The assistant is not configured yet — GEMINI_API_KEY is missing.",
      503
    );
  }

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.2 },
  };
  if (tools?.length) {
    body.tools = [{ functionDeclarations: tools }];
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }

  let lastMessage = "The assistant could not be reached.";
  let lastStatus = 502;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res;
      try {
        res = await fetch(`${BASE}/${model}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });
      } catch (err) {
        lastMessage = "The assistant timed out. Try again.";
        lastStatus = 504;
        await sleep(600 * (attempt + 1));
        continue;
      }

      if (res.ok) {
        const json = await res.json();
        return parse(json);
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
        throw new GeminiError(
          res.status === 403
            ? "The Gemini API key was rejected. Check the key in Vercel."
            : message,
          res.status
        );
      }
      if (NEXT_MODEL.has(res.status)) break;
      if (!RETRYABLE.has(res.status)) break;
      await sleep(600 * (attempt + 1));
    }
  }

  throw new GeminiError(lastMessage, lastStatus);
}

function parse(json) {
  const candidate = json?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const calls = [];
  let text = "";
  for (const part of parts) {
    if (part.functionCall) calls.push(part.functionCall);
    else if (typeof part.text === "string") text += part.text;
  }
  return { text: text.trim(), calls, finishReason: candidate?.finishReason };
}
