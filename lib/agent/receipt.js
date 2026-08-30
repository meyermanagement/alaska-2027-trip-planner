// What colour a receipt is allowed to be.
//
// Every receipt in the chat panel used to render in the same green box, which
// meant "Nothing was saved. 1 failed: ..." arrived looking exactly like a save
// that worked. Green is a claim about what happened to the family's trip, so it
// has to be earned by the counts the server sent back rather than assumed.
//
// Pure: counts in, a word out. No DOM, no colours -- the panel owns those.

// A receipt reloaded from the stored conversation has no counts left, only the
// sentence, so the words it was written with are the fallback. These are the
// exact phrases the panel and the apply route write, and both suites assert on
// them, so a rewording that breaks this shows up as a failing test rather than
// as a green box around a failure.
function toneFromText(text) {
  const said = String(text || "");
  if (!said.trim()) return "saved";
  const nothing = /nothing was saved/i.test(said);
  const failed = /\bfailed\b/i.test(said);
  if (nothing) return "failed";
  if (failed) return /\bsaved \d+ change/i.test(said) ? "mixed" : "failed";
  return "saved";
}

export function receiptTone({ applied, failed, text } = {}) {
  const ok = Number(applied);
  const bad = Number(failed);
  // Number(undefined) is NaN, which is how a missing count is told apart from
  // zero -- and zero of both is a real answer meaning nothing went wrong.
  if (Number.isFinite(ok) && Number.isFinite(bad)) {
    if (bad > 0) return ok > 0 ? "mixed" : "failed";
    return "saved";
  }
  return toneFromText(text);
}

// Said out loud above the sentence, because colour alone is not a message: a
// red-green colourblind reader, a screenshot in grayscale and a printed page all
// lose the box and keep the words.
export function receiptLabel(tone) {
  if (tone === "failed") return "Not saved";
  if (tone === "mixed") return "Partly saved";
  return null;
}
