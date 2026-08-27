// Getting a list of tips out of whatever the model actually said.
//
// The brief asks for JSON and nothing else, and most of the time that is what
// comes back. The rest of the time it arrives wrapped in a code fence, or with a
// sentence of preamble in front of it, or as a bare array instead of the object
// that was asked for. None of that is worth failing over, and none of it is worth
// trusting either: this file finds the JSON, and lib/tips/tip.js decides whether
// anything inside it deserves to be on screen.

/**
 * The first JSON object or array in a string, parsed, or null.
 *
 * Scanned with a depth counter rather than a regular expression because a tip
 * body can contain a brace, and because the greedy match that works on the happy
 * path swallows two objects into one on the day the model writes a sentence
 * between them.
 */
export function firstJson(text) {
  const raw = typeof text === "string" ? text : "";
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fenced ? fenced[1] : raw;
  for (let start = 0; start < body.length; start++) {
    const opener = body[start];
    if (opener !== "{" && opener !== "[") continue;
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < body.length; i++) {
      const ch = body[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === opener) depth++;
      else if (ch === closer) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(body.slice(start, i + 1));
          } catch {
            break; // Not JSON after all — keep looking from the next brace.
          }
        }
      }
    }
  }
  return null;
}

/**
 * The candidate tips in a model reply, before any judgement is passed on them.
 *
 * An empty array is a real answer - most days it is the right one - so this
 * returns [] both for "the model said there is nothing" and for "the model said
 * something unparseable". The caller cannot act differently on those two anyway.
 */
export function tipsFrom(text) {
  const parsed = firstJson(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.tips)) return parsed.tips;
  return [];
}
