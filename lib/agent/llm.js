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
import { liftSpokenCalls } from "./spoken";

export { ModelError };

const PROVIDERS = { anthropic, gemini, openai };

// The one provider the consent screen names, and therefore the only one an
// account's text may reach.
//
// lib/beta/agreement.js says "Google Gemini API" and the stored consent row keeps
// ai_provider alongside the answer, so a tester's permission is specific: they
// agreed to Google, on servers in the United States, under the paid API terms
// they were shown. LLM_PROVIDERS was built before that screen existed and would
// happily put Anthropic or OpenAI at the front of the chain -- a second processor
// nobody disclosed and nobody consented to, added by an environment variable.
//
// So the chain is filtered here rather than trusted. Adding a provider is now a
// code change that has to move AI_PROVIDER, the disclosure list, the privacy
// section and the version constants with it, which is the right amount of
// friction for adding a company to the list of people who see a family's travel.
// The adapters stay: runChain is still vendor-neutral, and the harness drives it
// directly with whatever it likes.
export const DISCLOSED_PROVIDER = "gemini";

// A killed route reaches the browser as a dead connection rather than a message,
// so the ladder finishes inside a budget of its own with room left for the
// database writes. This is only the fallback for a caller that passes no
// deadline: the chat route works out its own clock and passes it in, and this
// number does not cap it. It used to say the route is killed at 60s, which was
// true when it was written and is not now.
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
  const single = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  const asked = chain.length ? chain : [single || DISCLOSED_PROVIDER];
  // Whatever the environment asks for, only the disclosed provider is reachable.
  // Filtered rather than rejected so a stale LLM_PROVIDERS in Vercel degrades to
  // the right behavior instead of taking Aly down.
  const allowed = asked.filter((name) => name === DISCLOSED_PROVIDER);
  return allowed.length ? allowed : [DISCLOSED_PROVIDER];
}

/**
 * What the environment asked for that the disclosure does not cover.
 *
 * Nothing reads this to make a decision -- it exists so the diagnostics screen
 * can say out loud that a configured provider is being ignored, rather than
 * leaving somebody to wonder why LLM_PROVIDERS has three names in it and every
 * answer comes from Google.
 */
export function undisclosedProviders() {
  const chain = (process.env.LLM_PROVIDERS || "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const single = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  const asked = chain.length ? chain : single ? [single] : [];
  return asked.filter((name) => name && name !== DISCLOSED_PROVIDER);
}

/** Kept for the diagnostics line: the first vendor in the chain. */
export function providerName() {
  return providerNames()[0];
}

// Worth trying the next vendor: out of quota, over capacity, key rejected, or
// simply unreachable. A 400 is our own malformed request and a 413 is a reply
// that ran past its own ceiling — another vendor would fail the same way.
const TRY_NEXT_PROVIDER = new Set([403, 429, 500, 502, 503, 504]);

/**
 * An answer with nothing in it.
 *
 * No words and no tool call is not a reply, whatever status code carried it. The
 * ladder used to return the first of these it got, so a vendor could fail by
 * saying nothing and the four models behind it were never asked -- and what
 * arrived at the screen was the route's last-resort line, which blames the
 * question rather than the vendor.
 *
 * A call with no words is a real answer and common: she saves something and lets
 * the receipt speak. Words with no call is obviously an answer. Only the pair of
 * absences counts.
 */
export function isSilent(result) {
  if (!result) return true;
  const said = String(result.text || "").trim();
  const called = Array.isArray(result.calls) ? result.calls.length : 0;
  return !said && !called;
}

/**
 * The part that makes the AI consent screen mean something.
 *
 * A screen that asks permission and a system that sends the text anyway is worse
 * than not asking, and routing alone cannot prevent it: nothing about a redirect
 * stops the nightly reminder run, the tip generator, or a background estimate
 * from reaching a vendor on behalf of somebody who said no. So the refusal lives
 * at the one door every one of them goes through.
 *
 * Asked here rather than threaded down from each caller because there are more
 * than a dozen callers and a permission that has to be remembered in fourteen
 * places is a permission that will be forgotten in one. The session is read from
 * the request's own cookies, so this is the caller's own consent and the
 * database's own policy decides what comes back.
 *
 * No session used to mean carry on, and that was the hole. The reasoning was that
 * the nightly run and the inbound mail webhook are machines acting for a
 * household whose consent was recorded when a member of it walked the screens --
 * but the check they were exempted from is the one that reads whether that
 * consent is still given. A withdrawal in Settings stopped a person's own
 * questions and nothing else, while the privacy policy says in plain words that
 * turning Aly off stops the overnight jobs too. A shared secret proves the caller
 * is us; it says nothing about whether the household said yes.
 *
 * So no person means refuse, and a caller without a session has to name the
 * person whose consent covers the work: generate({ consentFor: userId }). That row
 * is read with the service key, because a cron job has no cookies to read it
 * with -- naming a user id is an assertion that the work is for that household,
 * and the assertion is checked rather than believed.
 *
 * One escape, for the harness in scripts/ that runs on a laptop against a JSON
 * dump with no session and no household: AI_HARNESS=1, and only where nothing
 * indicates a deployment. It cannot be switched on from the Vercel dashboard by
 * accident, because being on Vercel at all disqualifies it.
 *
 * Returns whoever it just established, and the client it established them with,
 * so the caller can write down what the call cost without asking the same two
 * questions over again. Nulls where the harness let it through and there is
 * nobody to attribute anything to.
 */
async function refuseWithoutConsent(consentFor = null) {
  let supabase = null;
  let me = null;
  let aiAllowed = null;

  try {
    // Reached for here rather than imported at the top, because the chain of
    // imports behind createClient ends at next/headers, and the eval harness and
    // the nightly job load this file outside any request. A static import would
    // make them pay for a cookie jar that does not exist.
    const consent = await import("@/lib/beta/consent");
    aiAllowed = consent.aiAllowed;
  } catch {
    // The consent module itself would not load, so nothing can be checked.
    // Refusing is the only safe answer: a permission that fails open is not one.
    throw new ModelError(
      "Aly could not check this account's AI permission, so nothing was sent.",
      503,
    );
  }

  // A request session, when there is one. The ordinary case: somebody asked Aly
  // something, and their own cookies decide what the database hands back.
  try {
    const [{ createClient }, { whoIs }] = await Promise.all([
      import("@/lib/supabase/server"),
      import("@/lib/supabase/who"),
    ]);
    supabase = await createClient();
    me = await whoIs(supabase);
  } catch {
    supabase = null;
    me = null;
  }

  if (me?.id) {
    if (await aiAllowed(supabase, me.id)) return { supabase, userId: me.id };
    throw new ModelError(
      "Aly is turned off for this account. Turn on AI assistance in Settings to ask her something.",
      403,
    );
  }

  // No session, so either the caller named somebody or nothing is sent.
  const onBehalfOf = String(consentFor || "").trim();
  if (onBehalfOf) {
    let admin = null;
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      admin = createAdminClient();
    } catch {
      admin = null;
    }
    if (!admin) {
      throw new ModelError(
        "Aly could not check that household's AI permission, so nothing was sent.",
        503,
      );
    }
    if (await aiAllowed(admin, onBehalfOf))
      return { supabase: admin, userId: onBehalfOf };
    throw new ModelError(
      "AI assistance is turned off for that household, so this background job sent nothing.",
      403,
    );
  }

  if (harnessAllowed()) return { supabase: null, userId: null };

  throw new ModelError(
    "No account was named for this request, so there is no AI permission to check and nothing was sent.",
    403,
  );
}

/**
 * The developer harness, and nothing that could be mistaken for production.
 *
 * VERCEL is set on every Vercel runtime including previews, so this is off
 * anywhere the app is really deployed, whatever the flag says.
 */
function harnessAllowed() {
  return process.env.AI_HARNESS === "1" && !process.env.VERCEL;
}

export async function generate({
  system,
  messages,
  tools,
  temperature = 0.2,
  grounded = false,
  // "low" or "high" where the vendor understands it, and ignored where it does
  // not. Passed through rather than decided here: the caller knows whether the
  // question is worth deliberating over.
  thinking = null,
  deadline = Date.now() + TOTAL_BUDGET_MS,
  // Model ids to pass over if there is anything else to try. A retry exists
  // because the first answer was wrong in some particular way, and asking the
  // same model the same question at the same temperature is how a retry comes
  // back with the same wrong answer. Ignored when it would leave nothing to ask.
  avoid = [],
  // Whose consent covers this call, for a caller with no request session: the
  // nightly jobs, the inbound mail webhook, anything queued. Ignored when there
  // is a session, because then the session is the answer and a caller naming
  // somebody else would be a way around that person's own refusal.
  consentFor = null,
  // Which part of the app is asking, in dotted form: chat.answer, tips.trip,
  // wallet.offers. Written against the token counts so the monthly bill can be
  // read by feature rather than reasoned about from the shape of the code. Named
  // here rather than guessed from a stack trace because the answer has to survive
  // a refactor, and because two features often share a route.
  feature = null,
}) {
  const who = await refuseWithoutConsent(consentFor);
  const request = {
    system,
    messages,
    tools,
    temperature,
    grounded,
    thinking,
    deadline,
    avoid,
  };
  try {
    const result = await runChain(providerNames(), PROVIDERS, request);
    await recordSpend(who, feature, result.usage);
    return result;
  } catch (err) {
    // A failed call is still a paid call on every path that got as far as a
    // reply, so this is recorded before the failure is passed on. It is also the
    // only way the expensive failure -- billed, useless, asked again on the next
    // model -- ever gets counted.
    await recordSpend(who, feature, err?.usage);
    throw err;
  }
}

/**
 * Writes down what the call cost, and never gets in the way of the answer.
 *
 * Loaded on demand and wrapped whole, because a diagnostic that can break a reply
 * is worse than no diagnostic -- the same rule the refusal writer follows.
 */
async function recordSpend(who, feature, usage) {
  if (!who?.supabase || !who?.userId) return;
  if (!Array.isArray(usage) || !usage.length) return;
  try {
    const { recordUsage } = await import("./usage");
    await recordUsage(who.supabase, {
      userId: who.userId,
      feature,
      provider: DISCLOSED_PROVIDER,
      calls: usage,
    });
  } catch {
    // Nothing to do about it, and nothing worth failing an answer over.
  }
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
  // Token counts gathered from vendors that have already been paid, so a failure
  // that ends up at the fourth model still carries what the first three cost.
  let spent = [];
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
      // Silence, reported as success. Treated exactly like a 502, because for
      // the person waiting it is one: nothing came back and another vendor
      // might do better. Belt and braces over the adapters, which each have
      // their own ways of arriving here.
      if (isSilent(result)) {
        last = new ModelError(
          "The assistant came back with nothing at all. Try that again.",
          502,
        );
        last.refusals = [
          ...refused,
          ...(Array.isArray(result?.refusals) ? result.refusals : []),
        ];
        refused = last.refusals;
        spent = [
          ...spent,
          ...(Array.isArray(result?.usage) ? result.usage : []),
        ];
        last.usage = spent;
        skipped += provider.modelList ? provider.modelList().length : 1;
        continue;
      }
      // A grounded turn is given no way to make a function call, so any call
      // Aly needed on that turn was typed out as JSON in the middle of the
      // words. Turned back into a call here, at the one place every answer
      // passes through, so no screen ever has to print the machinery.
      const lifted = liftSpokenCalls(result);
      return {
        ...lifted,
        // Every caller can read this without checking which vendor answered.
        sources: Array.isArray(lifted.sources) ? lifted.sources : [],
        searched: lifted.searched === true,
        queries: Array.isArray(lifted.queries) ? lifted.queries : [],
        refusals: [
          ...refused,
          ...(Array.isArray(lifted.refusals) ? lifted.refusals : []),
        ],
        usage: [...spent, ...(Array.isArray(lifted.usage) ? lifted.usage : [])],
        provider: chain[i],
        // How far down the whole ladder the answer came from, counting every
        // model of every vendor ahead of it.
        fallbackDepth: skipped + (lifted.modelIndex || 0),
      };
    } catch (err) {
      const status = err instanceof ModelError ? err.status : 502;
      last = err instanceof ModelError ? err : new ModelError(err.message, 502);
      last.refusals = [...refused, ...(err.refusals || [])];
      refused = last.refusals;
      spent = [...spent, ...(Array.isArray(err?.usage) ? err.usage : [])];
      last.usage = spent;
      if (!TRY_NEXT_PROVIDER.has(status)) throw last;
      skipped += provider.modelList ? provider.modelList().length : 1;
    }
  }

  throw last;
}
