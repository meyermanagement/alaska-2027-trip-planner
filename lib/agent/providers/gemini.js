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
//   gemini-3.8-flash       newer still, and it answered every probe on
//                          2026-09-03 -- correct tool call, correct trip id, and
//                          the fastest of the three. Left out only because
//                          putting two new models in at once makes the next
//                          regression unattributable. It is on the check page.
//
// Back at the head of the ladder on 2026-09-03, having been out since 27 August.
// It was taken out for a hundred seconds of silence and an empty 502, diagnosed
// on 31 August as capacity rather than breakage -- Google's own "experiencing
// high demand" sentence, and a 429 on a spent free-tier day. Asked again today
// against this project's own key it answered every time: three tool-calling
// probes in about a second each, all four required arguments right including the
// trip id; it declined to invent an id for a row that does not exist and said so
// in words; two grounded searches came back in 2.8 and 4.0 seconds against 5.1
// and 5.3 for 3.6. Faster than what it replaces, on every probe.
//
// Safe to have first now in a way it was not in August: a 503 carrying that
// sentence is worth exactly one more go before the next model down (see
// HIGH_DEMAND), so a model that goes busy again costs a second, not a look.
const DEFAULT_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];

// Names worth asking about even though they are not in the ladder, so the check
// page can say what they do today rather than what they did the week they were
// taken out. A model shelved for being silent, or for a spent daily allowance, is
// not shelved forever, and the only way to know is to ask it.
export const SHELVED_MODELS = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];

/** Every name worth probing: the ladder as it stands, then the shelved ones. */
export function candidateModels() {
  const ladder = modelList();
  return [
    ...ladder.map((model) => ({ model, inLadder: true })),
    ...SHELVED_MODELS.filter((model) => !ladder.includes(model)).map(
      (model) => ({ model, inLadder: false }),
    ),
  ];
}

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Worth retrying the same model: transient server-side hiccups.
const RETRYABLE = new Set([500, 502, 503, 504]);
// Quota is tracked per model, so a 429 means move on rather than wait.
const NEXT_MODEL = new Set([429]);

// Google's own words for a model that is over capacity right now:
//   "This model is currently experiencing high demand. Spikes in demand are
//    usually temporary. Please try again later."
//
// It arrives as a 503, which the list above calls retryable, and it is worth
// exactly one more go rather than three. A brief overload does clear in under a
// second and a second attempt often lands -- but a model that says this twice is
// not going to say anything else, and asking it a third time spends the allowance
// the next model down needed. "Try again later" cannot be obeyed inside one
// request, and the next model is the nearest thing to later that is available.
//
// This is what gemini-3.7-flash was doing on 27 August, misread as silence: it
// was first in the list, retried three times before anything else was tried, and
// every look timed out. Measured again on 31 August it says the same thing, so
// it stays out of the ladder -- but as a model over capacity, not a dead one.
const HIGH_DEMAND = /high demand|over ?capacity|overloaded|try again later/i;

/**
 * Is this failure one that goes away on its own?
 *
 * A spent daily allowance and a demand spike both come back without anybody
 * changing anything. A 400 about the request shape and a rejected key do not.
 * Told apart because "wait" and "fix it" are different instructions, and a page
 * that paints them the same colour gets a working model shelved.
 */
export function comesBackOnItsOwn(status, message = "") {
  if (status === 429) return true;
  return status >= 500 && HIGH_DEMAND.test(String(message));
}

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
// What one model may spend of the time that is left, when there is another model
// behind it.
//
// The reason this exists: a model that goes quiet for its whole allowance is
// already handled -- it gets no second go, because another model that answers is
// worth more than the same silence twice. But it was allowed to spend every
// millisecond of the turn first, so by the time we came to ask the next model
// there was nothing left to ask it with, and the request failed having tried one
// model once. On a turn given 40 seconds the row read "No reply within 39999ms"
// and gemini-3.5-flash-lite, which exists for exactly this, was never called.
//
// So a model with a successor gets a share and not the lot. The last model in the
// list still gets everything that remains, because there is nobody left to save
// it for.
const MODEL_SHARE = 0.55;

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
  // Names to pass over on a retry. See lib/agent/llm.js.
  avoid = [],
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

  // Why a model was passed over, written down whatever the reason was.
  //
  // This used to record 429 and nothing else, and the cost of that showed up on
  // 31 August: a question was answered by the second model down the ladder, in
  // 22.7 seconds, and there is no record anywhere of what the first one did. Not
  // a timeout, not a 503, not silence -- nothing. So the honest answer to "why
  // did gemini-3.6-flash fail?" was that it cannot be known, which is a poor
  // answer to have to give twice.
  //
  // A quota refusal still carries its allowance details; everything else carries
  // the status and Google's own words, which is all there ever is.
  const skipped = (status, detail, extra = {}) => {
    refusals.push({
      model,
      status,
      grounded: grounded && !searchDropped,
      quotaId: null,
      quotaMetric: null,
      quotaValue: null,
      retryMs: null,
      searchQuota: false,
      ...extra,
      detail: String(detail || "").slice(0, 300),
    });
  };

  const left = () => deadline - Date.now();

  const all = modelList();
  const dodge = new Set(Array.isArray(avoid) ? avoid : []);
  const rest = all.filter((m) => !dodge.has(m));
  // Passing over every model is not an option: a thin answer from the same model
  // beats no answer at all.
  const models = rest.length ? rest : all;
  // Read by skipped() above, so it always names the model being tried.
  let model = "";
  outer: for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    model = models[modelIndex];
    // Per model, not per request: one busy model having used up its second go is
    // no reason to deny the next one its own.
    let askedTheBusyOne = false;
    const isLastModel = modelIndex === models.length - 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = left();
      if (remaining < MIN_ATTEMPT_MS) {
        ranOutOfTime = true;
        break outer;
      }
      // Hold time back for whoever is next, unless nobody is. Never below the
      // floor that makes a call worth starting: a share so small it cannot
      // finish anything is worse than one honest attempt.
      const allowed = Math.min(
        ATTEMPT_CAP_MS,
        isLastModel
          ? remaining
          : Math.max(MIN_ATTEMPT_MS, Math.round(remaining * MODEL_SHARE)),
      );
      let res;
      try {
        res = await fetch(`${BASE}/${model}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(allowed),
        });
      } catch (reached) {
        lastMessage = "The assistant timed out. Try again.";
        lastStatus = 504;
        // Either it went quiet until the clock ran out, or the request never got
        // there. Both look identical to the family and are opposites to fix, so
        // the name of the error is kept.
        skipped(
          504,
          `No reply within ${allowed}ms of ${remaining}ms left (${
            reached?.name || "unknown error"
          })`,
        );
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
          skipped(413, "Hit the output ceiling mid-answer (MAX_TOKENS)");
          const tooBig = new ModelError(
            "That was too much to work out in one go. Send it in two halves and I will handle each one.",
            413,
          );
          // Carried on the error, or the record of what happened dies with it.
          tooBig.refusals = refusals;
          throw tooBig;
        }
        // Two hundred, and empty: no words and no tool call. Returning this is
        // worse than an error, because an error moves down the ladder and this
        // does not -- it arrives at the route looking like a considered answer
        // with nothing in it, and the route can only shrug. So it is a failure,
        // and the next model gets the question.
        //
        // Text with no call is not this. Neither is a call with no text: she
        // calls a tool and says nothing all the time, and that is an answer.
        if (!parsed.text && !parsed.calls.length) {
          lastMessage = silenceReason(parsed.finishReason);
          lastStatus = 502;
          // The reason is worth having when someone reports this, and by the
          // time they do the response is long gone.
          console.warn(
            `[gemini] ${model} answered with nothing (finishReason=${parsed.finishReason || "none"})`,
          );
          skipped(
            502,
            `200 with nothing in it (finishReason=${parsed.finishReason || "none"})`,
          );
          // No second go at the same model. Whatever it did, it did deliberately
          // at temperature 0.2, and it will do it again.
          break;
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

      // Everything that is not a quota refusal: 500s, 503 high demand, a 404 for
      // a model name that no longer exists, a 400 about the request shape.
      if (res.status !== 429) skipped(res.status, message);

      if (res.status === 400 || res.status === 403) {
        const refused = new ModelError(
          res.status === 403
            ? "The Gemini API key was rejected. Check the key in Vercel."
            : message,
          res.status,
        );
        refused.refusals = refusals;
        throw refused;
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
      // Over capacity. One more go, then the next model -- never a third.
      if (res.status >= 500 && HIGH_DEMAND.test(message)) {
        if (askedTheBusyOne) {
          console.warn(`[gemini] ${model} is over capacity: ${message}`);
          break;
        }
        askedTheBusyOne = true;
        await sleep(700);
        continue;
      }
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

/**
 * Why a response came back with nothing in it.
 *
 * Gemini answers 200 with no content parts in several situations, and the app
 * used to hand every one of them back as a finished answer. What the family saw
 * was "I am not sure how to help with that yet." for a request the model had
 * understood perfectly well and then failed to serialize.
 *
 * MALFORMED_FUNCTION_CALL is the one worth naming: it means the model decided
 * which tool to call and then wrote the call badly enough that Google would not
 * pass it on. Nothing about the wording of the request is wrong when that
 * happens, so telling the family to rephrase would be a lie -- another model is
 * the fix, and that is what the caller does with this.
 */
export function silenceReason(finishReason) {
  switch (String(finishReason || "").toUpperCase()) {
    case "MALFORMED_FUNCTION_CALL":
      return "The assistant garbled the change it was trying to make.";
    case "SAFETY":
    case "PROHIBITED_CONTENT":
    case "BLOCKLIST":
      return "The assistant stopped itself answering that.";
    case "RECITATION":
      return "The assistant stopped because its answer was quoting a source too closely.";
    default:
      return "The assistant came back with nothing at all.";
  }
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

/**
 * One question, one named model, no ladder and no retries.
 *
 * The adapter's own generate() walks its list, which is exactly what you do not
 * want when the question is "what does this particular model do today". Used by
 * /api/model-check to give each name its own verdict, including the ones that are
 * not in the ladder. This is how gemini-3.7-flash got back in: taken out on 27
 * August after a hundred seconds of silence and an empty 502, then asked here on
 * 31 August and again on 3 September, which is what told capacity apart from
 * breakage. A model refused for a spent daily allowance, or for a demand spike,
 * comes back tomorrow, and nothing else in the app ever asks it.
 *
 * Never throws. Returning the failure is the whole point.
 */
export async function tryModel({
  model,
  system = "Reply with one short sentence of plain text.",
  messages = [{ role: "user", text: "Say the word ready." }],
  tools = [],
  temperature = 0,
  grounded = false,
  budgetMs = 15000,
}) {
  const key = process.env.GEMINI_API_KEY;
  const started = Date.now();
  if (!key) {
    return {
      model,
      ok: false,
      status: 503,
      message: "GEMINI_API_KEY is not set in this deployment.",
      ms: 0,
    };
  }
  const body = buildRequest({ system, messages, tools, temperature, grounded });
  let res;
  try {
    res = await fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(budgetMs),
    });
  } catch (reached) {
    return {
      model,
      ok: false,
      status: 504,
      // Silence for the whole allowance is what got this model shelved, so the
      // wait is worth reporting as a number rather than as a word.
      message: `No reply within ${budgetMs}ms (${reached?.name || "unknown error"})`,
      ms: Date.now() - started,
    };
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    let quota = { id: "", metric: "", limit: null, retryMs: null };
    try {
      const errJson = await res.json();
      message = errJson?.error?.message || message;
      quota = quotaDetail(errJson);
    } catch {
      /* non-JSON error body */
    }
    return {
      model,
      ok: false,
      status: res.status,
      message,
      quotaId: quota.id || null,
      quotaMetric: quota.metric || null,
      quotaValue: quota.limit,
      retryMs: quota.retryMs,
      ms: Date.now() - started,
    };
  }
  let parsed;
  try {
    parsed = parseResponse(await res.json());
  } catch {
    return {
      model,
      ok: false,
      status: 502,
      message: "The reply could not be read as JSON.",
      ms: Date.now() - started,
    };
  }
  const said = String(parsed.text || "").trim();
  const calls = (parsed.calls || []).map((c) => c.name);
  return {
    model,
    // Two hundred with nothing in it is not an answer, and treating it as one is
    // how a dud model kept its place in the ladder for a week.
    ok: Boolean(said || calls.length),
    status: res.status,
    message:
      said || calls.length
        ? ""
        : `200 with nothing in it (finishReason=${parsed.finishReason || "none"})`,
    said: said.slice(0, 200),
    called: calls,
    searched: (parsed.queries || []).length > 0,
    queries: parsed.queries || [],
    ms: Date.now() - started,
  };
}
