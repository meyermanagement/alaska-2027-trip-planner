// One request to one named model, measured.
//
// No ladder, no retries, no fallback: the question the model lab asks is "what
// does this particular model do with this particular request", and a retry or a
// second model would answer a different question. The request bodies are built
// with the app's own adapters, so a model is tested on the same shape of
// request the app sends it.
//
// Never throws. A refusal, a timeout or a 429 is a result like any other.

import * as gemini from "@/lib/agent/providers/gemini";
import * as openai from "@/lib/agent/providers/openai";

const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

export function vendorOf(model) {
  return openai.owns(model) ? "openai" : "gemini";
}

// Gemini's schema dialect uses `nullable`; strip anything Google refuses.
function geminiRequest(spec) {
  const { system, messages, tools, grounded, thinking, parts, json, temperature = 0.2 } = spec;
  let body;
  if (parts) {
    body = {
      contents: [{ role: "user", parts }],
      generationConfig: { temperature, ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}) },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
  } else {
    body = gemini.buildRequest({ system, messages, tools, grounded, thinking, temperature });
  }
  if (json) {
    body.generationConfig.responseMimeType = "application/json";
    if (json.schema) body.generationConfig.responseSchema = json.schema;
  }
  return body;
}

function openaiRequest(model, spec) {
  const { system, messages, tools, grounded, thinking, parts, json } = spec;
  let body;
  if (parts) {
    body = {
      input: [
        ...(system ? [{ role: "developer", content: system }] : []),
        { role: "user", content: openai.contentFor(parts) },
      ],
      reasoning: { effort: openai.effortFor(thinking) },
      store: false,
    };
  } else {
    body = openai.buildRequest({ system, messages, tools, thinking });
  }
  body.model = model;
  if (grounded) body.tools = [...(body.tools || []), { type: "web_search" }];
  if (json?.schema)
    body.text = { format: { type: "json_schema", name: json.name || "reading", schema: openai.strictSchema(json.schema), strict: true } };
  else if (json) body.text = { format: { type: "json_object" } };
  return body;
}

// The pages an OpenAI answer cited, in the same shape Gemini's come back in.
export function openaiSources(json) {
  const seen = new Set();
  const out = [];
  for (const item of json?.output || []) {
    for (const part of item?.content || []) {
      for (const a of part?.annotations || []) {
        if (a?.type !== "url_citation" || !a.url || seen.has(a.url)) continue;
        seen.add(a.url);
        out.push({ title: String(a.title || a.url).slice(0, 120), url: a.url });
      }
    }
  }
  return out.slice(0, 6);
}

function errorFrom(status, text) {
  let message = text;
  try {
    message = JSON.parse(text)?.error?.message || text;
  } catch {
    /* not JSON */
  }
  return String(message || "").replace(/key=[^&\s]+/g, "key=…").slice(0, 300);
}

/**
 * spec: { system, messages, tools, grounded, thinking, parts, json, temperature }
 * returns { ok, status, ms, text, calls, sources, usage, error }
 */
export async function callModel(model, spec, { timeoutMs = 55000 } = {}) {
  const vendor = vendorOf(model);
  const started = Date.now();
  const key = vendor === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, status: 0, ms: 0, error: `${vendor === "openai" ? "OPENAI" : "GEMINI"}_API_KEY is not set` };
  try {
    const res =
      vendor === "openai"
        ? await fetch(`${OPENAI_BASE}/responses`, {
            method: "POST",
            headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify(openaiRequest(model, spec)),
            signal: AbortSignal.timeout(timeoutMs),
          })
        : await fetch(`${GOOGLE}/${model}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify(geminiRequest(spec)),
            signal: AbortSignal.timeout(timeoutMs),
          });
    const ms = Date.now() - started;
    const raw = await res.text();
    if (!res.ok) return { ok: false, status: res.status, ms, error: errorFrom(res.status, raw) };
    const json = JSON.parse(raw);
    if (vendor === "openai") {
      const parsed = openai.parseResponse(json);
      const u = openai.usageFrom(json?.usage);
      return {
        ok: true, status: res.status, ms,
        text: parsed.text, calls: parsed.calls,
        sources: openaiSources(json),
        usage: {
          inputTokens: u.promptTokens || 0,
          cachedTokens: u.cachedTokens || 0,
          outputTokens: (u.candidatesTokens || 0) + (u.thoughtsTokens || 0),
          reasoningTokens: u.thoughtsTokens || 0,
          searches: (json?.output || []).filter((i) => i?.type === "web_search_call").length,
        },
        finish: parsed.finishReason,
      };
    }
    const parsed = gemini.parseResponse(json);
    const u = parsed.usage;
    return {
      ok: true, status: res.status, ms,
      text: parsed.text, calls: parsed.calls, sources: parsed.sources,
      usage: {
        inputTokens: (u.promptTokens || 0) + (u.toolTokens || 0),
        cachedTokens: u.cachedTokens || 0,
        outputTokens: (u.candidatesTokens || 0) + (u.thoughtsTokens || 0),
        reasoningTokens: u.thoughtsTokens || 0,
        // Google bills each grounded prompt that searched, not each query typed.
        searches: parsed.queries.length ? 1 : 0,
      },
      finish: parsed.finishReason,
    };
  } catch (e) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    return { ok: false, status: timedOut ? 504 : 0, ms: Date.now() - started, error: timedOut ? `No answer in ${Math.round(timeoutMs / 1000)}s` : String(e?.message || e).slice(0, 300) };
  }
}
