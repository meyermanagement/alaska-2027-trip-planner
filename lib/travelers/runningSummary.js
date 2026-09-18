import { formatClock, parseBandNote } from "./dayBand";
import { optionForAnswer, questionFor } from "./interview";

// Explain the answer actually given. Do not add a price promise, a physical
// limit, a fixed activity count, or permission to change a budget.
const OPTIONS = {
  pace: {
    packed: "I'll suggest several activities, with time to get between them.",
    one_thing:
      "I'll build around one main activity and leave the rest of the day open.",
  },
  doing_or_seeing: {
    doing: "I'll start with active, hands-on experiences.",
    seeing:
      "I'll start with relaxed sightseeing rather than physically demanding activities.",
  },
  getting_around: {
    car: "I'll plan routes with driving and parking in mind.",
    transit: "I'll consider public transportation routes and connections.",
    walk: "I'll favor walkable areas and nearby stops.",
    driver: "I'll consider drivers and private guides for getting around.",
  },
  crowds: {
    with: "I won't rule out a place you want to see just because it is busy.",
    without:
      "I'll look for quieter visiting times or less crowded alternatives.",
  },
};

/** One concise planning consequence, grounded in a confirmed interview answer. */
export function summaryForAnswer(answer, destination) {
  if (!answer || answer.action === "skip") return null;
  const question = questionFor(answer.slot);
  if (!question) return null;
  const lead = `For ${destination || "your next trip"},`;

  if (answer.kind === "rank" && Array.isArray(answer.picked)) {
    const ranked = answer.picked
      .map((label) => optionForAnswer(question, label)?.label)
      .filter(Boolean);
    if (!ranked.length) return null;
    const order = ranked.map((label) => label.toLowerCase()).join(", then ");
    return `${lead} I'll use this order when suggesting budget trade-offs: ${order}. Unranked items remain open for discussion.`;
  }

  if (answer.kind === "multi" && Array.isArray(answer.picked)) {
    const phrases = answer.picked
      .map((label) => {
        const option = optionForAnswer(question, label);
        return option?.short || option?.label;
      })
      .filter(Boolean);
    if (!phrases.length) return null;
    return `${lead} I'll start with these preferences: ${phrases.join("; ")}. Other options are still open.`;
  }

  if (answer.kind === "band" && typeof answer.picked === "string") {
    const band = parseBandNote(answer.picked);
    if (!band) return null;
    return `${lead} I'll aim for plans between ${formatClock(band.start)} and ${formatClock(band.end)}, with breaks as needed. I'll flag suggestions outside those hours.`;
  }

  if (
    answer.kind === "pets" &&
    typeof answer.picked === "string" &&
    answer.picked.trim()
  ) {
    return `${answer.picked.trim()} ${lead} I'll consider those travel and care arrangements.`;
  }

  if (answer.slot === "moments") {
    return Array.isArray(answer.picked) &&
      answer.picked.some((item) => String(item).trim())
      ? `${lead} I'll use those memories to understand the experiences you enjoy.`
      : null;
  }

  if (typeof answer.picked !== "string" || !answer.picked.trim()) return null;
  const option = optionForAnswer(question, answer.picked);
  const consequence = OPTIONS[answer.slot]?.[option?.value];
  if (consequence) return `${lead} ${consequence}`;
  return `${lead} I'll take your preferences about ${question.label.toLowerCase()} into account.`;
}
