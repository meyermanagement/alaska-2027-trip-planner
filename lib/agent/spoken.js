/**
 * A tool call the model typed out instead of making.
 *
 * On a grounded turn Gemini will not take function declarations and search in
 * the same breath, so on those turns Aly has been told about her tools and given
 * no way to use them. What she does then is reasonable and useless: she writes
 * the call out as JSON in the middle of her answer. The family sees
 *
 *     ```json
 *     { "questions": ["Should I check Mama's Fish House for the 9th?"] }
 *     ```
 *
 * where three buttons should have been. It is the worst kind of bug to leave,
 * because it is not a missing feature -- it is the machinery showing through, and
 * it makes the whole app look unfinished at the exact moment somebody is reading
 * an answer they asked for.
 *
 * So before anything shows a reply, the JSON is lifted out of the words and
 * turned back into the call it was meant to be. Only shapes the app actually
 * knows are lifted; anything else is left alone, because quietly deleting a
 * block of a reply we do not understand is worse than printing it.
 */

import { allToolNames } from "./toolset";

/**
 * Which tool a bare object was trying to be, worked out from its keys.
 *
 * Sometimes it writes the tool's name and sometimes only the arguments, because
 * the arguments are the shape it was shown. A guess from the keys alone is kept
 * to the two tools that are answers rather than changes -- questions and place
 * cards -- so the worst a wrong guess can do is offer a question nobody wanted.
 * A call that names itself is trusted for its name, whatever it does, because
 * nothing lifted here is saved without the family pressing the card for it.
 */
/** The object without its name, so the name is not passed as an argument. */
function rest(value) {
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (NAME_KEYS.includes(key)) continue;
    out[key] = v;
  }
  return out;
}

const KNOWN = new Set(allToolNames());

/** The keys that only ever mean "this object is a tool call". */
const NAME_KEYS = ["name", "tool", "function"];

/** The wrapper keys a vendor puts a call inside. */
const WRAP_KEYS = ["functionCall", "function_call", "tool_use", "toolUse"];

/** What a named call was called, if it names itself at all. */
function nameOf(value) {
  for (const key of NAME_KEYS) {
    const found = String(value?.[key] || "").trim();
    if (found) return found;
  }
  return "";
}

function shapeOf(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = nameOf(value);
  // Any tool the app actually has. A change written out this way still cannot
  // change anything on its own: a lifted call goes through the same validation
  // and comes out as a confirmation card the family has to press, exactly as it
  // would have if the model had made the call properly. Leaving it as JSON in
  // the words was the worse of the two, because the work was simply lost.
  if (KNOWN.has(name)) {
    const args =
      value.args && typeof value.args === "object" ? value.args : rest(value);
    return { name, args };
  }
  if (Array.isArray(value.questions) && value.questions.length) {
    return { name: "offer_followups", args: { questions: value.questions } };
  }
  if (Array.isArray(value.places) && value.places.length) {
    return { name: "show_places", args: value };
  }
  return null;
}

/** The same, one level in, for `{"functionCall": {...}}` and `{"tool_use": {...}}`. */
function unwrap(value) {
  const direct = shapeOf(value);
  if (direct) return direct;
  for (const key of WRAP_KEYS) {
    const inner = value?.[key];
    const found = shapeOf(inner);
    if (found) return found;
  }
  return null;
}

/**
 * Every fenced block in a reply, with where it starts and ends.
 *
 * Only fenced ones. A bare `{` in the middle of a sentence is far more likely to
 * be Aly writing about JSON than Aly writing JSON, and reaching into prose to
 * find braces is how you end up eating half of somebody's answer.
 */
function fences(text) {
  const out = [];
  const re = /```[ \t]*([A-Za-z]*)[ \t]*\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[1].toLowerCase();
    if (tag && tag !== "json") continue;
    out.push({ start: m.index, end: m.index + m[0].length, body: m[2] });
  }
  return out;
}

/**
 * Where a fence really begins, counting the line that introduced it.
 *
 * The JSON almost never arrives on its own. It arrives under "Results showing"
 * or "Here are the follow-ups:" -- a line that makes sense only while the block
 * is there and reads as an unkept promise the moment it goes. So a short last
 * line that never finished its sentence is treated as part of the block. A line
 * that ends properly is left alone: that is somebody's actual answer.
 */
function withLead(text, start) {
  const before = text.slice(0, start).replace(/[ \t]*\n?$/, "");
  const cut = before.lastIndexOf("\n");
  const line = before.slice(cut + 1).trim();
  if (!line || line.length > 80) return start;
  if (/[.!?"\u201d)]$/.test(line)) return start;
  return cut === -1 ? 0 : cut + 1;
}

/**
 * Whether an entry in a fenced block is a tool call of some kind.
 *
 * Not one we can lift -- one we can be sure is not prose. An object that names a
 * tool, or that wraps something naming one, is the model showing its working.
 */
function callish(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (nameOf(value)) return true;
  return WRAP_KEYS.some((key) => nameOf(value?.[key]));
}

/** Where a link's address begins and ends, so nothing edits the inside of one. */
const LINKS = /\]\([^)\s]+\)|https?:\/\/\S+/g;

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The forms an id arrives in when it is being said rather than passed. */
const SAID_ID = new RegExp(
  `(?:\\s*[[(]\\s*(?:id[:=]?\\s*)?${ID.source}\\s*[\\])])|(?:\\s*\\bid[:=]\\s*${ID.source})`,
  "gi",
);

/**
 * A reply with the app's own record ids taken out of it.
 *
 * Every row Aly is shown is listed with its id, because an id is how she changes
 * one. That is an argument, not a sentence -- but the ids are right there in
 * what she was given, so some of them come back out in the words:
 * "your rating preference [4f450c9d-3aac-4bfc-97ec-be16a1765a23]". The family
 * has no use for that string. It is not a mistake they can act on and it is not
 * something they can look up; it is a database key wearing a sentence.
 *
 * The prompt now tells her not to print one. This is the belt to that braces,
 * at the one place every answer passes through. Anything inside a link is left
 * exactly as it is, because an address is allowed to hold an id and half a URL
 * opens nothing.
 */
export function withoutIds(text) {
  if (typeof text !== "string" || !text) return "";
  if (!ID.test(text)) {
    ID.lastIndex = 0;
    return text;
  }
  ID.lastIndex = 0;
  const kept = [];
  const masked = text.replace(LINKS, (m) => {
    kept.push(m);
    return `\u0000${kept.length - 1}\u0000`;
  });
  const cleaned = masked
    .replace(SAID_ID, "")
    // One said on its own, in the middle of a sentence, cannot simply vanish
    // without taking the sentence's subject with it.
    .replace(ID, "that one")
    // A comma or a colon left hanging where the id used to be.
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
  return cleaned.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
}

/**
 * Lift any spoken calls out of a reply.
 *
 * Returns the same shape it was given: the words with the JSON removed, and the
 * calls with the recovered ones appended. A call the model both made properly
 * and wrote out is not a problem -- the followups and places code already
 * deduplicates, and two identical shortlists collapse to one.
 */
export function liftSpokenCalls(result) {
  const text = typeof result?.text === "string" ? result.text : "";
  if (!text.includes("```")) return { ...result, text: withoutIds(text) };

  const found = [];
  const cuts = [];
  for (const block of fences(text)) {
    let parsed;
    try {
      parsed = JSON.parse(block.body.trim());
    } catch {
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const lifted = list.map(unwrap).filter(Boolean);
    // All or nothing per block. A fence holding one call we understand and one
    // we do not is not lifted, because lifting half of somebody's changes and
    // leaving the other half printed is worse than either.
    if (lifted.length && lifted.length === list.length) {
      found.push(...lifted);
      cuts.push({ ...block, start: withLead(text, block.start) });
      continue;
    }
    // A block we cannot fully turn back into calls, but which is plainly nothing
    // else -- every entry an object naming a tool, or wrapping one. Whatever we
    // did recognize is still lifted, and the block goes either way: it is the
    // machinery, and printing it makes a finished app look broken.
    if (list.length && list.every(callish)) {
      found.push(...lifted);
      cuts.push({ ...block, start: withLead(text, block.start) });
    }
  }
  if (!cuts.length) return { ...result, text: withoutIds(text) };

  let words = text;
  for (const cut of cuts.slice().reverse()) {
    words = words.slice(0, cut.start) + words.slice(cut.end);
  }
  words = withoutIds(words.replace(/\n{3,}/g, "\n\n").trim());

  return {
    ...result,
    text: words,
    calls: [...(Array.isArray(result?.calls) ? result.calls : []), ...found],
  };
}
