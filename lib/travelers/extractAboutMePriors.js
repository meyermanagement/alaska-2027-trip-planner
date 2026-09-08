// Read a traveler's About-you paragraph and return the interview slots the
// paragraph has already answered.
//
// The About-you screen collects four short answers in the person's own words.
// Downstream, the family interview asks nine questions about the same shape of
// trip -- when the day starts, where the family sleeps, how they get around,
// what money is spent on, and so on. If somebody has already written "we hate
// cruises, we always book a Marriott, and Steph is seasick on small boats"
// on About-you, asking those same questions again reads as if nobody was
// listening.
//
// This helper reads the paragraph once and returns a JSON map from interview
// slot id to the option the paragraph implies, the exact quote it came from,
// and a confidence tag. Only slots the paragraph actually settles are keyed;
// ambiguous ones are absent. Written to travelers.about_me_priors on every
// About-you save so the paragraph and the priors stay in lockstep.
//
// Uses the same Gemini text-model ladder as document extraction -- 3.1 Pro
// Preview first for the careful pass, 3.6 Flash as fallback -- so no new key
// or vendor to configure. Overrideable through GEMINI_TEXT_MODELS like
// everywhere else that reads text.

import { INTERVIEW_QUESTIONS } from "./interview";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TEXT_MODELS = ["gemini-3.1-pro-preview", "gemini-3.6-flash"];
const RETRYABLE = new Set([500, 502, 503, 504]);

function textModelList() {
  const env = (process.env.GEMINI_TEXT_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return env.length ? env : DEFAULT_TEXT_MODELS;
}

// Only the eight options-shaped questions are extractable. The text-shaped
// "limits" question is free-form (allergies, phobias, mobility) and the
// moments question is a list of memories; neither maps to a chosen value.
function extractableQuestions() {
  return INTERVIEW_QUESTIONS.filter((q) => q.kind === "options");
}

// The prompt describes the eight questions the way somebody would read them,
// with each option's label and detail line. The model returns only the slots
// it can settle high-confidence from the paragraph; anything ambiguous is
// left out rather than guessed. The exact-quote requirement anchors the
// answer to something a person can point at on the About-you screen, which
// matters because the interview UI shows the quote as "you mentioned this".
function buildPrompt() {
  const questions = extractableQuestions();
  const menu = questions
    .map((q) => {
      const options = q.options
        .map((o) => `    - value "${o.value}": ${o.label} -- ${o.detail}`)
        .join("\n");
      return `Slot "${q.slot}" -- ${q.label}\n  Question: ${q.prompt}\n  Options:\n${options}`;
    })
    .join("\n\n");

  return `You are reading one traveler's short "About you" paragraph. It is written by them, in their own words, about how they travel and what they like.

Downstream in the app there is a nine-question interview about the same shape of trip. Your job is to look at the paragraph and, for each of the interview questions listed below, decide whether the paragraph clearly answers it. If it does, return the matching option value, the exact sentence you drew it from, and how confident you are. If it doesn't, do not include that slot in the answer.

Be strict:
- Include a slot only when the paragraph says or clearly implies one of the option values. If the paragraph is quiet or ambiguous about a slot, leave it out.
- Never guess. "We travel a lot" does not answer any of these; leave them all out.
- Use the exact wording from the paragraph in the quote field, verbatim, including punctuation. Do not paraphrase.
- Confidence should be "high" only when the paragraph says the option value in so many words. "medium" when it clearly implies it. "low" is not allowed -- if you would say low, leave the slot out instead.

The interview questions:

${menu}

Return a JSON object with one key: "priors". Its value is an object keyed by slot id, where each entry is {"value": one of the option value strings for that slot, "quote": the exact sentence from the paragraph, "confidence": "high" or "medium"}. Slots the paragraph does not answer are absent from the object.`;
}

// The response schema keeps the model on the rails and means the caller does
// not have to defend against surprise keys. The priors object is open (any
// slot key allowed) because Gemini's schema support does not do enums for
// object keys; we sanity-check keys and values in normalize() after parsing.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    priors: {
      type: "object",
    },
  },
  required: ["priors"],
};

async function askOnce({ model, key, paragraph, signal }) {
  const prompt = buildPrompt();
  const res = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { text: `\n\nThe paragraph:\n\n${paragraph}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`${model} ${res.status} ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p) => p?.text || "")
    .join("")
    .trim();

  if (!text) {
    const err = new Error(`${model}: empty answer`);
    err.status = 422;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const err = new Error(`${model}: not JSON`);
    err.status = 422;
    throw err;
  }

  return parsed?.priors || {};
}

/**
 * Extract interview priors from an About-you paragraph.
 *
 * @param {string} paragraph - the concatenated About-you paragraph
 * @param {AbortSignal=} signal
 * @returns {Promise<Record<string, {value: string, quote: string, confidence: "high"|"medium"}>>}
 *
 * Blank paragraph returns {}. No GEMINI_API_KEY returns {} without throwing --
 * the caller (the About-you save route) treats extraction as best-effort and
 * a missing key must not block the save.
 */
export async function extractAboutMePriors(paragraph, signal) {
  const text = typeof paragraph === "string" ? paragraph.trim() : "";
  if (!text) return {};

  const key = process.env.GEMINI_API_KEY;
  if (!key) return {};

  let last = null;
  for (const model of textModelList()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await askOnce({ model, key, paragraph: text, signal });
        return normalize(raw);
      } catch (err) {
        last = err;
        if (signal?.aborted) throw err;
        if (!RETRYABLE.has(err.status) || attempt === 1) break;
      }
    }
  }
  // A model failure is not a save failure -- the paragraph is still written,
  // priors just stay empty until the next save. Log and swallow.
  console.warn(
    "extractAboutMePriors: no model answered",
    last?.message || last,
  );
  return {};
}

// Trust nothing the model returns. Every prior has to reference a real slot
// and a real option value on that slot, and the quote has to appear in the
// paragraph (or the model made it up). We drop the ones that fail, keep the
// rest, and never surface an unknown slot to the interview screen.
function normalize(raw) {
  if (!raw || typeof raw !== "object") return {};
  const questions = new Map(extractableQuestions().map((q) => [q.slot, q]));
  const out = {};
  for (const [slot, entry] of Object.entries(raw)) {
    const q = questions.get(slot);
    if (!q) continue;
    if (!entry || typeof entry !== "object") continue;

    const value = typeof entry.value === "string" ? entry.value.trim() : "";
    if (!value) continue;
    if (!q.options.some((o) => o.value === value)) continue;

    const quote = typeof entry.quote === "string" ? entry.quote.trim() : "";
    if (!quote) continue;

    const confidenceRaw =
      typeof entry.confidence === "string"
        ? entry.confidence.trim().toLowerCase()
        : "";
    const confidence =
      confidenceRaw === "high" || confidenceRaw === "medium"
        ? confidenceRaw
        : "medium";

    out[slot] = { value, quote: quote.slice(0, 300), confidence };
  }
  return out;
}
