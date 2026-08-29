// Deciding whether a finger meant to turn the page.
//
// The day carousel used to change days whenever a touch ended more than 60px
// to the left or right of where it started, and that is not the same question.
// Scrolling a long day with a thumb traces a shallow arc, so a scroll that
// wanders sideways read as a flick. Dragging a selection handle across a note
// read as a flick too. Both moved the day out from under the reader.

// How far across the screen a finger has to travel before we believe it.
export const SWIPE_MIN_DISTANCE = 64;
// And how much more horizontal than vertical that travel has to be. A scroll
// that drifts 70px sideways while traveling 400px down is a scroll.
export const SWIPE_AXIS_RATIO = 2;
// Vertical travel this far before the horizontal has committed settles the
// question: the gesture is a scroll, and nothing later in it can change days.
export const SWIPE_AXIS_LOCK = 14;
// A flick is quick. A long press-and-drag is someone working with text.
export const SWIPE_MAX_DURATION = 800;

/**
 * Which way, if any, a finished touch wants to turn: 1 for the next day, -1 for
 * the previous one, 0 to leave the day alone. Kept apart from the component so
 * the rules can be argued with directly rather than through a browser.
 */
export function swipeDirection({
  dx = 0,
  dy = 0,
  elapsed = 0,
  canceled = false,
  hasSelection = false,
} = {}) {
  // Axis already lost to a scroll, or a second finger arrived and this is a
  // pinch or a two-finger scroll.
  if (canceled) return 0;
  // Ending a touch with text highlighted means the touch was about the text.
  if (hasSelection) return 0;
  if (elapsed > SWIPE_MAX_DURATION) return 0;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return 0;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * Whether the vertical travel so far has settled the gesture as a scroll.
 * Checked as the finger moves, so a scroll can never become a flick partway
 * through however far it later drifts sideways.
 */
export function scrollWon(dx = 0, dy = 0) {
  return Math.abs(dy) > SWIPE_AXIS_LOCK && Math.abs(dy) > Math.abs(dx);
}

// Anything a finger might legitimately drag inside: text fields, the notes
// box, links, buttons, and anything that has asked to be left alone.
const CONTROL_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a",
  "label",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[role='button']",
  "[data-no-swipe]",
].join(", ");

/** Whether a touch began somewhere that owns its own dragging. */
export function startsInControl(target) {
  if (!target || typeof target.closest !== "function") return false;
  return !!target.closest(CONTROL_SELECTOR);
}

/** The highlighted text right now, if the browser will say. */
export function selectionText() {
  if (typeof window === "undefined" || !window.getSelection) return "";
  try {
    return String(window.getSelection() || "").trim();
  } catch {
    return "";
  }
}
