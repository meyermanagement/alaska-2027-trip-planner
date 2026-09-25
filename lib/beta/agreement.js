/**
 * The words a beta tester is shown before they are let in, and the versions
 * those words are known by.
 *
 * They live here rather than in the screen that draws them for the same reason
 * the pledge does: the same paragraphs are read twice -- once at the gate, and
 * again from Settings by somebody deciding whether to take an answer back -- and
 * a promise that reads two ways is not one.
 *
 * Changing any wording that changes what is being agreed to means bumping
 * AGREEMENT_VERSION. Every stored consent still naming the old version stops
 * matching, and those testers walk the screens again on their next navigation.
 * Fixing a typo does not deserve that; adding a data category does.
 */

// Bump when the agreement's meaning changes. Dates rather than numbers so it is
// obvious from a database row when a tester agreed to what.
//
// 2026-09-14: the counterparty was renamed to CRM Elite Cohort and the address
// for questions and deletion requests moved to admin@alyeska.app. Who you are
// agreeing with, and where you write to hold them to it, are the two facts an
// agreement cannot quietly change under somebody -- so this is a bump rather
// than a typo fix, and every stored consent naming 2026-09-13 stops matching.
//
// 2026-09-24: Ask Aly's answers moved to the OpenAI API, a second AI processor.
// Who receives a household's text is the thing this agreement cannot change
// quietly, so every stored 2026-09-22 acceptance stops matching.
export const AGREEMENT_VERSION = "2026-09-24";

// Bump when the privacy policy changes. Kept apart from the agreement because
// the two are reissued for different reasons and a tester should not be walked
// through a liability waiver again because a retention period moved.
//
// 2026-09-14: the controller named on the policy changed, and so did the address
// a data subject writes to. The policy's own closing section promises that when
// who receives your information changes, the date changes and every tester is
// asked again. Leaving this at 2026-09-13 would have made that paragraph false
// and left one stored consent pointing at text that no longer exists.
//
// 2026-09-24: OpenAI added as a processor for Ask Aly's answers.
export const PRIVACY_VERSION = "2026-09-24";

// The processors named on the AI screen, in the words the tester is shown.
// AI_PROVIDER is stored alongside their answer, so if this ever changes the old
// consent cannot be mistaken for consent to the new one.
//
// Ask Aly's answers and reading forwarded booking email go to OpenAI. Web
// lookups, reading documents, fare alerts, tips, and everything else go to
// Google. lib/agent/llm.js and lib/inbox/parser.js route by the same split.
export const ASSISTANT_PROVIDER = "OpenAI API";
export const READER_PROVIDER = "Google Gemini API";
export const AI_PROVIDER = `${ASSISTANT_PROVIDER} and ${READER_PROVIDER}`;

// The build a consent was recorded against, so a bug report and a consent
// record can be lined up against the same software.
export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD || "0.9.4 (312)";

// When these builds stop working. Said out loud on the first screen, because a
// tester who is surprised by an expiry reads it as the app breaking.
export const BETA_ENDS = "December 12, 2026";

// Where the two documents live inside the app. Used by every link the app itself
// draws, because an absolute link to the production host from a preview build
// takes a tester out of the build they are testing and into a different one.
export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/beta-terms";

// The same two pages said absolutely, for the store listings and for the places
// where a URL is printed as text rather than linked. Both have to be reachable
// from outside the app, on a plain non-geofenced URL with no sign-in.
export const PRIVACY_URL =
  process.env.NEXT_PUBLIC_PRIVACY_URL || "https://alyeska.app/privacy";
export const TERMS_URL =
  process.env.NEXT_PUBLIC_TERMS_URL || "https://alyeska.app/beta-terms";
// The one address a tester is told to write to, and the same one the privacy
// policy prints for deletion and access requests, so it has to be a mailbox
// somebody actually opens rather than a plausible-looking alias.
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "admin@alyeska.app";

/**
 * The agreement itself, in plain language.
 *
 * Written to be read on a phone by somebody who wants to start using the app,
 * which is the only audience it will ever have. Every section is short enough
 * that skipping it is a choice rather than a necessity.
 */
export const AGREEMENT = [
  {
    id: "unfinished",
    heading: "This is unfinished software",
    body: "Alyeska is in beta. Screens change without notice, features appear and disappear, and things break. Do not rely on it as the only place a booking, a document, or a plan is written down.",
  },
  {
    id: "data-loss",
    heading: "Your data may be lost",
    body: "Beta databases get migrated, reset, and occasionally restored from a backup that is hours old. Keep your own copy of anything you would be upset to lose, especially passports, visas, and confirmations.",
  },
  {
    id: "no-warranty",
    heading: "No warranty",
    body: "The app is provided as is, without warranty of any kind. Nothing in it is a guarantee that a flight time is right, a border rule is current, or a document is where you left it.",
  },
  {
    id: "liability",
    heading: "Limit of liability",
    body: "To the fullest extent the law allows, we are not liable for indirect, incidental, or consequential losses arising from your use of the beta, including a missed connection, a canceled reservation, or a trip that cost more than the app estimated. Where liability cannot be excluded, it is limited to the amount you have paid us, which during the beta is nothing.",
  },
  {
    id: "not-advice",
    heading: "Alyeska is not an adviser",
    body: "Alyeska's suggestions are generated by an AI model and can be confidently wrong. Visa requirements, entry rules, medical guidance, insurance terms, and money matters must be checked against the airline, the consulate, the insurer, or a professional before you act on them.",
  },
  {
    id: "your-content",
    heading: "What you put in stays yours",
    body: "Your trips, documents, photos, and notes remain yours. You grant us only the permission needed to run the service for you: to store your content, show it to the members of your household, and pass the relevant parts to the providers listed on the next screens.",
  },
  {
    id: "feedback",
    heading: "Feedback becomes ours",
    body: "Bug reports, suggestions, survey answers, and anything you tell us about how the app should work are given freely and become ours to use, build, and ship without payment, credit, or obligation. This covers your feedback about the product. It does not cover your trips, your documents, or your family's information, which stay yours under the section above.",
  },
  {
    id: "confidentiality",
    heading: "Keep the unreleased parts to yourself",
    body: "The beta builds, unreleased features, prices under discussion, and screens you see before anyone else are confidential. Do not post screenshots publicly, write them up, or show them to anyone outside your household without asking us first. You may tell people the app exists and that you are testing it.",
  },
  {
    id: "no-reverse",
    heading: "What not to do",
    body: "Do not attempt to work around access controls, read other households' data, load malware, resell access, or use the app to break the law. We can end your access at any time, for any reason, without notice.",
  },
  {
    id: "ending",
    heading: "Ending your part in it",
    body: `You can stop at any time. Deleting your account in Settings removes your household's data on our side within 30 days, other than records the law requires us to keep. The beta itself ends ${BETA_ENDS}, when these builds stop working. Withdrawing consent for AI processing keeps your account and turns off Alyeska's AI.`,
  },
  {
    id: "changes",
    heading: "Changes to this agreement",
    body: "If what you are agreeing to changes, you will be shown the new version and asked again before you can carry on. We will not quietly treat an old acceptance as agreement to something new.",
  },
  {
    id: "law",
    heading: "Governing law",
    body: "This agreement is governed by the laws of the State of Missouri, United States, without regard to its conflict-of-laws rules.",
  },
  {
    id: "contact",
    heading: "Reaching us",
    body: `Questions, deletion requests, and anything you want on the record: ${SUPPORT_EMAIL}. The full terms are at ${TERMS_URL} and the privacy policy is at ${PRIVACY_URL}.`,
  },
];

/**
 * What the app collects, why, and how long it keeps it.
 *
 * The order is how close it sits to the person: their own account first, then
 * their household, then the things the app reaches out and reads, then what it
 * gathers about itself. `review` marks a category a human at our end can read
 * while the beta runs, which is the part of a beta nobody expects and everybody
 * should be told.
 */
export const DATA_CATEGORIES = [
  {
    id: "account",
    title: "Account and profile",
    what: "Your name, email address, sign-in method, and the preferences you set.",
    why: "To keep you signed in, to know which household is yours, and to draw the app the way you set it.",
    kept: "Until you delete your account.",
    review: false,
  },
  {
    id: "household",
    title: "Household members",
    what: "The people and animals you add: names, ages or birth dates, dietary notes, and travel preferences.",
    why: "So plans, packing, and Alyeska's suggestions fit the family actually going rather than an average one.",
    kept: "Until you remove the person or delete your account.",
    review: false,
  },
  {
    id: "email",
    title: "Booking email",
    what: "Confirmation emails you forward to your household's inbox address, and the flights, stays, and reservations read out of them.",
    why: "So a forwarded confirmation becomes an itinerary entry without anybody typing it in.",
    kept: "The parsed booking stays with the trip. The original message is discarded after 30 days.",
    review: true,
  },
  {
    id: "documents",
    title: "Travel documents",
    what: "Passports, visas, insurance certificates, tickets, and anything else you upload, along with the fields read out of them.",
    why: "So the passport, visa or certificate is in one place when somebody asks for it, and Alyeska can watch the dates that expire.",
    kept: "Until you delete the document or the account.",
    // Reviewable because of the reader: a file you choose to have read is sent to
    // the AI provider, which is a thing you should be able to see a record of and
    // turn off, not a storage detail.
    review: true,
  },
  {
    id: "location",
    title: "Location",
    what: "Your device's approximate location, only while a screen that uses it is open.",
    why: "For distances, local weather, and what is near you today. Never tracked in the background.",
    kept: "Used for the answer and not stored.",
    review: false,
  },
  {
    id: "assistant",
    title: "Conversations with Alyeska",
    what: "What you ask, what Alyeska answers, and the trip context sent with the question \u2014 travelers, dates, bookings, access needs, and coverage in general terms.",
    why: "So Alyeska remembers the thread, and so we can see what it gets wrong.",
    kept: "90 days, then deleted.",
    review: true,
  },
  {
    id: "diagnostics",
    title: "Beta diagnostics",
    what: "Crash reports, error messages, screen timings, and which features you opened.",
    why: "To find what is broken and what nobody can figure out how to use.",
    kept: "90 days, then deleted. Can be turned off below and in Settings.",
    review: true,
  },
];

/**
 * The optional parts, each of which the app has a working shape without.
 *
 * Asked at the gate rather than sprung later, and every one of them starts off.
 * `without` is the honest answer to "so what happens if I say no", which is the
 * question a permission prompt with two buttons and no explanation refuses to
 * answer.
 */
export const OPTIONAL_FEATURES = [
  {
    id: "mail",
    title: "Read forwarded confirmations",
    detail:
      "Your household gets its own inbox address. Anything you forward there is parsed into the trip.",
    without: "Add flights and stays by hand.",
  },
  {
    id: "notifications",
    title: "Reminders before they matter",
    detail:
      "A note the evening before about check-in, a passport about to expire, or a booking that needs confirming.",
    without: "Check the Reminders screen yourself.",
  },
  {
    id: "location",
    title: "Use where you are",
    detail:
      "Distances, weather, and what is nearby, worked out while the screen is open.",
    without: "Type a place name instead.",
  },
  {
    id: "documents",
    title: "Read fields from documents",
    detail: `Expiry dates, confirmation codes, and policy details pulled out of a file you choose, so you do not type them twice. The file itself is sent to ${READER_PROVIDER} to be read, and is not kept by them beyond their 30-day abuse window.`,
    without:
      "The file is stored and shown exactly as you uploaded it, and nothing is sent anywhere.",
  },
  {
    id: "calendar",
    title: "Add trips to your calendar",
    detail:
      "A subscription link your calendar app reads, so the itinerary shows up next to the rest of your week.",
    without: "Read the itinerary in the app.",
  },
];

/**
 * What the AI screen has to say before it asks. Kept as data so the same list
 * appears at the gate and in Settings without being written twice.
 */
export const AI_DISCLOSURE = {
  sent: [
    "Your question, and which trip you asked it about",
    "Names, ages, and travel preferences of the travelers on that trip",
    "Dates, destinations, and bookings relevant to the question",
    "Accessibility and dietary notes on those travelers, when they affect the answer",
    "Whether a travel document is expiring, and when \u2014 never its number",
    "Insurance coverage in practical terms: what is covered, the medical and evacuation limits, the deductible, the dates it runs, and whether anybody on the trip is not named on it",
  ],
  notSent: [
    "Your passwords or sign-in credentials",
    "Document and passport numbers, and policy numbers",
    "What you paid for an insurance policy",
    "Your uploaded files, unless you use Read this document on one of them",
    "Photos, unless you attach one to a question",
    "Payment card details",
    "Anything belonging to another household",
  ],
  terms: [
    `Alyeska's answers and forwarded booking email are handled by the ${ASSISTANT_PROVIDER}. Everything else goes to the ${READER_PROVIDER}, including web lookups, reading documents, fare alerts, and tips. If OpenAI is unavailable, the same work may go to Google instead.`,
    "These are the only two model providers we send to. Google processes on servers in the United States. OpenAI does not commit to a processing location for our account.",
    "Under both companies' API terms, your content is not used to train their models.",
    "Each keeps prompts up to 30 days for abuse monitoring, then deletes them. We tell OpenAI not to store answers for later use.",
    "Turning off Alyeska's AI stops the sending everywhere, including our overnight reminder and deadline jobs.",
  ],
  // The sentence the old list dodged. Without it, "your uploaded files, unless
  // you use Read this document" reads as a loophole rather than as a step
  // somebody takes deliberately.
  aside:
    "Reading a file is a separate step you take on purpose. Alyeska does not open your documents to answer an ordinary question.",
};
