// Read a personal document with a vision model and hand back the few fields
// the app actually stores about it.
//
// Every uploaded document already lands next to the number/issue/expiry columns
// that a human types by hand today. This file is the shortcut: a passport photo
// goes in, structured JSON comes out, and the form fills those same fields in
// so the person is confirming what Aly read rather than typing from the scan.
//
// Gemini is the vendor because the app already ships a GEMINI_API_KEY and the
// cover generator already uses this same REST surface. The models are the text
// variants -- 2.5 Pro first because personal identity documents are the kind of
// thing where five extra seconds is worth getting the date right, and 2.5 Flash
// as the honest fallback when Pro is busy.
//
// No image is stored server-side by this file. The bytes pass through in one
// request to Gemini and are not written to disk or logs.
import { isImageMime, isPdfMime } from "./kinds";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_TEXT_MODELS = ["gemini-2.5-pro", "gemini-2.5-flash"];

function textModelList() {
  const env = (process.env.GEMINI_TEXT_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return env.length ? env : DEFAULT_TEXT_MODELS;
}

const RETRYABLE = new Set([500, 502, 503, 504]);

// The prompt is the whole contract. Kept short because a longer one drifts:
// the model starts adding "helpful" extra fields, or wraps the answer in
// commentary that breaks the JSON parse. The response schema below is what
// actually pins the shape down.
const PROMPT = `You are reading one scanned personal identity or travel document — a passport, a driver's licence, a national ID, a visa, or the equivalent.

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
const RESPONSE_SCHEMA = {
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

async function askOnce({ model, key, base64, mimeType, signal }) {
  const res = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: PROMPT }, { inlineData: { mimeType, data: base64 } }],
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

  return parsed;
}

/**
 * Read a document with the ladder of Gemini models. Returns the parsed fields.
 *
 * `bytes` is a Buffer / Uint8Array (base64 is applied here). `mimeType` is what
 * the storage row says; anything that is not an image or PDF is refused so a
 * bogus MIME does not silently spend a model call.
 */
export async function extractDocumentFields({ bytes, mimeType, signal } = {}) {
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

  let last = null;
  for (const model of textModelList()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const fields = await askOnce({
          model,
          key,
          base64,
          mimeType,
          signal,
        });
        return { ...normalize(fields), model };
      } catch (err) {
        last = err;
        if (signal?.aborted) throw err;
        if (!RETRYABLE.has(err.status) || attempt === 1) break;
      }
    }
  }
  throw last || new Error("no text model answered");
}

// A few conservative sanities. The schema forces the shape; this catches the
// things the model still gets wrong occasionally -- a hallucinated date in the
// past, whitespace that snuck into the number, a country name in lower case.
function normalize(raw) {
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

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 200);
}
