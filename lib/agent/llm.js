// The one door the app uses to talk to a language model.
//
// Everything above this file — the chat route, the context builder, the tool
// definitions, the stored transcript — speaks a neutral shape and knows nothing
// about any particular vendor. Switching models means adding an adapter under
// providers/ and setting LLM_PROVIDERS, not rewriting the assistant.
//
// Adapter contract:
//
//   generate({ system, messages, tools, temperature, grounded, deadline })
//     -> { text, calls, sources, model, modelIndex }
//
//     system       string, the whole system prompt
//     messages     [{ role: "user" | "assistant", text }] in chronological order
//     tools        [{ name, description, parameters }] where parameters is plain
//                  JSON Schema — no vendor wrapper
//     temperature  number
//     grounded     true when this question should be answered from the web as
//                  well as from the app. An adapter whose vendor cannot search
//                  ignores it and answers from what it knows, which is a worse
//                  answer rather than no answer.
//     deadline     epoch ms this call must be finished by
//
//     text         the assistant's reply, already trimmed
//     calls        [{ name, args }] proposed tool calls. Nothing is executed
//                  here: the route validates them and the user approves them.
//     sources      [{ title, url }] the pages a grounded answer leaned on, or []
//     refusals     [{ model, status, quotaId, quotaMetric, quotaValue, retryMs,
//                  searchQuota }] every refusal survived on the way to this
//                  answer, so the app can say later why it could not search
//     searched     true only when the web really was searched for this answer.
//                  False when grounded was asked for and could not be had —
//                  the vendor cannot search, or the search allowance is spent —
//                  so the caller can say so rather than passing off a
//                  half-remembered price as something it just looked up
//     model        which model actually answered, after any fallback
//     modelIndex   its position in that adapter's own list, 0 for first choice
//
//   modelList()   -> the model ids this adapter would try, in order
//
//   Any failure throws ModelError with an HTTP-ish `status`.

import { ModelError } from "./model-error";
import * as anthropic from "./providers/anthropic";
import * as gemini from "./providers/gemini";
import * as openai from "./providers/openai";

export { ModelError };

const PROVIDERS = { anthropic, gemini, openai };

// The route this runs inside is killed at 60s, and a killed route reaches the
// browser as a dead connection rather than a message, so the whole ladder has to
// finish inside a budget of our own with room left for the database writes.
export const TOTAL_BUDGET_MS = 46000;
// Below this there is no point starting another vendor.
const MIN_PROVIDER_MS = 9000;
// What the first vendor may spend of what is left, so a vendor that is timing out
// cannot eat the whole budget and leave the fallback no room to answer. The last
// vendor in the chain gets everything that remains.
const FIRST_SHARE = 0.6;

// Which vendors to try, in order. LLM_PROVIDERS takes a comma-separated chain;
// LLM_PROVIDER stays supported because that is what is set in Vercel today.
export function providerNames() {
  const chain = (process.env.LLM_PROVIDERS || "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (chain.length) return chain;
  const single = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  return [single || "gemini"];
}

/** Kept for the diagnostics line: the first vendor in the chain. */
export function providerName() {
  return providerNames()[0];
}

// Worth trying the next vendor: out of quota, over capacity, key rejected, or
// simply unreachable. A 400 is our own malformed request and a 413 is a reply
// that ran past its own ceiling — another vendor would fail the same way.
const TRY_NEXT_PROVIDER = new Set([403, 429, 500, 502, 503, 504]);

export async function generate({
  system,
  messages,
  tools,
  temperature = 0.2,
  grounded = false,
  deadline = Date.now() + TOTAL_BUDGET_MS,
}) {
  return runChain(providerNames(), PROVIDERS, {
    system,
    messages,
    tools,
    temperature,
    grounded,
    deadline,
  });
}

// The ladder itself, with the vendor map passed in rather than reached for, so
// the harness can drive it with vendors that fail on command instead of needing
// four API keys and a Google outage to test what happens on a Google outage.
export async function runChain(names, lookup, request) {
  const chain = Array.isArray(names) ? names : [];
  const unknown = chain.filter((n) => !lookup[n]);
  if (unknown.length) {
    throw new ModelError(
      `No model adapter for ${unknown.join(", ")}. Known: ${Object.keys(
        lookup,
      ).join(", ")}.`,
      500,
    );
  }
  if (!chain.length) {
    throw new ModelError("No model provider is configured.", 500);
  }

  const deadline = request.deadline;
  let skipped = 0;
  // Refusals gathered from vendors that have already turned us away, so the
  // failure that reaches the app carries all of them and not just the last.
  let refused = [];
  let last = new ModelError("The assistant could not be reached.", 502);

  for (let i = 0; i < chain.length; i++) {
    const provider = lookup[chain[i]];
    const remaining = deadline - Date.now();
    // Not enough left to be worth starting: better to report the failure we
    // already have than to open a call that will be cut off mid-sentence.
    if (remaining < MIN_PROVIDER_MS) break;
    const isLast = i === chain.length - 1;
    const share = isLast ? remaining : Math.round(remaining * FIRST_SHARE);

    try {
      const result = await provider.generate({
        ...request,
        deadline: Date.now() + Math.max(share, MIN_PROVIDER_MS),
      });
      return {
        ...result,
        // Every caller can read this without checking which vendor answered.
        sources: Array.isArray(result.sources) ? result.sources : [],
        searched: result.searched === true,
        refusals: [
          ...refused,
          ...(Array.isArray(result.refusals) ? result.refusals : []),
        ],
        provider: chain[i],
        // How far down the whole ladder the answer came from, counting every
        // model of every vendor ahead of it.
        fallbackDepth: skipped + (result.modelIndex || 0),
      };
    } catch (err) {
      const status = err instanceof ModelError ? err.status : 502;
      last = err instanceof ModelError ? err : new ModelError(err.message, 502);
      last.refusals = [...refused, ...(err.refusals || [])];
      refused = last.refusals;
      if (!TRY_NEXT_PROVIDER.has(status)) throw last;
      skipped += provider.modelList ? provider.modelList().length : 1;
    }
  }

  throw last;
}
