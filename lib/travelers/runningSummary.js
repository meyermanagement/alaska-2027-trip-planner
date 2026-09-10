// One plain, destination-anchored sentence per interview answer, used by
// the running summary panel next to the question card.
//
// The point of the panel is that the primary sees, after every question,
// exactly what changes for Aly because of the answer they just gave. Aly says
// it herself, in the first person -- the panel used to narrate her ("Aly will
// plan three or four things"), which read like a product describing its own
// roadmap while she was in the middle of asking the questions.
// "You said one-thing-done-well. On Alaska, I won't book more than one
// paid excursion in a shore-day window" is more convincing than a spinner
// and better than the abstract "saved" toast the interview used to have.
//
// Kept as a lookup table rather than a live model call so a family
// answering ten questions in a row does not sit through ten spinners,
// and so the running summary always says the same thing for the same
// answer -- the whole point of the panel is that it is legible and
// consistent. When a question is answered with a free-text "other"
// value, the entry is a fallback line that still names the destination
// and the topic; that is honest about not being able to be as concrete
// as the option answers.
//
// Templates take {dest} and are called with the destination the family's
// next upcoming trip is going to, or "your next trip" when no trip is
// known yet.

function templatesFor(slot) {
  switch (slot) {
    case "pace":
      return {
        packed: (d) =>
          `You're a packed-day family. On ${d}, I'll plan three or four things a day and cut anything that turns into waiting.`,
        one_thing: (d) =>
          `You're a one-thing-done-well family. On ${d}, I won't put two paid tickets on the same day.`,
        other: (d) =>
          `Now I know how a good day is shaped for you. On ${d}, I'll plan the days that way instead of by the guidebook's list.`,
      };
    case "day_shape":
      return {
        early: (d) =>
          `You're an early family. On ${d}, I'll put the biggest thing before ten and keep the afternoons open.`,
        late: (d) =>
          `You're a late family. On ${d}, I won't book anything before nine, and I'll aim dinner after eight when the restaurant allows it.`,
        other: (d) =>
          `Now I know when your day runs. On ${d}, I'll fit plans inside those hours instead of city hours.`,
      };
    case "doing_or_seeing":
      return {
        doing: (d) =>
          `You'd rather do than see. On ${d}, I'll lead with the trail, the harbor and the kitchen, and put the museum second.`,
        seeing: (d) =>
          `You'd rather see than do. On ${d}, I'll queue the museums, the viewpoints and the neighborhoods first.`,
        other: (d) =>
          `Now I know how you spend a day. On ${d}, I'll build days that shape, not a mix of everything.`,
      };
    case "staying":
      return {
        hotel: (d) =>
          `You prefer a hotel. On ${d}, I'll price the hotels first and only raise an apartment when a hotel doesn't fit.`,
        apartment: (d) =>
          `You prefer an apartment. On ${d}, I'll lead with the neighborhood apartment and only fall back on a hotel for a one-nighter.`,
        other: (d) =>
          `Now I know where you'd rather sleep. On ${d}, I'll price that shape of stay first.`,
      };
    case "getting_around":
      return {
        car: (d) =>
          `You'd rather have a car. On ${d}, I'll price the rental early and build the days around driving.`,
        transit: (d) =>
          `You'd rather use transit and your feet. On ${d}, I'll pick hotels near a station and warn you before anything is more than a 25-minute walk.`,
        other: (d) =>
          `Now I know how you'd rather move around. On ${d}, I'll price that first and keep the other kind as a backup.`,
      };
    case "food":
      return {
        local: (d) =>
          `Local first, always. On ${d}, I won't recommend a chain, and my dinner suggestions will come from what people actually eat in town.`,
        familiar: (d) =>
          `Familiar first. On ${d}, I'll keep at least one known name in every night's dinner list.`,
        other: (d) =>
          `Now I know how you eat on trips. On ${d}, I'll build the dinner suggestions that way.`,
      };
    case "crowds":
      return {
        crowded: (d) =>
          `Crowds don't scare you. On ${d}, I'll put you at the famous thing on the famous day and plan around the wait.`,
        quiet: (d) =>
          `Quiet over famous. On ${d}, I'll suggest the sister museum, the off-season month and the smaller island whenever they beat the queue.`,
        other: (d) =>
          `Now I know how you feel about crowds. On ${d}, I'll pick the version of each attraction that matches.`,
      };
    case "money":
      return {
        stay: (d) =>
          `You'd rather spend on where you sleep. On ${d}, I'll price the nicer hotel first and trim the excursion list to pay for it.`,
        do: (d) =>
          `You'd rather spend on what you do. On ${d}, I'll price the excursions and the private guide first, and keep the hotel workmanlike.`,
        eat: (d) =>
          `You'd rather spend on eating. On ${d}, I'll hold back on the hotel and put the money in the dinner and the wine.`,
        other: (d) =>
          `Now I know where the money goes. On ${d}, I'll respect that when I put the trip together.`,
      };
    case "moments":
      return {
        _any: (d) =>
          `Now I know the moments you'd take home. On ${d}, I'll look for the same shape of moment when I suggest things.`,
      };
    default:
      return null;
  }
}

/**
 * Turn a settled interview answer into one plain destination-anchored
 * sentence for the running summary panel.
 *
 * `answer` is the record shape the interview writes to its local answers
 * array: `{ slot, action, picked, whys, ownWords, kind, ... }` (see the
 * remember() helper in InterviewBody).
 *
 * Returns null when nothing meaningful can be said (a skipped question, an
 * unknown slot, or an "other" pick with no free text that could carry the
 * summary). Callers should render nothing in that case; empty rows on the
 * panel are quieter than "no summary available".
 */
export function summaryForAnswer(answer, destination) {
  if (!answer || answer.action === "skip") return null;
  const dest = destination || "your next trip";
  const templates = templatesFor(answer.slot);
  if (!templates) return null;

  // Moments is a text/list question -- picked is a list of strings. Any
  // non-empty pick earns the single "took-home moments" line.
  if (answer.slot === "moments") {
    if (Array.isArray(answer.picked) && answer.picked.length > 0) {
      return templates._any(dest);
    }
    return null;
  }

  // Look for a template keyed off the option value. The InterviewBody
  // record has the option LABEL in `picked`, so we need to invert: search
  // the template's keys and find the one whose label matches. When we
  // can't, we fall back to the free-text branch.
  const picked = answer.picked;
  if (typeof picked === "string" && picked.trim()) {
    // Try matching by value first (some future callers may pass the value
    // instead of the label): tolerant on both sides.
    const valueGuess = picked.trim().toLowerCase().replace(/\s+/g, "_");
    if (templates[valueGuess]) return templates[valueGuess](dest);

    // Answer.picked is the option's label. Fall back to picking the first
    // template key whose label appears in the picked string.
    const key = keyForLabel(answer.slot, picked);
    if (key && templates[key]) return templates[key](dest);

    // Own text answer or unknown label: use the topic-only fallback that
    // still names the destination.
    if (templates.other) return templates.other(dest);
  }

  return null;
}

function keyForLabel(slot, label) {
  const l = (label || "").toLowerCase();
  const map = {
    pace: [
      ["packed", "packed"],
      ["one thing", "one_thing"],
    ],
    day_shape: [
      ["early", "early"],
      ["late", "late"],
    ],
    doing_or_seeing: [
      ["do", "doing"],
      ["see", "seeing"],
    ],
    staying: [
      ["hotel", "hotel"],
      ["apartment", "apartment"],
      ["home", "apartment"],
    ],
    getting_around: [
      ["car", "car"],
      ["transit", "transit"],
      ["train", "transit"],
      ["foot", "transit"],
    ],
    food: [
      ["local", "local"],
      ["familiar", "familiar"],
      ["known", "familiar"],
    ],
    crowds: [
      ["crowd", "crowded"],
      ["famous", "crowded"],
      ["quiet", "quiet"],
      ["off", "quiet"],
    ],
    money: [
      ["sleep", "stay"],
      ["stay", "stay"],
      ["do", "do"],
      ["excursion", "do"],
      ["eat", "eat"],
      ["food", "eat"],
      ["dinner", "eat"],
    ],
  };
  for (const [needle, key] of map[slot] || []) {
    if (l.includes(needle)) return key;
  }
  return null;
}
