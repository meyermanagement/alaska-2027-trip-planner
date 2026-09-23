// A fingerprint of what Ask Aly sends Gemini, written to the server log.
//
// Google reuses the front of a request it has just seen and bills that part at
// a tenth. model_usage says how much was reused. It cannot say where the reuse
// stopped, so a drop in the cached count has two explanations the table cannot
// tell apart: the prompt really changed between two questions, or the vendor's
// cache simply missed. This line tells them apart. Two questions in a row that
// print the same hashes up to block 14 changed in block 14.
//
// Hashes, lengths and offsets only. No prompt text, no reply, no names: a trip
// heading can carry a person's name, so not even the headings are printed. The
// offsets are enough to find the place again by rebuilding the prompt locally.

import { createHash } from "node:crypto";

export const PREFIX_LOG_TAG = "[aly.prefix]";

// Where the family's record starts. Everything above it is rules; everything
// below it is data, so the first difference on either side of this offset says
// which of the two changed.
const RECORD_MARKER = "\nTHE FAMILY'S TRIPS:\n";

// A block starts at a heading: a line of capitals ending in a colon, or a trip
// banner. Headings are where the prompt's own parts begin, so a difference is
// reported against the part it is in rather than against an arbitrary cut.
const HEADING = /^(?:=====|[A-Z][A-Z0-9 '\u2019()&/,.\u2014-]{5,}:)/;

// Small parts are merged forward so the line stays short. A block under this
// size is joined to the one after it.
const MIN_BLOCK = 2000;
// A long part is cut at a line break once it passes this size, so a change is
// pinned to a few thousand characters rather than to a whole section.
const MAX_BLOCK = 4000;
// And the line never lists more than this many; anything beyond is one last
// block, because the first difference is what matters and it is rarely there.
const MAX_BLOCKS = 64;

export function shortHash(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return createHash("sha256").update(text).digest("hex").slice(0, 10);
}

/** [offset, length] for each block of the system prompt, in order. */
export function systemBlocks(text) {
  const s = String(text || "");
  if (!s) return [];
  // The rules and the record never share a block, so every difference is on
  // one side of that line or the other.
  const marker = s.indexOf(RECORD_MARKER);
  const recordStart = marker < 0 ? -1 : marker + 1;
  const starts = [0];
  let at = 0;
  for (const line of s.split("\n")) {
    const cut =
      at === recordStart || HEADING.test(line) || at - starts.at(-1) >= MAX_BLOCK;
    if (at > 0 && cut) {
      starts.push(at);
    }
    at += line.length + 1;
  }
  const spans = starts.map((start, i) => [
    start,
    (i + 1 < starts.length ? starts[i + 1] : s.length) - start,
  ]);
  const merged = [];
  for (const [start, len] of spans) {
    const last = merged.at(-1);
    const small = last && last[1] < MIN_BLOCK && start !== recordStart;
    if (last && (small || merged.length >= MAX_BLOCKS)) {
      last[1] = start + len - last[0];
    } else {
      merged.push([start, len]);
    }
  }
  return merged;
}

function partsText(content) {
  return (content?.parts || [])
    .map((p) => (typeof p?.text === "string" ? p.text : JSON.stringify(p)))
    .join("\u0000");
}

/**
 * The fingerprint of one Gemini request body, in the order Google reads it.
 * Compact on purpose: one log line, well under the size a log line is cut at.
 */
export function requestFingerprint(
  body,
  { feature = null, model = null, attempt = null } = {},
) {
  const system = body?.systemInstruction?.parts?.map((p) => p?.text || "").join("") || "";
  const tools = body?.tools || [];
  const recordAt = system.indexOf(RECORD_MARKER);
  return {
    f: feature || null,
    m: model || null,
    a: Number.isInteger(attempt) ? attempt : null,
    tools: `${shortHash(tools)}:${JSON.stringify(tools).length}`,
    tc: shortHash(body?.toolConfig || null),
    gc: shortHash(body?.generationConfig || null),
    sys: `${shortHash(system)}:${system.length}`,
    at: recordAt < 0 ? null : recordAt + 1,
    b: systemBlocks(system).map(
      ([start, len]) => `${start}:${len}:${shortHash(system.slice(start, start + len))}`,
    ),
    c: (body?.contents || []).map((c) => {
      const text = partsText(c);
      return `${c?.role === "model" ? "m" : "u"}:${text.length}:${shortHash(text)}:${(c?.parts || []).length}`;
    }),
  };
}

/** Only the chat turns, where one conversation sends the same prefix again. */
export function shouldLogPrefix(feature, env = process.env) {
  if (String(env?.ALY_PREFIX_LOG || "").toLowerCase() === "off") return false;
  return /^chat\./.test(String(feature || ""));
}

/** Writes the line. Never throws: a diagnostic must not cost an answer. */
export function logPrefix(body, meta = {}, sink = console.info) {
  try {
    if (!shouldLogPrefix(meta.feature)) return null;
    const print = requestFingerprint(body, meta);
    sink(`${PREFIX_LOG_TAG} ${JSON.stringify(print)}`);
    return print;
  } catch {
    return null;
  }
}

/**
 * Where two fingerprints first part company, in the order Google reads the
 * request: tools, then the system prompt block by block, then each message.
 * Used by the comparison script and by the tests.
 */
export function firstDifference(a, b) {
  if (!a || !b) return { where: "missing" };
  if (a.tools !== b.tools) return { where: "tools", a: a.tools, b: b.tools };
  if (a.tc !== b.tc) return { where: "toolConfig" };
  const blocks = Math.max(a.b?.length || 0, b.b?.length || 0);
  for (let i = 0; i < blocks; i++) {
    const x = a.b?.[i];
    const y = b.b?.[i];
    if (x !== y) {
      const offset = Number(String(x || y).split(":")[0]);
      const side =
        a.at == null ? null : offset + Number(String(x || y).split(":")[1]) <= a.at ? "rules" : "record";
      return { where: "system", block: i, offset, side, a: x || null, b: y || null };
    }
  }
  const turns = Math.max(a.c?.length || 0, b.c?.length || 0);
  for (let i = 0; i < turns; i++) {
    if (a.c?.[i] !== b.c?.[i]) {
      return { where: "contents", turn: i, a: a.c?.[i] || null, b: b.c?.[i] || null };
    }
  }
  return { where: "none" };
}

/**
 * Pulls every fingerprint out of log text, in the order they appear. Takes the
 * raw lines, or `vercel logs --json` output, where the line is a string inside
 * a JSON record.
 */
export function parsePrefixLines(text) {
  const out = [];
  for (const raw of String(text || "").split("\n")) {
    let line = raw;
    if (line.trim().startsWith("{") && !line.trim().startsWith(`{"f"`)) {
      try {
        const record = JSON.parse(line);
        line = String(record?.message ?? record?.text ?? record?.log ?? line);
      } catch {
        // Not a JSON record; read it as a plain line.
      }
    }
    for (const chunk of line.split("\n")) {
      const at = chunk.indexOf(PREFIX_LOG_TAG);
      if (at < 0) continue;
      const json = chunk.slice(at + PREFIX_LOG_TAG.length).trim();
      try {
        out.push(JSON.parse(json.slice(0, json.lastIndexOf("}") + 1)));
      } catch {
        // Cut short by the log, or not ours.
      }
    }
  }
  return out;
}
