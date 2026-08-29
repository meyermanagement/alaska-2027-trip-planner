// Gemini adapter. Translates the neutral request shape defined in lib/agent/llm.js
// into Google's generateContent format and back again.
//
// Falls back across models because the flash models intermittently return 503
// "high demand", and because quota is tracked per model.

import { ModelError, tooSlow } from "../model-error";

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
//   gemini-3.7-flash       measured 2026-08-27 against this project's own key it
//                          answers nothing at all: a hundred seconds of silence
//                          and then an empty 502, for a grounded look, for the
//                          same look without search, and for the words "say the
//                          word ready". It was first in this list, retried three
//                          times before anything else was tried, which is exactly
//                          why every look was timing out. Put it back — first, or
//                          anywhere — with GEMINI_MODELS once it answers.
const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Worth retrying the same model: transient server-side hiccups.
const RETRYABLE = new Set([500, 502, 503, 504]);
// Quota is tracked per model, so a 429 means move on rather than wait.
const NEXT_MODEL = new Set([429]);

// What to say when Google turns us away for quota. Google's own wording is
// "You exceeded your current quota, please check your plan and billing details",
// which tells a family planning a holiday nothing at all.
const OUT_OF_QUOTA =
  "Google has stopped answering for now \u2014 this Gemini account has used up its allowance. Daily allowances reset at midnight Pacific time; if it keeps happening, the key needs billing turned on.";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// What Google put in the 429 beyond the sentence. Which allowance ran out is in
// the details, not the message, and without it a refusal is unexplainable: a
// burst of questions in one minute and a search allowance spent for the month
// arrive as the same English.
export function quotaDetail(errJson) {
  const details = Array.isArray(errJson?.error?.details)
    ? errJson.error.details
    : [];
  const out = { id: "", metric: "", limit: null, retryMs: null };
  for (const d of details) {
    const type = String(d?.["@type"] || "");
    if (type.includes("QuotaFailure")) {
      const v = Array.isArray(d.violations) ? d.violations[0] : null;
      if (v) {
        out.id = String(v.quotaId || "");
        out.metric = String(v.quotaMetric || "");
        const limit = Number(v.quotaValue);
        out.limit = Number.isFinite(limit) ? limit : null;
      }
    }
    if (type.includes("RetryInfo")) {
      // "7s", "1.5s", or occasionally missing a unit.
      const m = /([\d.]+)s/.exec(String(d.retryDelay || ""));
      if (m) out.retryMs = Math.round(parseFloat(m[1]) * 1000);
    }
  }
  return out;
}

// Whether the allowance that ran out is the one for searching, as opposed to the
// one for asking anything at all. Google names it in the quota id or the metric.
export function isSearchQuota({ id, metric } = {}) {
  return /ground|search/i.test(`${id} ${metric}`);
}

// The longest we will sit and wait out a per-minute burst before giving up on the
// search. Longer than this and the family is staring at a spinner.
const MAX_WAIT_MS = 6000;

// The caller owns the clock: lib/agent/llm.js hands down an absolute deadline so
// several vendors can share one budget. This default only applies when the
// adapter is called directly, as the test harness does.
const OWN_BUDGET_MS = 46000;
// Below this there is no point starting another call.
const MIN_ATTEMPT_MS = 8000;
// The longest any one model is given before we stop waiting on it. This is a
// ceiling on top of the caller's deadline, not instead of it -- the call gets
// whichever is smaller -- so raising it only lets a call run longer when the
// caller had the time to give anyway.
//
// Was 45 seconds, which was under the tail. Thirteen timed grounded tips calls on
// the real trips came back in 7, 13, 15, 15, 22, 22, 29, 29, 29, 31, 38, 65 and
// 74 seconds, so 45 was cutting off honest answers that were still coming. 70
// clears all but the slowest of those and still keeps the point of having a cap:
// the model that broke every look sat silent for a hundred seconds, and below
// this ceiling a dud model costs one slot rather than the whole look.
const ATTEMPT_CAP_MS = 70000;

/** The models this adapter would try, in order. */
export function modelList() {
  return MODELS.length ? [...MODELS] : [...DEFAULT_MODELS];
}

// Neutral request -> Gemini request. Exported so the test harness exercises the
// same translation the app uses rather than a copy of it.
export function buildRequest({
  system,
  messages,
  tools,
  temperature = 0.2,
  grounded = false,
  thinking = null,
}) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: (messages || []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    })),
    generationConfig: {
      temperature,
      // How long it may think before it answers. Left alone, Gemini spends
      // thousands of tokens deliberating over a tip about a pocket knife, and on
      // the questions this app asks that time buys nothing: measured on the real
      // packing list, thinking freely took 28 seconds and searched nothing, while
      // "low" took 18 and ran four searches. Searching is what makes a tip worth
      // reading, so the time is better spent there.
      ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
    },
  };
  if (tools?.length) {
    body.tools = [{ functionDeclarations: tools }];
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  // Google's own search, run on their side of the wire, which is what the Gemini
  // app is doing when it names four restaurants and shows you where it read
  // about them. Only asked for on the questions that need it: it costs a few
  // seconds and it is the difference between an answer and a guess.
  //
  // Mixing a built-in tool with our own function declarations is refused outright
  // unless includeServerSideToolInvocations is set - the API says so in the 400.
  if (grounded) {
    body.tools = [...(body.tools || []), { google_search: {} }];
    body.toolConfig = {
      ...(body.toolConfig || {}),
      includeServerSideToolInvocations: true,
    };
  }
  return body;
}

export async function generate({
  system,
  messages,
  tools,
  temperature = 0.2,
  grounded = false,
  thinking = null,
  deadline = Date.now() + OWN_BUDGET_MS,
}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new ModelError(
      "The assistant is not configured yet — GEMINI_API_KEY is missing.",
      503,
    );
  }

  let body = buildRequest({
    system,
    messages,
    tools,
    temperature,
    grounded,
    thinking,
  });
  // Set once search has been given up on, so the reply can own up to it.
  let searchDropped = false;
  // A per-minute burst is worth waiting out once. A spent allowance is not.
  let waited = false;
  // Every refusal, kept so the app can record why an answer came back without
  // having checked the web. A log line is gone by the time anyone asks.
  const refusals = [];

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
          signal: AbortSignal.timeout(Math.min(ATTEMPT_CAP_MS, remaining)),
        });
      } catch {
        lastMessage = "The assistant timed out. Try again.";
        lastStatus = 504;
        // A model that went quiet for its whole allowance gets no second go on
        // this request. Another model that answers is worth more than the same
        // silence twice.
        break;
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
        return {
          ...parsed,
          searched: grounded && !searchDropped,
          // Available is not the same as used.
          queries: parsed.queries || [],
          refusals,
          model,
          modelIndex,
        };
      }

      let message = `Request failed (${res.status}).`;
      let quota = { id: "", metric: "", limit: null, retryMs: null };
      let spoke = false;
      try {
        const errJson = await res.json();
        spoke = Boolean(errJson);
        message = errJson?.error?.message || message;
        quota = quotaDetail(errJson);
      } catch {
        /* non-JSON error body */
      }
      lastMessage = message;
      lastStatus = res.status;

      // Written to the server log, never to the family. Which allowance, what it
      // is capped at, and whether the search was what pushed us over: the only
      // way to tell a spent monthly search allowance from a fast typist.
      if (res.status === 429) {
        refusals.push({
          model,
          status: res.status,
          grounded: grounded && !searchDropped,
          quotaId: quota.id || null,
          quotaMetric: quota.metric || null,
          quotaValue: quota.limit,
          retryMs: quota.retryMs,
          searchQuota: isSearchQuota(quota),
          // Google's own words. When the details are empty - which is what a
          // project that is not allowed to search at all comes back with - the
          // sentence is the only evidence there is.
          detail: String(message).slice(0, 300),
        });
        console.warn(
          "[gemini] refused 429",
          JSON.stringify({
            model,
            grounded: grounded && !searchDropped,
            quotaId: quota.id || null,
            quotaMetric: quota.metric || null,
            quotaValue: quota.limit,
            retryMs: quota.retryMs,
            searchQuota: isSearchQuota(quota),
          }),
        );
      }

      if (res.status === 400 || res.status === 403) {
        throw new ModelError(
          res.status === 403
            ? "The Gemini API key was rejected. Check the key in Vercel."
            : message,
          res.status,
        );
      }
      // Out of quota, on a question we wanted searched. Search is the likeliest
      // thing to have run out: it has its own, much smaller allowance, and on
      // Google's free tier the Gemini 3 models cannot search at all, so a
      // grounded call there is refused every single time. Every other model in
      // the ladder draws on the same search allowance and would fail the same
      // way, so rather than spend the budget proving that, drop the search and
      // ask this same model again. An answer from what Aly already knows, said
      // plainly to be that, beats an error message.
      // Refused after only a moment, and told to come back in a few seconds: this
      // is a burst, not an empty allowance. Wait it out once and keep the search
      // rather than quietly downgrading the answer because someone typed fast.
      if (
        res.status === 429 &&
        !waited &&
        quota.retryMs !== null &&
        quota.retryMs <= MAX_WAIT_MS &&
        left() > quota.retryMs + MIN_ATTEMPT_MS
      ) {
        waited = true;
        await sleep(quota.retryMs + 250);
        attempt--;
        continue;
      }
      if (res.status === 429 && grounded && !searchDropped) {
        searchDropped = true;
        body = buildRequest({
          system,
          messages,
          tools,
          temperature,
          grounded: false,
          thinking,
        });
        attempt--;
        continue;
      }
      if (NEXT_MODEL.has(res.status)) break;
      // A server error with nothing in it at all is not a hiccup, it is a model
      // that is not going to answer. Asking it twice more is how a single dud
      // model spends the whole allowance and the look times out with no tips and
      // no explanation. Try the next model instead.
      if (!spoke && res.status >= 500) break;
      if (!RETRYABLE.has(res.status)) break;
      await sleep(600 * (attempt + 1));
    }
  }

  if (ranOutOfTime) {
    const timeout = tooSlow();
    timeout.refusals = refusals;
    throw timeout;
  }
  const failure =
    lastStatus === 429
      ? new ModelError(OUT_OF_QUOTA, 429)
      : new ModelError(lastMessage, lastStatus);
  failure.refusals = refusals;
  throw failure;
}

// Gemini response -> neutral result.
export function parseResponse(json) {
  const candidate = json?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const calls = [];
  let text = "";
  // A grounded answer comes back with the search Google ran and the pages it
  // read. Both are worth keeping: the family should be able to see where a
  // restaurant recommendation came from, and check it.
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
  return {
    text: text.trim(),
    calls,
    sources: sourcesFrom(candidate?.groundingMetadata),
    // What Google actually typed into its own search box. Empty means the model
    // had the search tool available and chose not to reach for it, which is a
    // different thing from being refused, and only this tells them apart.
    queries: queriesFrom(candidate?.groundingMetadata),
    finishReason: candidate?.finishReason,
  };
}

// The searches Google ran on our behalf, as it reported them.
export function queriesFrom(metadata) {
  const asked = metadata?.webSearchQueries;
  if (!Array.isArray(asked)) return [];
  return asked
    .filter((q) => typeof q === "string" && q.trim())
    .slice(0, 8)
    .map((q) => q.trim().slice(0, 120));
}

// The pages behind a grounded answer, deduplicated and capped.
//
// The uri is Google's redirect rather than the site itself, which is what their
// terms require you to link to, and it stops working after about a month. So it
// is stored as a convenience, not as a citation that will keep: the title is the
// part that stays readable.
export function sourcesFrom(metadata) {
  const chunks = metadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set();
  const sources = [];
  for (const chunk of chunks) {
    const url = chunk?.web?.uri;
    const title = chunk?.web?.title;
    if (typeof url !== "string" || !url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: String(title || url).slice(0, 120), url });
    if (sources.length >= 6) break;
  }
  return sources;
}
