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
import * as anthropic from "@/lib/agent/providers/anthropic";

const GOOGLE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export function vendorOf(model) {
  if (/^claude-/.test(String(model || ""))) return "anthropic";
  return openai.owns(model) ? "openai" : "gemini";
}

// Claude 4.6 and later think adaptively and take an effort level; 4.5 and
// earlier only take a fixed thinking budget. Haiku 4.5 is the one the lab
// lists that has no effort control at all.
function claudeVersion(model) {
  const m = String(model || "").match(/^claude-[a-z]+-(\d+)(?:-(\d))?(?:-\d{8})?$/);
  return m ? Number(m[2] ? `${m[1]}.${m[2]}` : m[1]) : 0;
}
export function claudeAdaptive(model) {
  return claudeVersion(model) >= 4.6;
}

// Gemini inlineData parts -> Messages content blocks. PDFs go as documents,
// images as images; anything else is dropped rather than guessed at.
export function anthropicContent(parts = []) {
  const content = [];
  for (const part of parts) {
    if (typeof part?.text === "string") {
      if (part.text) content.push({ type: "text", text: part.text });
      continue;
    }
    const inline = part?.inlineData;
    if (!inline?.data) continue;
    const source = { type: "base64", media_type: inline.mimeType, data: inline.data };
    if (inline.mimeType === "application/pdf") content.push({ type: "document", source });
    else if (/^image\//.test(inline.mimeType || "")) content.push({ type: "image", source });
  }
  return content;
}

const JSON_ONLY = "Reply with a single JSON object and nothing else: no prose, no code fence.";

/**
 * The lab's spec as a Messages API request. `sampling` false drops the
 * temperature, for a model that refuses one.
 */
export function anthropicRequest(model, spec, { sampling = true } = {}) {
  const { system, messages, tools, grounded, thinking, parts, json, temperature = 0.2 } = spec;
  let body;
  if (parts) {
    body = { model, max_tokens: 8192, messages: [{ role: "user", content: anthropicContent(parts) }] };
    if (system) body.system = system;
  } else {
    body = anthropic.buildRequest({ system, messages, tools, model, withTemperature: false });
  }
  const level = String(thinking || "low").toLowerCase();
  const thinks = claudeAdaptive(model) || level === "high";
  if (claudeAdaptive(model)) {
    body.thinking = { type: "adaptive" };
    body.output_config = { effort: level === "high" ? "high" : "low" };
    body.max_tokens = level === "high" ? 16000 : 8192;
  } else if (level === "high") {
    // Haiku 4.5 and the other 4.5 models: a fixed budget is the only dial.
    body.thinking = { type: "enabled", budget_tokens: 4096 };
    body.max_tokens = 12288;
  } else {
    body.max_tokens = Math.max(body.max_tokens || 0, 8192);
  }
  // Sampling settings are refused alongside thinking, so a thinking request
  // goes without one; the others keep the temperature the app would send.
  if (sampling && !thinks && typeof temperature === "number") body.temperature = temperature;
  if (grounded) body.tools = [...(body.tools || []), { type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  if (json?.schema) {
    body.output_config = { ...(body.output_config || {}), format: { type: "json_schema", schema: openai.strictSchema(json.schema) } };
  } else if (json) {
    const said = typeof body.system === "string" && body.system ? `${body.system}\n\n` : "";
    body.system = `${said}${JSON_ONLY}`;
  }
  // Let the API cache the longest prefix it can, the way the other two vendors
  // do without being asked. Prompts under the model's minimum just go uncached.
  body.cache_control = { type: "ephemeral" };
  return body;
}

// The pages a Claude answer cited, in the same shape Gemini's come back in.
export function anthropicSources(json) {
  const seen = new Set();
  const out = [];
  const push = (url, title) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ title: String(title || url).slice(0, 120), url });
  };
  const blocks = Array.isArray(json?.content) ? json.content : [];
  for (const b of blocks) for (const c of b?.citations || []) if (c?.type === "web_search_result_location") push(c.url, c.title);
  for (const b of blocks) {
    if (b?.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
    for (const r of b.content) if (r?.type === "web_search_result") push(r.url, r.title);
  }
  return out.slice(0, 6);
}

/** Messages API usage in the lab's terms. Input counts cache reads and writes. */
export function anthropicUsage(u = {}) {
  const read = u.cache_read_input_tokens || 0;
  const wrote = u.cache_creation_input_tokens || 0;
  return {
    inputTokens: (u.input_tokens || 0) + read + wrote,
    cachedTokens: read,
    cacheWriteTokens: wrote,
    outputTokens: u.output_tokens || 0,
    reasoningTokens: u.output_tokens_details?.thinking_tokens || 0,
    searches: u.server_tool_use?.web_search_requests || 0,
  };
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
  const KEYS = { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };
  const key = process.env[KEYS[vendor]];
  if (!key) return { ok: false, status: 0, ms: 0, error: `${KEYS[vendor]} is not set` };
  if (vendor === "anthropic") return callClaude(model, spec, key, started, timeoutMs);
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

async function callClaude(model, spec, key, started, timeoutMs) {
  const send = (sampling) =>
    fetch(ANTHROPIC, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify(anthropicRequest(model, spec, { sampling })),
      signal: AbortSignal.timeout(Math.max(1000, timeoutMs - (Date.now() - started))),
    });
  try {
    let res = await send(true);
    let raw = await res.text();
    // Some Claude models refuse a temperature outright. Same request, without it.
    if (res.status === 400 && /temperature/i.test(raw)) {
      res = await send(false);
      raw = await res.text();
    }
    const ms = Date.now() - started;
    if (!res.ok) return { ok: false, status: res.status, ms, error: errorFrom(res.status, raw) };
    const json = JSON.parse(raw);
    const parsed = anthropic.parseResponse(json);
    return {
      ok: true, status: res.status, ms,
      text: parsed.text, calls: parsed.calls,
      sources: anthropicSources(json),
      usage: anthropicUsage(json?.usage),
      finish: parsed.finishReason,
    };
  } catch (e) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    return { ok: false, status: timedOut ? 504 : 0, ms: Date.now() - started, error: timedOut ? `No answer in ${Math.round(timeoutMs / 1000)}s` : String(e?.message || e).slice(0, 300) };
  }
}
