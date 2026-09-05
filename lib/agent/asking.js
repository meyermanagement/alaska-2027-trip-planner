/**
 * Whether Aly's last answer ended by asking the family something.
 *
 * She asks good questions and the panel gave no sign of it. Pressed on the
 * budget card, she wrote a heading -- WHAT FIGURE DO YOU HAVE IN MIND? -- and a
 * sentence under it asking what the trip should cost, and both landed as more
 * text in a gray bubble. A heading set in small capitals reads as a section
 * label, not as a question aimed at you, so the conversation stopped there with
 * everyone waiting on everyone.
 *
 * So the panel needs to know, without asking the model to tag anything: read the
 * end of the answer, and if the last thing she wrote was a question, say so
 * above the message box.
 */

// Long enough for a real question, short enough that a paragraph ending in a
// rhetorical flourish does not get repeated above the composer.
const MAX_LENGTH = 180;

/** Markdown that means nothing once the line is being shown as itself. */
function plain(line) {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .trim();
}

/**
 * The question Aly finished on, or null if she finished on a statement.
 *
 * Only the last three lines are considered: a question in the middle of a long
 * answer has already been answered by the rest of it, and the one that matters
 * is the one she stopped at. A heading immediately above the real question --
 * exactly the shape of the budget reply -- loses to the sentence under it,
 * because that is the one written to a person.
 */
export function askedOfYou(text) {
  const lines = String(text || "")
    .split("\n")
    .map(plain)
    .filter(Boolean);
  if (!lines.length) return null;
  const tail = lines.slice(-3);
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const line = tail[i];
    if (!line.endsWith("?")) continue;
    if (line.length > MAX_LENGTH) return null;
    // A heading is a label for what follows, so if there is anything after it
    // the question has already been asked properly further down and we would
    // only be shouting the label back.
    return line;
  }
  return null;
}

/** Whether a heading is itself a question, and so should not be set in capitals. */
export function isQuestion(text) {
  return String(text || "").trim().endsWith("?");
}
