// Which models exist right now, asked of the vendors rather than remembered.
//
// The old check page tested a fixed list of Gemini names, so a new model only
// showed up after somebody edited code. This asks Google and OpenAI for their
// model lists, keeps the text models the app could actually use, and hands the
// page everything it needs to spot a model it has never seen before.

import * as gemini from "@/lib/agent/providers/gemini";
import * as openai from "@/lib/agent/providers/openai";
import { PRICES } from "./prices";

const GOOGLE_LIST = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

// Oldest family worth offering. Anything older is not a candidate for this app.
const MIN_GEMINI = 3;
const MIN_OPENAI = 5.5;

// Specialist variants that share a family name but not the job: speech, images,
// live audio, embeddings, computer use, and the tool-tuned Pro build.
const NOT_TEXT = /(tts|image|audio|live|embed|vision|robotics|computer|customtools|thinking-exp|learnlm|nano|veo|imagen)/i;

/** A Gemini text model id the app could use, or null. */
export function geminiCandidate(id, methods = ["generateContent"]) {
  const name = String(id || "").replace(/^models\//, "");
  if (!methods.includes("generateContent")) return null;
  if (NOT_TEXT.test(name)) return null;
  const m = name.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash|flash-lite)(-preview)?$/);
  if (!m || Number(m[1]) < MIN_GEMINI) return null;
  return { id: name, vendor: "gemini", version: Number(m[1]), tier: m[2], preview: Boolean(m[3]) };
}

/** An OpenAI text model id the app could use, or null. Dated snapshots are left out. */
export function openaiCandidate(id) {
  const name = String(id || "");
  if (NOT_TEXT.test(name)) return null;
  const m = name.match(/^gpt-(\d+(?:\.\d+)?)(?:-(luna|sol|terra|astra|mini))?$/);
  if (!m || Number(m[1]) < MIN_OPENAI) return null;
  return { id: name, vendor: "openai", version: Number(m[1]), tier: m[2] || "base", preview: false };
}

// Newest first, then the cheaper tier first within a version.
const TIER_ORDER = ["flash-lite", "flash", "pro", "luna", "mini", "terra", "base", "sol", "astra"];
export function byNewest(a, b) {
  if (a.version !== b.version) return b.version - a.version;
  return TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
}

/**
 * The models each part of the app would try today, in order, and the setting
 * that changes it. Read from the same functions the app uses, so it cannot
 * drift from what is deployed.
 */
export function inUse() {
  const assistantFirst =
    String(process.env.ASSISTANT_PROVIDER || "").trim().toLowerCase() === "gemini" ? "gemini" : "openai";
  const ask = assistantFirst === "openai" && process.env.OPENAI_API_KEY
    ? [...openai.modelList(), ...gemini.modelList()]
    : gemini.modelList();
  const inboxFirst = String(process.env.INBOX_PROVIDER || "").trim().toLowerCase() === "gemini" ? "gemini" : "openai";
  const textModels = (process.env.GEMINI_TEXT_MODELS || "").split(",").map((m) => m.trim()).filter(Boolean);
  const email = [
    ...(inboxFirst === "openai" && process.env.OPENAI_API_KEY ? ["gpt-5.6-luna"] : []),
    ...(textModels.length ? textModels : ["gemini-3.1-pro-preview", "gemini-3.6-flash"]),
  ];
  const documents = textModels.length ? textModels : ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
  return {
    ask: { models: ask, setting: "ASSISTANT_PROVIDER, OPENAI_MODELS, GEMINI_MODELS" },
    tools: { models: ask, setting: "ASSISTANT_PROVIDER, OPENAI_MODELS, GEMINI_MODELS" },
    search: { models: gemini.modelList(), setting: "GEMINI_MODELS (web lookups stay on Gemini)" },
    email: { models: email, setting: "INBOX_PROVIDER, GEMINI_TEXT_MODELS" },
    documents: { models: documents, setting: "GEMINI_TEXT_MODELS (shared with email's Gemini fallback)" },
    fares: { models: gemini.modelList(), setting: "GEMINI_MODELS" },
  };
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return res.json();
}

/** Everything both vendors will currently answer to, filtered to candidates. */
export async function discover() {
  const out = { models: [], errors: [] };
  const seen = new Set();
  const add = (row) => {
    if (row && !seen.has(row.id)) {
      seen.add(row.id);
      out.models.push(row);
    }
  };

  const jobs = [];
  if (process.env.GEMINI_API_KEY) {
    jobs.push(
      getJson(GOOGLE_LIST, { "x-goog-api-key": process.env.GEMINI_API_KEY })
        .then((json) => {
          for (const m of json.models || []) add(geminiCandidate(m.name, m.supportedGenerationMethods || []));
        })
        .catch((e) => out.errors.push({ vendor: "gemini", message: e.message })),
    );
  } else out.errors.push({ vendor: "gemini", message: "GEMINI_API_KEY is not set" });

  if (process.env.OPENAI_API_KEY) {
    jobs.push(
      getJson(`${OPENAI_BASE}/models`, { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` })
        .then((json) => {
          for (const m of json.data || []) add(openaiCandidate(m.id));
        })
        .catch((e) => out.errors.push({ vendor: "openai", message: e.message })),
    );
  } else out.errors.push({ vendor: "openai", message: "OPENAI_API_KEY is not set" });

  await Promise.all(jobs);

  // A model the app is configured to use is always offered, even if a vendor's
  // list call failed, so the page can still test what is running.
  const using = inUse();
  const configured = new Set(Object.values(using).flatMap((u) => u.models));
  for (const id of configured) add(geminiCandidate(id) || openaiCandidate(id));

  out.models = out.models
    .map((m) => ({ ...m, inUse: configured.has(m.id), priced: Boolean(PRICES[m.id]) }))
    .sort(byNewest);
  out.inUse = using;
  return out;
}

export { defaultPicks } from "./picks";
