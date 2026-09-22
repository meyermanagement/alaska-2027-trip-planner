// Read a personal document with a vision model and hand back the few fields
// the app actually stores about it.
//
// Two documents, two readers, one ladder. An identity document is a photograph
// of a card and the fields are printed on its face. An insurance certificate is
// a long PDF where the answer is on a schedule of benefits somewhere in the
// middle, and the fields it yields are the ones an emailed policy already
// yields, because a policy that arrives as mail and a policy that arrives as a
// file have no business landing in different columns. So the policy reader's
// schema is lib/inbox/parser.js's insurance object, kept deliberately identical.
//
// Every uploaded document already lands next to the number/issue/expiry columns
// that a human types by hand today. This file is the shortcut: a passport photo
// goes in, structured JSON comes out, and the form fills those same fields in
// so the person is confirming what Aly read rather than typing from the scan.
//
// Gemini is the vendor because the app already ships a GEMINI_API_KEY and the
// cover generator already uses this same REST surface. The models are the 3.x
// Flash variants, with a low thinking level: the response schema pins the
// fields, the person confirms every one on the form before it is saved, and the
// slow half of the old Pro-first reads was the model deliberating rather than
// reading. See DEFAULT_TEXT_MODELS below.
//
// No image is stored server-side by this file. The bytes pass through in one
// request to Gemini and are not written to disk or logs.
import { isImageMime, isPdfMime } from "./kinds";
import { featureAllowed } from "@/lib/beta/consent";
import { usageFrom } from "@/lib/agent/providers/gemini";
import { recordUsage } from "@/lib/agent/usage";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Gemini's 2.5 line was closed to new/inactive users in mid-2026 and returns a
// 404 "no longer available to new users" even where the deprecation table still
// shows the model live. The 3.x replacements are 3.6 Flash for the first pass
// and 3.5 Flash-Lite for the fallback, both told to think only a little. Pro
// led this ladder for a while and, given no thinking level, deliberated at its
// highest level over a form whose fields the schema already pins down -- the
// slowest reads in the ledger were that deliberation, not the document.
// Override with GEMINI_TEXT_MODELS if a later model becomes the workhorse
// without a code change.
const DEFAULT_TEXT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];
const THINKING = { thinkingLevel: "low" };

function textModelList() {
  const env = (process.env.GEMINI_TEXT_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return env.length ? env : DEFAULT_TEXT_MODELS;
}

const RETRYABLE = new Set([500, 502, 503, 504]);

// How long each kind of read may take before it is given up on.
//
// A passport is one image and answers in a few seconds. A certificate can be
// thirty pages, and Pro reading thirty pages is the slow case worth waiting
// for -- but not waiting forever for, because the request is a person standing
// in front of a form. Both sit under the route's own maxDuration so the budget
// is spent here rather than by the platform cutting the socket.
const TIMEOUT_MS = { identity: 40_000, policy: 55_000 };

// The prompt is the whole contract. Kept short because a longer one drifts:
// the model starts adding "helpful" extra fields, or wraps the answer in
// commentary that breaks the JSON parse. The response schema below is what
// actually pins the shape down.
const IDENTITY_PROMPT = `You are reading one scanned personal identity or travel document — a passport, a driver's licence, a national ID, a visa, or the equivalent.

Return the fields below exactly. Do not guess. If a field is not clearly readable in the image, return an empty string for it. Do not translate names or places; copy them as they appear.

- doc_type: one of "passport", "drivers_license", "national_id", "visa", "other"
- number: the document number as printed, uppercase, no spaces
- issue_date: YYYY-MM-DD, or empty if not shown
- expiration_date: YYYY-MM-DD, or empty if not shown
- issuing_authority: the country or state that issued it, as printed (e.g. "United States of America", "Missouri")
- full_name: the holder's full name as printed
- confidence: "high" if the fields above come from clear machine-readable text (MRZ, PDF417 barcode, or crisp printed labels); "medium" if you read them from a clean photograph; "low" if the image is blurry, cropped, or partially obscured

If the image is not an identity or travel document at all, return doc_type "other" and empty strings for the other fields.`;

// A JSON Schema Gemini will honor via responseSchema. Keeps the model on the
// rails and means the client does not have to defend against surprise keys.
const IDENTITY_SCHEMA = {
  type: "object",
  properties: {
    doc_type: {
      type: "string",
      enum: ["passport", "drivers_license", "national_id", "visa", "other"],
    },
    number: { type: "string" },
    issue_date: { type: "string" },
    expiration_date: { type: "string" },
    issuing_authority: { type: "string" },
    full_name: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: [
    "doc_type",
    "number",
    "issue_date",
    "expiration_date",
    "issuing_authority",
    "full_name",
    "confidence",
  ],
};

const POLICY_PROMPT = `You are reading one travel coverage document — a certificate of insurance, a policy schedule, a confirmation of coverage, the plan document that came with a trip, or the guide to benefits that comes with a credit card or loyalty program. It may be a single page or it may be thirty pages long. What matters is on the schedule of benefits and the declarations page; marketing pages, sample claim forms and the state-by-state disclosure pages at the back are not what you are reading for.

Return the fields below. Do not guess and do not calculate. If the document does not state a figure, return null for it rather than inferring it from a table of typical plans. If a field is not stated, return an empty string.

- provider: the insurer or the brand that sold the plan, as printed. e.g. "Allianz Travel", "GeoBlue", "Travel Guard". On a card guide to benefits, the card as printed on the cover. e.g. "Chase Sapphire Reserve", "Amex Platinum".
- plan_name: the name of the plan or tier if the document gives one. Empty string otherwise.
- policy_number: the policy, certificate, or plan number, as printed. Empty string if not shown.
- coverage_start / coverage_end: YYYY-MM-DD of the first and last day of cover. These are the cover dates — not the date the policy was bought, not the date it was printed, and not the trip dates where the document distinguishes them. Null if the document does not say. On an annual plan these are the plan year.
- kind: "card" if this coverage comes with a credit card or loyalty program rather than being bought — a guide to benefits, a summary of protections, a benefits administrator document. "annual" if it is a bought plan covering every trip inside a plan year. "trip" if it was bought for one journey.
- emergency_phone: the 24-hour assistance number to ring from abroad, digits and punctuation exactly as printed so it can be dialled. Empty string if not shown.
- claims_phone: the number for filing a claim, if it is a different one. Empty string otherwise.
- claims_url: the web address for filing a claim or reading the certificate. Empty string if not shown.
- covers: an array from "cancellation", "interruption", "medical", "evacuation", "baggage", "delay", "rental_car", "adventure" — only the ones the document actually provides a benefit for. A peril listed as excluded, or as an optional upgrade that was not bought, does not belong here. Empty array if the document names nothing specific.
- premium / deductible / medical_limit / evacuation_limit: numbers only, no currency symbols and no thousands separators. The per-person maximum where the document gives both per-person and per-policy. Null if the document does not state that figure.
- insured_names: the full names of the people the policy covers, as printed, in the order printed. Empty if the document does not list them.
- notes: one or two short lines only for something that genuinely matters and has no field of its own — a pre-existing-conditions waiver, a named-storm exclusion, a cancel-for-any-reason rider, a sports or altitude exclusion. Empty string otherwise.
- confidence: "high" if every field above came from clearly labelled text on a schedule or declarations page; "medium" if you had to interpret one thing; "low" if the document is a poor scan, is missing the schedule, or you are guessing more than reading.

On a card guide to benefits, coverage_start and coverage_end are usually absent — return null for both rather than inventing a plan year, and leave premium null, because this coverage was not bought separately. Put the condition the benefit turns on in notes when the document states one, such as the whole fare having to be paid with that card.

If the document is not travel coverage at all — an everyday health plan, an explanation of benefits from a doctor at home, a car insurance card, a booking confirmation — return an empty provider and set confidence to "low".`;

// The same object lib/inbox/parser.js gets back from an emailed policy, minus
// the message-shaped parts it has no use for, plus the kind that a certificate
// states and an email usually does not. Held identical on purpose: both paths
// feed policyFields() in lib/insurance/policy.js, and a divergence here would
// show up as a column that only ever fills in from one of them.
const POLICY_SCHEMA = {
  type: "object",
  properties: {
    provider: { type: "string" },
    plan_name: { type: "string" },
    policy_number: { type: "string" },
    coverage_start: { type: "string", nullable: true },
    coverage_end: { type: "string", nullable: true },
    kind: { type: "string", enum: ["trip", "annual", "card"] },
    emergency_phone: { type: "string" },
    claims_phone: { type: "string" },
    claims_url: { type: "string" },
    covers: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "cancellation",
          "interruption",
          "medical",
          "evacuation",
          "baggage",
          "delay",
          "rental_car",
          "adventure",
        ],
      },
    },
    premium: { type: "number", nullable: true },
    deductible: { type: "number", nullable: true },
    medical_limit: { type: "number", nullable: true },
    evacuation_limit: { type: "number", nullable: true },
    insured_names: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["provider", "covers", "insured_names", "confidence"],
};

// What a caller may ask to have read, and what reading it means.
const READERS = {
  identity: {
    prompt: IDENTITY_PROMPT,
    schema: IDENTITY_SCHEMA,
    normalize: normalizeIdentity,
  },
  policy: {
    prompt: POLICY_PROMPT,
    schema: POLICY_SCHEMA,
    normalize: normalizePolicyFields,
  },
};

export const READER_KINDS = Object.keys(READERS);

async function askOnce({
  model,
  key,
  base64,
  mimeType,
  prompt,
  schema,
  signal,
  spend,
}) {
  const startedAt = Date.now();
  const res = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: THINKING,
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
  // Written down before anything is parsed, because a reply that fails to parse
  // was paid for exactly like one that did not. A document read is the only call
  // in this app that runs on a pro model and sends a whole file as input, so it
  // is the one place where a silently retried failure is expensive.
  if (Array.isArray(spend)) {
    spend.push({
      model,
      status: res.status,
      ok: true,
      ms: Date.now() - startedAt,
      attempt: spend.length,
      ...usageFrom(json?.usageMetadata),
    });
  }
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

  return parsed;
}

/**
 * Read a document with the ladder of Gemini models. Returns the parsed fields.
 *
 * `bytes` is a Buffer / Uint8Array (base64 is applied here). `mimeType` is what
 * the storage row says; anything that is not an image or PDF is refused so a
 * bogus MIME does not silently spend a model call.
 */
export async function extractDocumentFields({
  bytes,
  mimeType,
  kind = "identity",
  supabase,
  userId,
  signal,
} = {}) {
  // The document permission, asked here as well as in the route.
  //
  // /api/documents/read already checks it, and that check stays -- it is what
  // produces the sentence the person reads. This one exists because the route is
  // not the boundary: a module holding the provider key that trusts its callers
  // is how the forwarded-mail parser came to send an email body to Gemini after
  // its household turned Aly off. Any future caller of this function inherits
  // the refusal instead of inheriting nothing.
  if (!supabase || !userId) {
    const err = new Error("No account named for this request.");
    err.status = 403;
    throw err;
  }
  if (!(await featureAllowed(supabase, userId, "documents"))) {
    const err = new Error(
      "Reading a document sends the file itself to an AI service, and that is turned off for this account.",
    );
    err.status = 403;
    throw err;
  }

  const reader = READERS[kind];
  if (!reader) {
    const err = new Error(`unknown reader: ${kind}`);
    err.status = 400;
    throw err;
  }
  if (!bytes || !bytes.length) {
    const err = new Error("empty file");
    err.status = 400;
    throw err;
  }
  if (!isImageMime(mimeType) && !isPdfMime(mimeType)) {
    const err = new Error(`unsupported type: ${mimeType}`);
    err.status = 415;
    throw err;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error("GEMINI_API_KEY is not set");
    err.status = 500;
    throw err;
  }

  const base64 = Buffer.from(bytes).toString("base64");

  // One budget for the whole ladder, not one per model, so a slow first model
  // cannot spend the fallback's time as well as its own. The caller's own signal
  // still wins where it has one -- a form whose person navigated away.
  const clock = new AbortController();
  const timer = setTimeout(
    () => clock.abort(),
    TIMEOUT_MS[kind] || TIMEOUT_MS.identity,
  );
  const onCallerAbort = () => clock.abort();
  signal?.addEventListener?.("abort", onCallerAbort);

  let last = null;
  // What each attempt cost, gathered across the whole ladder and written once at
  // the end so a read that fell back twice is three rows rather than one.
  const spend = [];
  try {
    for (const model of textModelList()) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const fields = await askOnce({
            model,
            key,
            base64,
            mimeType,
            prompt: reader.prompt,
            schema: reader.schema,
            signal: clock.signal,
            spend,
          });
          return { ...reader.normalize(fields), model };
        } catch (err) {
          last = err;
          if (clock.signal.aborted) {
            const stop = new Error(
              signal?.aborted
                ? "The read was cancelled."
                : "That document took too long to read. Try a shorter file, or type the fields in.",
            );
            stop.status = signal?.aborted ? 499 : 504;
            throw stop;
          }
          if (!RETRYABLE.has(err.status) || attempt === 1) break;
        }
      }
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onCallerAbort);
    // In the finally, so the read that timed out and the read that threw are
    // both counted. Never allowed to break the read itself.
    try {
      await recordUsage(supabase, {
        userId,
        feature: `document.${kind}`,
        calls: spend,
      });
    } catch {
      // A bill that cannot be broken down is better than a document that
      // cannot be read.
    }
  }
  throw last || new Error("no text model answered");
}

// A few conservative sanities. The schema forces the shape; this catches the
// things the model still gets wrong occasionally -- a hallucinated date in the
// past, whitespace that snuck into the number, a country name in lower case.
function normalizeIdentity(raw) {
  const out = {
    doc_type: pickEnum(raw.doc_type, [
      "passport",
      "drivers_license",
      "national_id",
      "visa",
      "other",
    ]),
    number: cleanNumber(raw.number),
    issue_date: cleanDate(raw.issue_date),
    expiration_date: cleanDate(raw.expiration_date),
    issuing_authority: cleanText(raw.issuing_authority),
    full_name: cleanText(raw.full_name),
    confidence: pickEnum(raw.confidence, ["high", "medium", "low"]) || "low",
  };
  return out;
}

function pickEnum(value, allowed) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.includes(v) ? v : "";
}

function cleanNumber(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, "").toUpperCase().slice(0, 40);
}

function cleanDate(value) {
  if (typeof value !== "string") return "";
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2100) return "";
  if (month < 1 || month > 12) return "";
  if (day < 1 || day > 31) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// The same treatment for a policy: the schema pins the shape, this refuses the
// things a long document tempts a model into. Money arrives as a number or not
// at all -- a string with a dollar sign in it is a figure that was read off a
// marketing page rather than a schedule, and a negative limit is nonsense.
function normalizePolicyFields(raw) {
  return {
    provider: cleanText(raw.provider),
    plan_name: cleanText(raw.plan_name),
    policy_number: cleanNumber(raw.policy_number),
    coverage_start: cleanDate(raw.coverage_start),
    coverage_end: cleanDate(raw.coverage_end),
    kind: pickEnum(raw.kind, ["trip", "annual", "card"]) || "trip",
    emergency_phone: cleanPhone(raw.emergency_phone),
    claims_phone: cleanPhone(raw.claims_phone),
    claims_url: cleanUrl(raw.claims_url),
    covers: cleanCovers(raw.covers),
    premium: cleanAmount(raw.premium),
    deductible: cleanAmount(raw.deductible),
    medical_limit: cleanAmount(raw.medical_limit),
    evacuation_limit: cleanAmount(raw.evacuation_limit),
    insured_names: cleanNames(raw.insured_names),
    notes: cleanText(raw.notes),
    confidence: pickEnum(raw.confidence, ["high", "medium", "low"]) || "low",
  };
}

const COVER_VALUES = [
  "cancellation",
  "interruption",
  "medical",
  "evacuation",
  "baggage",
  "delay",
  "rental_car",
  "adventure",
];

function cleanCovers(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set(
    value.map((v) => (typeof v === "string" ? v.trim().toLowerCase() : "")),
  );
  return COVER_VALUES.filter((v) => seen.has(v));
}

function cleanNames(value) {
  if (!Array.isArray(value)) return [];
  const names = [];
  for (const entry of value) {
    const name = cleanText(entry);
    if (name && !names.includes(name)) names.push(name);
  }
  return names.slice(0, 24);
}

function cleanAmount(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  // Ten million is past every travel policy written and short of the integer
  // overflow a model produces when it reads a phone number as a limit.
  if (n > 10_000_000) return null;
  return Math.round(n * 100) / 100;
}

function cleanPhone(value) {
  if (typeof value !== "string") return "";
  const kept = value.trim().replace(/[^\d+()\-. ]/g, "");
  const digits = kept.replace(/\D/g, "");
  if (digits.length < 7) return "";
  return kept.replace(/\s+/g, " ").slice(0, 32);
}

function cleanUrl(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol)) return "";
    return url.href.slice(0, 300);
  } catch {
    return "";
  }
}

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 200);
}
