/**
 * What both ends of the feedback sheet agree on.
 *
 * The sheet is a client component and the route is a server one, and the two
 * have to hold the same numbers or somebody finds out at the send button that
 * the picture they attached was never going to be accepted. So the caps, the
 * two intents and the name of the event that opens the sheet all live here.
 */

/** The event any part of the app can fire to open the sheet. */
export const FEEDBACK_EVENT = "alyeska:feedback";

/**
 * Fired by the menu whenever it opens or shuts, with `{ open }`.
 *
 * The report button lies at the bottom of the screen, in the gap between the
 * compass and Ask Aly, and the compass grows a search pill through that gap when
 * the menu opens. Rather than have the two overlap, the menu says what it is
 * doing and the button gets out of the way.
 */
export const MENU_EVENT = "alyeska:menu";

/** The bucket the pictures land in. Private; read back through signed links. */
export const SHOT_BUCKET = "feedback-shots";

/**
 * Two intents, because a broken screen and a wish are read in different moods
 * and want sorting differently on the desk. Deliberately not a longer list:
 * every extra option is a decision asked of somebody who only wanted to say
 * that a button did nothing.
 */
export const FEEDBACK_KINDS = [
  {
    id: "problem",
    label: "Something is wrong",
    hint: "A screen, a save, a number that is not right",
  },
  {
    id: "idea",
    label: "An idea",
    hint: "Something you wish the app did",
  },
];

export const FEEDBACK_KIND_IDS = FEEDBACK_KINDS.map((one) => one.id);

/** How a kind is written on the desk and in the email. */
export function kindLabel(id) {
  const found = FEEDBACK_KINDS.find((one) => one.id === id);
  return found ? found.label : "Something is wrong";
}

export const MAX_SHOTS = 3;
export const MAX_SHOT_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_SHOT_BYTES = 12 * 1024 * 1024;
export const MAX_BODY_CHARS = 4000;
export const MIN_BODY_CHARS = 4;

/** The longest edge a picture is reduced to in the browser before it is sent. */
export const SHOT_LONG_EDGE = 1600;

export const ACCEPTED_SHOT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
];

/** The statuses a report moves through on the desk. */
export const FEEDBACK_STATUSES = ["new", "read", "fixed", "declined"];

export function statusLabel(status) {
  switch (status) {
    case "read":
      return "Read";
    case "fixed":
      return "Fixed";
    case "declined":
      return "Not doing";
    default:
      return "New";
  }
}

export function humanBytes(bytes) {
  const mb = Number(bytes || 0) / (1024 * 1024);
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

/**
 * A third kind of report, and the only one nobody writes: something the app did
 * to itself. A fault is recorded where it happened, with the same context a
 * person's report carries, so a screen that throws on a Tuesday does not depend
 * on a tester noticing and finding the words for it.
 */
export const FAULT_KIND = "fault";

/** Where a fault was noticed. */
export const FAULT_SOURCES = {
  script: "Threw on the screen",
  promise: "A promise nobody caught",
  call: "A call came back broken",
  chunk: "Part of the app would not load",
};

export function faultSourceLabel(source) {
  return FAULT_SOURCES[source] || "Something broke";
}

/**
 * How much noise one visit is allowed to make. A screen that throws inside a
 * render loop can throw hundreds of times a second, and neither the desk nor
 * the tester's data plan should carry that: each distinct fault is sent once
 * per visit, and a visit sends at most this many.
 */
export const MAX_FAULTS_PER_VISIT = 8;
export const MAX_FAULT_MESSAGE_CHARS = 300;
export const MAX_FAULT_STACK_CHARS = 2000;

/**
 * Noise worth nobody's evening. Browser extensions, a scroll observer
 * complaining about its own loop, and the cancel that every abandoned fetch
 * throws are all normal and none of them are bugs in this app.
 */
export const FAULT_NOISE = [
  "ResizeObserver loop",
  "Script error",
  "The operation was aborted",
  "AbortError",
  "cancelled",
  "canceled",
  "Load failed",
  "NetworkError when attempting to fetch",
  "Failed to fetch",
  "The user aborted a request",
  "play() request was interrupted",
];

export function looksLikeNoise(message) {
  const text = String(message || "");
  if (!text.trim()) return true;
  return FAULT_NOISE.some((one) => text.includes(one));
}

/**
 * The name an issue is called by out loud.
 *
 * Every report gets a number of its own, because the way this log is actually
 * used is that somebody reads a row, then asks for it to be fixed in a sentence
 * -- and a UUID is not something a person retypes or reads over a phone. Three
 * digits is enough for a beta and keeps the label the same width in a column.
 */
export function issueName(ref) {
  const n = Number(ref);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `ISS-${String(n).padStart(3, "0")}`;
}

/**
 * Whether a row can be handed straight over, or wants a conversation first.
 *
 * Not a judgment about difficulty. It is about whether the thing to do is
 * already decided: a misspelt word, a stack trace, a control that overlaps
 * another one all have one obvious right answer, and asking about them wastes
 * the exchange. A wish, a disagreement about how something should work, or a
 * report that could mean three different things needs the conversation before
 * any code.
 */
export const FIX_ROUTES = {
  auto: "Can be fixed as asked",
  talk: "Needs a conversation",
};

export function routeLabel(route) {
  return FIX_ROUTES[route] || "Not judged yet";
}

/**
 * Words that give a report away as already decided. Deliberately about the
 * shape of the complaint rather than the feature: "cut off", "does nothing" and
 * "misspelt" describe something that is plainly wrong, whatever screen it is on.
 */
const SETTLED = [
  "typo",
  "misspell",
  "misspelt",
  "spelled",
  "spelling",
  "wrong word",
  "cut off",
  "cuts off",
  "off screen",
  "off the screen",
  "overlap",
  "wraps",
  "wrapping",
  "too small",
  "unreadable",
  "cannot read",
  "blank",
  "white screen",
  "does nothing",
  "doesn't do anything",
  "not clickable",
  "broken link",
  "404",
  "crash",
  "crashed",
  "wrong date",
  "wrong total",
  "does not save",
  "did not save",
];

/**
 * The suggestion, for a row nobody has judged yet. A guess, and labeled as one
 * everywhere it is shown: it exists so that a log of sixty rows can be sorted
 * into the ones worth a reply and the ones worth a commit, not to decide
 * anything on its own.
 */
export function guessRoute(row) {
  if (!row) return "talk";
  if (row.kind === FAULT_KIND) return "auto";
  if (row.kind === "idea") return "talk";
  const text = String(row.body || "").toLowerCase();
  return SETTLED.some((one) => text.includes(one)) ? "auto" : "talk";
}
