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
