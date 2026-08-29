/**
 * Telling somebody how to talk instead of type, on the device they are holding.
 *
 * Two screens in this app ask for a paragraph rather than a field: About You, and
 * the trip builder. A paragraph is what makes both of them work -- the difference
 * between advice that fits you and advice that would fit anybody is three
 * sentences of detail -- and a paragraph is exactly what nobody types on a phone.
 * Spoken, it takes twenty seconds. So the app should say so, and say how.
 *
 * "Use talk to text" is not saying how. The microphone is in a different place on
 * every platform, it is off by default on two of them, and on a Mac it is not a
 * button at all. Generic advice sends somebody hunting through Settings, which is
 * worse than not offering, so this module holds one specific set of steps per
 * platform and the app shows exactly one of them.
 *
 * Every step below comes from the vendor's own documentation, cited on each
 * entry, because these details move between OS versions and a wrong instruction
 * is worse than none.
 *
 * Deliberately OS dictation and not the browser's speech API. OS dictation works
 * in every field on the device, needs no microphone permission prompt from us,
 * keeps the audio inside the platform the person already trusts, and is the thing
 * they may already use for messages. A record button of our own would be a second
 * way to do a thing their phone already does well.
 */

/** The platforms we have real steps for, plus the honest fallback. */
export const PLATFORMS = [
  "ios",
  "ipados",
  "macos",
  "android",
  "windows",
  "unknown",
];

/**
 * What device this is, from a user-agent string.
 *
 * Sniffing a user agent is usually a mistake -- it is a lie by design and the
 * wrong tool for deciding what a browser can do. Here it is the right one,
 * because the question is not what the browser supports, it is which set of
 * printed instructions to show a human being, and getting that wrong costs a
 * confusing sentence rather than a broken feature.
 *
 * iPadOS is picked out from macOS with the touch-points check: an iPad reports
 * itself as a Mac in Safari, and telling somebody to press a function key on a
 * device with no function keys is exactly the sort of nonsense this module exists
 * to avoid.
 */
export function readPlatform(userAgent, { touchPoints = 0 } = {}) {
  const ua = String(userAgent || "");
  if (!ua) return "unknown";

  if (/iPhone|iPod/i.test(ua)) return "ios";
  if (/iPad/i.test(ua)) return "ipados";
  if (/Android/i.test(ua)) return "android";
  if (/Windows NT|Win64|Win32/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) {
    // An iPad in desktop mode says Macintosh. A real Mac reports no touch
    // points; an iPad reports five.
    if (Number(touchPoints) > 1) return "ipados";
    return "macos";
  }
  // Chrome OS, Linux, and anything we have not met. Both have dictation stories
  // that vary too much to print with confidence, so they get the honest answer.
  return "unknown";
}

/** Read the platform from the live browser. Returns "unknown" on the server. */
export function browserPlatform() {
  if (typeof navigator === "undefined") return "unknown";
  return readPlatform(navigator.userAgent, {
    touchPoints: navigator.maxTouchPoints || 0,
  });
}

/**
 * The steps, per platform.
 *
 * `headline` is one line, because most people need only the first sentence -- the
 * mic is right there and they have used it before. `steps` are the ones who have
 * not, and `turnOn` is the setting that has to be on first where there is one,
 * kept separate so the common case is not buried under setup.
 */
const GUIDES = {
  ios: {
    label: "iPhone",
    headline: "Tap the microphone on the keyboard, then just talk.",
    steps: [
      "Tap in the box so the keyboard comes up.",
      "Tap the microphone button on the keyboard.",
      "Talk normally. Say “period” and “new paragraph” for punctuation.",
      "Say “stop dictation”, or tap the microphone again, when you are done.",
    ],
    turnOn:
      "If there is no microphone on the keyboard: Settings → General → Keyboard → turn on Enable Dictation.",
    note: "It stops on its own after about 30 seconds of quiet, so pause and carry on rather than rushing.",
    source:
      "https://support.apple.com/guide/iphone/dictate-text-iph2c0651d2/ios",
    sourceLabel: "Apple Support",
  },
  ipados: {
    label: "iPad",
    headline: "Tap the microphone on the keyboard, then just talk.",
    steps: [
      "Tap in the box so the keyboard comes up.",
      "Tap the microphone button on the onscreen keyboard.",
      "Talk normally. Say “period” and “new paragraph” for punctuation.",
      "Say “stop dictation”, or tap the microphone again, when you are done.",
    ],
    turnOn:
      "If there is no microphone on the keyboard: Settings → General → Keyboard → turn on Enable Dictation.",
    note: "It stops on its own after about 30 seconds of quiet, so pause and carry on rather than rushing.",
    source:
      "https://support.apple.com/guide/iphone/dictate-text-iph2c0651d2/ios",
    sourceLabel: "Apple Support",
  },
  macos: {
    label: "Mac",
    headline: "Click in the box, then press the microphone key — or Fn twice.",
    steps: [
      "Click in the box so the cursor is in it.",
      "Press the microphone key in the function row, or press Fn twice, or choose Edit → Start Dictation.",
      "Wait for the cursor to pulse, then talk normally.",
      "Press Escape when you are done.",
    ],
    turnOn:
      "First time only:  → System Settings → Keyboard → Dictation → turn it on.",
    note: "On an Apple silicon Mac you can keep typing while you talk, so you can fix a word without stopping.",
    source:
      "https://support.apple.com/guide/mac-help/use-dictation-mh40584/mac",
    sourceLabel: "Apple Support",
  },
  android: {
    label: "Android",
    headline: "Tap the microphone at the top of the keyboard, then just talk.",
    steps: [
      "Tap in the box so the keyboard comes up.",
      "Tap the microphone at the top of the keyboard.",
      "Wait for “Speak now”, then talk normally.",
      "Tap the microphone again to pause.",
    ],
    turnOn: "If it asks for permission to record, choose “While using app”.",
    note: "",
    source:
      "https://support.google.com/gboard/answer/2781851?hl=en&co=GENIE.Platform=Android",
    sourceLabel: "Gboard Help",
  },
  windows: {
    label: "Windows",
    headline: "Click in the box and press the Windows key + H.",
    steps: [
      "Click in the box so the cursor is in it.",
      "Press the Windows key and H together.",
      "Wait for “Listening…”, then talk normally.",
      "Say “stop listening” when you are done.",
    ],
    turnOn:
      "It needs an internet connection and a working microphone. On a tablet, press the microphone on the touch keyboard instead.",
    note: "",
    source:
      "https://support.microsoft.com/en-us/accessibility/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc",
    sourceLabel: "Microsoft Support",
  },
  unknown: {
    label: "your device",
    headline: "Most phones and computers will type what you say.",
    steps: [
      "Tap or click in the box first.",
      "On a phone, look for the microphone on the keyboard.",
      "On a computer, look for a dictation shortcut in the keyboard settings.",
    ],
    turnOn: "",
    note: "",
    source: "",
    sourceLabel: "",
  },
};

/**
 * The guide for one platform. Anything unrecognized gets the honest fallback
 * rather than a guess, so a new device never receives instructions for a
 * different one.
 */
export function dictationGuide(platform) {
  return GUIDES[platform] || GUIDES.unknown;
}

/** The guide for the browser this is running in. */
export function browserDictationGuide() {
  return dictationGuide(browserPlatform());
}

/**
 * Whether we have real, sourced steps -- as opposed to the fallback. A screen can
 * use this to decide whether to promise anything specific.
 */
export function hasRealSteps(platform) {
  return platform !== "unknown" && Boolean(GUIDES[platform]);
}

/**
 * The invitation itself, which is a different sentence on a phone than on a
 * computer: on a phone talking is plainly faster than typing, and on a computer
 * it is a preference. Overstating it on a desktop makes the app sound like it is
 * nagging.
 */
export function dictationInvite(platform) {
  if (platform === "ios" || platform === "ipados" || platform === "android") {
    return "Easier to say than to type";
  }
  if (platform === "macos" || platform === "windows") {
    return "You can talk instead of typing";
  }
  return "You can talk instead of typing";
}
