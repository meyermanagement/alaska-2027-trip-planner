// Suggestions write complete sentences into the user's editable answer.
// Match only intact sentences; never remove an edited or qualified answer.
export function aboutChipSentence(group, item) {
  return `${group.prefix} ${item}.`;
}

function sentencePattern(sentence) {
  const escaped = sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`);
}

export function hasAboutChip(text, sentence) {
  return sentencePattern(sentence).test(String(text || ""));
}

export function toggleAboutChip(text, sentence) {
  const current = String(text || "");
  if (hasAboutChip(current, sentence)) {
    return current.replace(sentencePattern(sentence), "").trim();
  }
  return current.trimEnd() ? `${current.trimEnd()} ${sentence}` : sentence;
}
