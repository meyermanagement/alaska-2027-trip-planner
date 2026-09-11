import { formatClock, parseBandNote } from "./dayBand";
import { questionFor } from "./interview";

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
      // The day question is a band now, so its line is built from the hours
      // themselves further down rather than keyed off an option. This template
      // is the fallback for an answer whose hours no longer read back.
      return {
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

  // A ranked answer is a list of labels, best-protected first. The summary
  // names first place and, when there is one, second -- what the panel is for
  // is telling somebody what their answer just bought them, and "we will
  // price the room before anything else" is that. The places below second are
  // left out on purpose: they are in the file, but a summary line that recites
  // four items stops being a sentence.
  if (answer.kind === "rank" && Array.isArray(answer.picked)) {
    const ranked = answer.picked.filter(
      (label) => typeof label === "string" && label.trim(),
    );
    if (!ranked.length) return null;
    const lower = (label) => label.charAt(0).toLowerCase() + label.slice(1);
    const first = lower(ranked[0]);
    const second = ranked[1] ? lower(ranked[1]) : null;
    return second
      ? `${ranked[0]} comes first when the budget is short. On ${dest}, I'll price ${first} before anything else, ${second} after it, and trim what is left to pay for both.`
      : `${ranked[0]} comes first when the budget is short. On ${dest}, I'll price ${first} before anything else and trim the rest to pay for it.`;
  }

  // A multi answer is a list of ticked labels. The line names all of them --
  // unlike the ranked question there is no reason to stop at two, because the
  // cap already keeps the list to three at most -- and says what Aly will do
  // with the ones NOT ticked, since that is the half of a multi answer people
  // do not expect to be read. "I will not lead with a resort" is a promise;
  // "you cannot have a resort" would be a lie.
  if (answer.kind === "multi" && Array.isArray(answer.picked)) {
    const question = questionFor(answer.slot);
    const options = question?.options || [];
    const phrases = answer.picked
      .map((label) => {
        const opt = options.find((o) => o.label === label);
        return opt?.short || (typeof label === "string" ? label : "");
      })
      .filter(Boolean);
    if (!phrases.length) return null;
    const listed =
      phrases.length === 1
        ? phrases[0]
        : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
    const everything = phrases.length >= options.length;
    if (answer.slot === "staying") {
      return everything
        ? `You'd book any of them. On ${dest}, I'll price whichever the neighborhood does best and not second-guess the shape.`
        : phrases.length === 1
          ? `You'd book ${listed}. On ${dest}, I'll price that shape of stay first and only raise another when it genuinely doesn't fit.`
          : `You'd book ${listed}. On ${dest}, I'll price both and lead with whichever the neighborhood does better.`;
    }
    if (answer.slot === "food") {
      return `Now I know how you eat: ${listed}. On ${dest}, my dinner suggestions will come from that, and I'll say so on a night that has to fall outside it.`;
    }
    return `Now I know your answer: ${listed}. On ${dest}, I'll plan inside that and tell you when I have to step outside it.`;
  }

  // A band answer is the hours in words, and the line says them back. Naming
  // the family's own two hours is the whole point of having asked for a number
  // instead of a shape, where "you're a late family" was a label they never
  // chose. What the line must not do is promise a curfew. It used to say "I
  // won't book anything before 7:30 am", which is both more than Aly should
  // promise and less than a family wants: the six o'clock boat and the nine
  // o'clock dinner table are often the best thing in a place. So the promise is
  // the shape of an ordinary day, plus the undertaking to say so out loud on
  // the day something worth doing falls outside it.
  if (answer.kind === "band" && typeof answer.picked === "string") {
    const band = parseBandNote(answer.picked);
    if (band) {
      const start = formatClock(band.start);
      const end = formatClock(band.end);
      const lateEnd = band.end >= 1380;
      return lateEnd
        ? `Your day runs ${start} to ${end}. On ${dest}, that is the day I will build by default, with the evening left long enough for dinner and whatever follows it -- and when the thing worth doing only happens outside those hours, I will say so instead of dropping it.`
        : `Your day runs ${start} to ${end}. On ${dest}, that is the day I will build by default, with dinner aimed to land inside those hours -- and when the thing worth doing only happens outside them, I will say so instead of dropping it.`;
    }
  }

  // The animals answer is the sentence the rows make, and the line says it
  // back with the promise that follows from it. Named animals rather than "your
  // pets", because the whole reason the question asks per animal is that the
  // answer is rarely the same for both.
  if (answer.kind === "pets" && typeof answer.picked === "string") {
    const said = answer.picked.trim();
    if (said) {
      return `${said} On ${dest}, I'll plan around that -- the stay, the drives and the days -- and I'll ask before anything assumes otherwise.`;
    }
  }

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
