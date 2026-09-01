// Finding a line on a long list, without having to spell it.
//
// A packing list runs to a hundred and eleven items across a dozen headings,
// and the question you arrive with is nearly always "is the thing already on
// here?" -- asked while walking around a bedroom, half-remembering what the
// line was called. So the search box has to forgive three different kinds of
// wrong: a word typed in a hurry ("rane shell"), a word shortened to what you
// actually say out loud ("binocs", "sunscrn"), and words given in the wrong
// order or with something in between ("shell rain", "charger phone").
//
// Nothing clever, and deliberately not a ranking: the ask was that the search
// filter the list to what might match, so the answer is yes or no and the list
// keeps the order and the headings it already had. Three tests, in the order
// they get cheaper to be wrong about:
//
//   1. the term is somewhere in the text, spelled correctly;
//   2. the term is a run of the text's letters in order, with the gaps kept
//      small -- which is what an abbreviation looks like;
//   3. the term is within one or two letters of a word in the text, which is
//      what a typo looks like.
//
// Every term has to match something, so more typing narrows rather than widens.
// An empty box matches everything, which is how the list looks with no search
// at all.

/** Lower case, accents dropped, punctuation flattened to single spaces. */
export function norm(value) {
  return String(value == null ? "" : value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Are the letters of `term` found in `text`, in order, without wandering?
 *
 * The gap cap is what stops "sun" from matching "Stuff for the night" by
 * picking one letter from three different words. Abbreviations skip a letter
 * here and there; they do not skip half a sentence.
 */
function isTightSubsequence(term, text, maxGap = 4) {
  if (!term) return true;
  let at = 0;
  for (const letter of term) {
    const found = text.indexOf(letter, at);
    if (found === -1) return false;
    if (at > 0 && found - at > maxGap) return false;
    at = found + 1;
  }
  return true;
}

/**
 * Levenshtein distance, given up on as soon as it passes the limit worth
 * caring about. Two rows of numbers rather than a whole matrix, because this
 * runs on every item of every list on every keystroke.
 */
export function editDistance(a, b, limit = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      row[j] = value;
      if (value < best) best = value;
    }
    if (best > limit) return limit + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * How wrong a word is allowed to be. One letter in a short word, two in a long
 * one: at three letters and one mistake allowed, "cap" would find "cat", "cup"
 * and "car", which is a search that answers a different question than the one
 * asked.
 */
function allowance(term) {
  if (term.length <= 3) return 0;
  if (term.length <= 6) return 1;
  return 2;
}

/** Does one word of the query match this text, one of the three ways? */
function termMatches(term, text, words) {
  if (!term) return true;
  if (text.includes(term)) return true;
  const slack = allowance(term);
  if (slack > 0) {
    for (const word of words) {
      if (Math.abs(word.length - term.length) > slack) continue;
      if (editDistance(term, word, slack) <= slack) return true;
    }
    // A typo in the middle of a longer word: "sunscren" against "sunscreen".
    for (const word of words) {
      if (word.length <= term.length) continue;
      if (editDistance(term, word.slice(0, term.length), slack) <= slack)
        return true;
    }
  }
  return isTightSubsequence(term, text);
}

/**
 * Does this query match the text? Several fields can be handed in — the item's
 * name, its category, whose it is — and a match in any of them counts, so
 * "veda" finds Veda's things and "toilet" finds the heading as well as the bag.
 *
 * @param {string} query what was typed
 * @param {...(string|null|undefined)} fields the item, in pieces
 */
export function matchesQuery(query, ...fields) {
  const terms = norm(query).split(" ").filter(Boolean);
  if (!terms.length) return true;
  const text = norm(fields.filter(Boolean).join(" "));
  if (!text) return false;
  const words = text.split(" ").filter(Boolean);
  return terms.every((term) => termMatches(term, text, words));
}
