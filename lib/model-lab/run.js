// One test case against one model: build the request the app would send, send
// it once, mark the answer. Server-only (it carries the fixtures and the keys).

import { callModel } from "./call";
import { scoreFacts, scoreTools, scoreSearch, scoreEmail, scoreDoc, scoreFares, jsonOut } from "./score";
import * as H from "./fixtures/household";
import { EMAILS } from "./fixtures/emails";
import { DOCS } from "./fixtures/documents";
import { DOC_IMAGES } from "./fixtures/doc-images";
import { DOCUMENT_READERS } from "@/lib/documents/extract";
import { FARE_SYSTEM, manyBrief, verifiedModelFares, faresFrom } from "@/lib/deals/forwarded";
import { fareReadInput } from "@/lib/deals/newsletter";
import { hardParse } from "@/lib/deals/parse";
import * as parser from "@/lib/inbox/parser";

// The email reader's prompt lives in the parser and is not exported yet, so the
// email test stays switched off until it is, rather than running a copy.
export const EMAIL_READY = Boolean(parser.PROMPT && parser.UNTRUSTED && parser.RESPONSE_SCHEMA);

const EFFORT = new Set(["low", "high"]);
const ask = (text) => [{ role: "user", text }];

function build(scenario, caseId) {
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
      if (caseId !== "midwest") return null;
      const input = fareReadInput(H.FARE_EMAIL, H.FARE_AIRPORTS);
      return {
        spec: {
          system: FARE_SYSTEM,
          messages: ask(manyBrief(input, hardParse(input), H.FARE_SOURCE, H.FARE_AIRPORTS)),
          temperature: 0,
        },
        mark: (r) => {
          const returned = faresFrom(r.text);
          const verified = verifiedModelFares(r.text, { text: H.FARE_EMAIL, source: H.FARE_SOURCE, receivedAt: new Date().toISOString() });
          return scoreFares({ returned, verified }, H.FARE_TRUTH, H.FARE_EXCLUDED);
        },
      };
    }
    default:
      return null;
  }
}

/** { ok, score, max, ms, inputTokens, cachedTokens, outputTokens, reasoningTokens, searches, notes, error } */
export async function runCase({ model, scenario, caseId, effort = "low" }) {
  const plan = build(scenario, caseId);
  if (!plan) return { ok: false, error: "Unknown test case" };
  if (plan.unavailable) return { ok: false, unavailable: true, error: plan.unavailable };
  const { fixedThinking, ...spec } = plan.spec;
  spec.thinking = fixedThinking || (EFFORT.has(effort) ? effort : "low");
  const r = await callModel(model, spec);
  const usage = r.usage || {};
  const base = {
    ms: r.ms,
    inputTokens: usage.inputTokens || 0,
    cachedTokens: usage.cachedTokens || 0,
    outputTokens: usage.outputTokens || 0,
    reasoningTokens: usage.reasoningTokens || 0,
    searches: usage.searches || 0,
  };
  if (!r.ok) return { ok: false, status: r.status, error: r.error, ...base, score: 0, max: null };
  const marked = plan.mark(r);
  return { ok: true, ...base, ...marked, preview: String(r.text || "").slice(0, 400), calls: (r.calls || []).map((c) => c.name) };
}
