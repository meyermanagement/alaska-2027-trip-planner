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

/**
 * Which tool a bare object was trying to be, worked out from its keys.
 *
 * The model rarely writes the tool's name -- it writes the arguments, because
 * that is the shape it was shown. Both of the tools that get spoken this way are
 * answers rather than changes, which is the only reason this is safe: the worst
 * a wrong guess can do is offer a question nobody wanted. Nothing here can save,
 * book, delete or spend anything.
 */
function shapeOf(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = String(value.name || value.tool || value.function || "").trim();
  if (name === "offer_followups" || name === "show_places") {
    const args =
      value.args && typeof value.args === "object" ? value.args : value;
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
  for (const key of ["functionCall", "function_call", "tool_use", "toolUse"]) {
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
 * Lift any spoken calls out of a reply.
 *
 * Returns the same shape it was given: the words with the JSON removed, and the
 * calls with the recovered ones appended. A call the model both made properly
 * and wrote out is not a problem -- the followups and places code already
 * deduplicates, and two identical shortlists collapse to one.
 */
export function liftSpokenCalls(result) {
  const text = typeof result?.text === "string" ? result.text : "";
  if (!text.includes("```")) return result;

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
    // we do not stays where it is, because half a code block is not English.
    if (!lifted.length || lifted.length !== list.length) continue;
    found.push(...lifted);
    cuts.push({ ...block, start: withLead(text, block.start) });
  }
  if (!found.length) return result;

  let words = text;
  for (const cut of cuts.slice().reverse()) {
    words = words.slice(0, cut.start) + words.slice(cut.end);
  }
  words = words.replace(/\n{3,}/g, "\n\n").trim();

  return {
    ...result,
    text: words,
    calls: [...(Array.isArray(result?.calls) ? result.calls : []), ...found],
  };
}
