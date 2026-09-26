// One test case against one model: build the request the app would send, send
// it once, mark the answer. Server-only (it carries the fixtures and the keys).

import { callModel } from "./call";
import { thinkingOffered, refusedThinking } from "./effort";
import { scoreFacts, scoreTools, scoreSearch, scoreEmail, scoreDoc, scoreFares, scoreTips, scoreWallet, scoreNav, scorePriors, jsonOut } from "./score";
import * as H from "./fixtures/household";
import * as M from "./fixtures/more";
import { EMAILS } from "./fixtures/emails";
import { DOCS } from "./fixtures/documents";
import { DOC_IMAGES } from "./fixtures/doc-images";
import { DOCUMENT_READERS } from "@/lib/documents/extract";
import { FARE_SYSTEM, manyBrief, verifiedModelFares, faresFrom } from "@/lib/deals/forwarded";
import { fareReadInput } from "@/lib/deals/newsletter";
import { hardParse } from "@/lib/deals/parse";
import * as parser from "@/lib/inbox/parser";
import { TIP_SYSTEM, tipBrief } from "@/lib/tips/brief";
import { tipsFrom } from "@/lib/tips/parse";
import { acceptTips } from "@/lib/tips/tip";
import { WALLET_SYSTEM, walletBrief } from "@/lib/tips/wallet";
import * as nav from "@/lib/nav/search";
import { buildPrompt as priorsPrompt } from "@/lib/travelers/extractAboutMePriors";

// The email test sends the parser's own prompt and schema rather than a copy, so
// it measures exactly what the app sends. Off if those ever stop being exported.
export const EMAIL_READY = Boolean(parser.PROMPT && parser.UNTRUSTED && parser.RESPONSE_SCHEMA);

export const EFFORT = new Set(["minimal", "low", "high"]);
const ask = (text) => [{ role: "user", text }];

export function build(scenario, caseId) {
  switch (scenario) {
    case "ask": {
      const q = H.QUESTIONS.find((c) => c.id === caseId);
      if (!q) return null;
      return {
        spec: { system: H.SYSTEM, messages: ask(q.ask), tools: H.TOOLS },
        mark: (r) => scoreFacts(r.text, q.facts, r.calls),
      };
    }
    case "tools": {
      const c = H.CHANGES.find((x) => x.id === caseId);
      if (!c) return null;
      return {
        spec: { system: H.SYSTEM, messages: ask(c.ask), tools: H.TOOLS },
        mark: (r) => scoreTools(r.calls, c, H.KNOWN_IDS),
      };
    }
    case "search": {
      const c = H.LOOKUPS.find((x) => x.id === caseId);
      if (!c) return null;
      return {
        spec: { system: "You are Aly, a family travel assistant. Answer briefly and name your sources.", messages: ask(c.ask), grounded: true },
        mark: (r) => scoreSearch(r.text, r.sources, c.facts),
      };
    }
    case "email": {
      const e = EMAILS.find((x) => x.id === caseId);
      if (!e) return null;
      if (!EMAIL_READY) return { unavailable: "Needs the email reader's prompt exported from the parser" };
      return {
        spec: {
          parts: [{ text: parser.PROMPT }, { text: parser.UNTRUSTED }, { text: `Reviewer comment: ""\n\nEMAIL SOURCE:\n${e.text}` }],
          json: { schema: parser.RESPONSE_SCHEMA, name: "booking" },
          temperature: 0,
        },
        mark: (r) => scoreEmail(e.truth, jsonOut(r.text)),
      };
    }
    case "documents": {
      const d = DOCS.find((x) => x.id === caseId);
      const reader = d && DOCUMENT_READERS[d.kind];
      if (!d || !reader || !DOC_IMAGES[d.id]) return null;
      return {
        spec: {
          parts: [{ text: reader.prompt }, { inlineData: { mimeType: "image/png", data: DOC_IMAGES[d.id] } }],
          json: { schema: reader.schema, name: "fields" },
          temperature: 0,
          // Documents run at low thinking in the app whatever the page asks.
          fixedThinking: "low",
        },
        mark: (r) => scoreDoc(d.truth, jsonOut(r.text)),
      };
    }
    case "fares": {
      const c = M.FARE_CASES.find((x) => x.id === caseId);
      if (!c) return null;
      // The first case is the original FareFinch email, kept where it was.
      const email = c.email || H.FARE_EMAIL;
      const source = c.source || H.FARE_SOURCE;
      const input = fareReadInput(email, H.FARE_AIRPORTS);
      return {
        spec: {
          system: FARE_SYSTEM,
          messages: ask(manyBrief(input, hardParse(input), source, H.FARE_AIRPORTS)),
          temperature: 0,
        },
        mark: (r) => {
          const returned = faresFrom(r.text);
          const verified = verifiedModelFares(r.text, { text: email, source, receivedAt: new Date().toISOString() });
          return scoreFares({ returned, verified }, c.truth || H.FARE_TRUTH, c.excluded || H.FARE_EXCLUDED);
        },
      };
    }
    case "tips": {
      const c = M.TIP_CASES.find((x) => x.id === caseId);
      if (!c) return null;
      return {
        // As tips.write sends it: its own system prompt, the brief, searching on.
        spec: { system: TIP_SYSTEM, messages: ask(tipBrief(c.brief)), temperature: 0.3, grounded: true },
        mark: (r) => {
          const candidates = tipsFrom(r.text);
          const { tips, dropped } = acceptTips({
            candidates,
            today: c.brief.today,
            place: { scope: c.brief.scope },
            sources: r.sources || [],
            searched: Boolean(r.usage?.searches),
          });
          return scoreTips({ candidates, accepted: tips, dropped }, c);
        },
      };
    }
    case "wallet": {
      const c = M.WALLET_CASES.find((x) => x.id === caseId);
      if (!c) return null;
      return {
        spec: { system: WALLET_SYSTEM, messages: ask(walletBrief(c.brief)), temperature: 0.3, grounded: true },
        mark: (r) => scoreWallet(tipsFrom(r.text), c),
      };
    }
    case "nav": {
      const c = M.NAV_CASES.find((x) => x.id === caseId);
      if (!c) return null;
      const menu = nav.normalizeMenu(M.NAV_MENU);
      return {
        spec: { system: nav.SYSTEM, messages: ask(nav.briefFor({ query: c.query, menu, currentPath: "/settings" })), temperature: 0.2 },
        mark: (r) => scoreNav(nav.parseKeys(r.text || "", new Set(menu.map((m) => m.key))), c),
      };
    }
    case "priors": {
      const c = M.PRIOR_CASES.find((x) => x.id === caseId);
      if (!c) return null;
      return {
        // The app sends a response schema to Gemini; its open "priors" object has
        // no strict-mode equivalent, so every model here is asked for plain JSON
        // and the prompt's own instructions carry the shape.
        spec: { parts: [{ text: priorsPrompt() }, { text: `\n\nThe paragraph:\n\n${c.paragraph}` }], json: {}, temperature: 0 },
        mark: (r) => scorePriors(jsonOut(r.text)?.priors, c),
      };
    }
    case "long": {
      const c = M.LONG_CASES.find((x) => x.id === caseId);
      if (!c) return null;
      return { long: c, system: M.longRecord() };
    }
    default:
      return null;
  }
}

const usageOf = (r) => {
  const u = r.usage || {};
  return {
    ms: r.ms,
    inputTokens: u.inputTokens || 0,
    cachedTokens: u.cachedTokens || 0,
    cacheWriteTokens: u.cacheWriteTokens || 0,
    outputTokens: u.outputTokens || 0,
    reasoningTokens: u.reasoningTokens || 0,
    searches: u.searches || 0,
  };
};

// Two calls on the same 50,000-token prefix, the second a follow-up, the way a
// real conversation goes. Tokens and time are the sum of both so cost is the
// cost of the pair; the follow-up's own numbers ride along to show caching.
async function runLong(model, plan, thinking) {
  const c = plan.long;
  const base = { system: plan.system, tools: H.TOOLS, thinking };
  const one = await callModel(model, { ...base, messages: ask(c.first) });
  if (!one.ok && refusedThinking(one.status, one.error)) return { ...NOT_OFFERED(base.thinking), status: one.status };
  if (!one.ok) return { ok: false, status: one.status, error: one.error, ...usageOf(one), score: 0, max: null };
  const two = await callModel(model, {
    ...base,
    messages: [...ask(c.first), { role: "assistant", text: String(one.text || "") }, ...ask(c.second)],
  });
  const a = usageOf(one);
  const b = usageOf(two);
  const sum = Object.fromEntries(Object.keys(a).map((k) => [k, (a[k] || 0) + (b[k] || 0)]));
  if (!two.ok) return { ok: false, status: two.status, error: `follow-up: ${two.error}`, ...sum, score: 0, max: null };
  const first = scoreFacts(one.text, c.firstFacts, one.calls);
  const second = scoreFacts(two.text, c.secondFacts, two.calls);
  const share = b.inputTokens ? Math.round((b.cachedTokens / b.inputTokens) * 100) : 0;
  return {
    ok: true,
    ...sum,
    score: first.score + second.score,
    max: first.max + second.max,
    notes: [...first.notes, ...second.notes.map((n) => `follow-up ${n}`), `follow-up ${share}% cached`],
    followUp: { ms: b.ms, inputTokens: b.inputTokens, cachedTokens: b.cachedTokens },
    firstMs: a.ms,
    preview: String(two.text || "").slice(0, 400),
  };
}

// A thinking level the model will not take is not a wrong answer, so it is
// reported apart and kept out of quality and the picks.
const NOT_OFFERED = (effort) => ({ ok: false, unsupported: true, error: `Not offered at ${effort} thinking` });

/** { ok, score, max, ms, inputTokens, cachedTokens, outputTokens, reasoningTokens, searches, notes, error } */
export async function runCase({ model, scenario, caseId, effort = "low" }) {
  const plan = build(scenario, caseId);
  if (!plan) return { ok: false, error: "Unknown test case" };
  if (plan.unavailable) return { ok: false, unavailable: true, error: plan.unavailable };
  const chosen = EFFORT.has(effort) ? effort : "low";
  const fixed = plan.spec?.fixedThinking;
  if (!fixed && !thinkingOffered(model, chosen)) return NOT_OFFERED(chosen);
  if (plan.long) return runLong(model, plan, chosen);
  const { fixedThinking, ...spec } = plan.spec;
  spec.thinking = fixedThinking || chosen;
  const r = await callModel(model, spec);
  const base = usageOf(r);
  if (!r.ok && refusedThinking(r.status, r.error)) return { ...NOT_OFFERED(chosen), status: r.status };
  if (!r.ok) return { ok: false, status: r.status, error: r.error, ...base, score: 0, max: null };
  const marked = plan.mark(r);
  return { ok: true, ...base, ...marked, preview: String(r.text || "").slice(0, 400), calls: (r.calls || []).map((c) => c.name) };
}
