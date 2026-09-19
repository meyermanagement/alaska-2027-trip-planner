/**
 * The privacy policy, in the words a family reads rather than the words a
 * boilerplate generator produces.
 *
 * It lives here rather than inside the page for the same reason the pledge and
 * the beta agreement do: the categories it describes are the same seven a tester
 * reads at the gate, and a policy that says one thing on /privacy and another on
 * /welcome/beta is worse than no policy. So the categories are not restated here
 * at all -- the page imports DATA_CATEGORIES from lib/beta/agreement.js and draws
 * the same rows. What this file adds is everything a policy needs that a consent
 * screen has no room for: who the processors are, what the law lets you demand,
 * and how long each thing survives.
 *
 * Both stores want this reachable on a plain URL with no sign-in and no
 * geofence, because the reviewer opening it is not a customer and has no
 * account. That is decided in middleware.js and lib/beta/consent.js, not here,
 * but it is the reason the page draws nothing that needs a session.
 *
 * PRIVACY_VERSION in lib/beta/agreement.js is the version this text is known by.
 * Changing anything below that changes what is being disclosed -- a new
 * processor, a longer retention period, a new category -- means bumping it, and
 * every tester is asked again on their next navigation.
 */

import {
  AI_PROVIDER,
  PRIVACY_VERSION,
  SUPPORT_EMAIL,
} from "@/lib/beta/agreement";

// The company on the hook for all of this. A policy that never says who is
// promising is not enforceable by the person reading it.
//
// One definition, on purpose. It is the "From" line and the contact section of
// the privacy policy and the counterparty named in the beta terms, so the name
// cannot be allowed to drift between the page that makes the promise and the
// agreement that binds it.
export const CONTROLLER = {
  name: "CRM Elite Cohort",
  place: "Webster Groves, Missouri, United States",
  email: SUPPORT_EMAIL,
};

// Said as a date rather than a revision number, because "effective September 13,
// 2026" tells you whether you have read this one and "v3" does not.
export const EFFECTIVE = PRIVACY_VERSION;

export const PRIVACY_INTRO =
  "Alyeska plans trips for one household at a time. That means it holds some of the most personal information a family has: who they are, where they are going, and the documents that get them through a border. This page says exactly what is held, who else ever sees it, how long it lasts, and what you can make us do about it. It is written to be read, not to be survived.";

/**
 * Everyone outside this company that any part of your information reaches, what
 * they do with it, and why they have it at all.
 *
 * The honest list, including the ones nobody thinks to disclose: the host that
 * writes a request line to a log, the weather service that gets a pair of
 * coordinates. `sends` is what actually leaves, in the narrowest true terms,
 * because "we may share data with service providers" is the sentence that made
 * nobody trust any of these pages.
 */
export const PROCESSORS = [
  {
    name: "Supabase",
    role: "Database, sign-in, and file storage",
    sends:
      "Everything the app stores: your account, your household, your trips, your documents.",
    where: "United States",
  },
  {
    name: "Vercel",
    role: "Hosting",
    sends:
      "The requests your app makes, including the address of the page and your IP address, written to server logs.",
    where: "United States",
  },
  {
    // AI_PROVIDER already says Google, so wrapping it in "Google (...)" read as a
    // company inside itself.
    name: AI_PROVIDER,
    role: "Aly's answers and generated trip images",
    sends:
      "Your question and the trip context sent with it, only when you have turned Aly on.",
    where: "United States",
  },
  {
    // Listed for the same reason the weather service is: something derived from
    // something you typed leaves the building, and this page promised the list
    // would include the ones nobody thinks to disclose. What leaves is five
    // characters of a hash, and it leaves from our server, so this service never
    // sees your device, your address, or which account was signing up.
    name: "Have I Been Pwned, served by Cloudflare",
    role: "Checking a new password against known breaches",
    sends:
      "Five characters of a one-way hash of the password you chose, sent by our server, not your device. Never the password, never your email address, never your IP address.",
    where: "United States and Cloudflare's global edge",
  },
  {
    name: "Google (Places API)",
    role: "Place names, addresses, and opening hours",
    sends:
      "The search term and, if you have turned location on, roughly where you are. Not your name and not your trip.",
    where: "United States",
  },
  {
    name: "Postmark",
    role: "Receiving forwarded confirmations",
    sends:
      "The confirmation emails you forward to your household inbox address, only if you turn that on.",
    where: "United States",
  },
  {
    name: "Google Workspace",
    role: "Sending reminders and account email from admin@alyeska.app",
    sends: "Your email address and the contents of the message being sent.",
    where: "United States",
  },
  {
    name: "Open-Meteo and the US National Weather Service",
    role: "Forecasts",
    sends:
      "A pair of coordinates and a date range. Nothing that identifies you or your household.",
    where: "European Union and United States",
  },
];

/**
 * The AI section, kept apart from the rest because it is the part the stores ask
 * about by name and the part a reasonable person most wants a straight answer
 * on. Apple asks for personal data going to a third-party AI to be disclosed and
 * explicitly permitted; this is the disclosure, and the choice on the beta gate
 * and the switch in Settings are the permission.
 */
export const AI_SECTION = {
  heading: "Aly and the AI provider",
  body: `Aly is not a person and not our own model. When you ask her something, your question and the parts of your trip needed to answer it are sent to ${AI_PROVIDER} and processed on servers in the United States. ${AI_PROVIDER} is the only model provider we send to; if that ever changes we will name the new one here and ask you again before anything reaches it. This is the one place your household's information leaves our own systems for a purpose other than storing or delivering it, so it is a choice you make rather than a default you discover.`,
  points: [
    "You are asked before any of it is sent, on your first run and never by a pre-ticked box.",
    "Turning Aly off in Settings stops the sending. It is enforced where the model is called, so the answer is refused rather than the button hidden.",
    "Turning her off also stops our overnight reminder and deadline jobs from sending anything, even though nobody is signed in when they run.",
    "Under the paid API terms your content is not used to train their models.",
    "Prompts are kept up to 30 days on their side for abuse monitoring, then deleted.",
    "What is sent with a question about a trip: the travelers on it and their ages, dietary and accessibility notes, dates, destinations, bookings, whether a document or policy needs attention, and what an insurance policy pays \u2014 its limits and its deductible, because those are what decide whether a claim is worth filing.",
    "What is never sent: your passwords, passport and document numbers, policy numbers, what you paid for a policy, payment card details, and anything belonging to another household.",
    "Your uploaded files stay in our storage unless you use Read this document on one, which sends that one file to be read and needs its own permission. Aly does not open your documents to answer an ordinary question.",
  ],
};

// Not a legal section: the promises from Our Pledge, stated here as commitments
// rather than marketing, because "we do not sell your data" belongs in the
// document you can hold somebody to.
export const NEVER = [
  "We do not sell your personal information, and we never have. Not to advertisers, not to data brokers, not as part of a deal.",
  "We do not show ads and we take no money to recommend a hotel, an airline, or anything else.",
  "We do not use your trips, documents, or family details to train any AI model, ours or anybody else's.",
  "We do not track you across other apps and websites, and the app contains no advertising or analytics SDK that does.",
];

/**
 * The rest of the policy, in the order somebody actually needs it: what happens
 * to it, who can read it here, how it is protected, what you can demand, and
 * then the housekeeping.
 *
 * `points` where the content is a list somebody will come back to check, and
 * `body` where it is genuinely one thought. Nothing here is longer than a
 * paragraph, because the version of this document that gets read is the one that
 * can be read on a phone in a departure lounge.
 */
export const PRIVACY_SECTIONS = [
  {
    id: "household",
    heading: "Who can see it inside the app",
    body: "A household shares one set of trips. Every signed-in member can read and edit the trips, bookings, documents, and travelers in it, and there is no per-item privacy. No other household can see any of it and nothing is public. If you add somebody else's passport, birth date, or itinerary, you are handling their information, so ask them first.",
  },
  {
    id: "staff",
    heading: "Who can see it at our end",
    body: "While the beta runs, we can read forwarded booking email, conversations with Aly, and diagnostics, because that is how a parser that misreads a confirmation or an assistant that answers wrongly gets found. Everything else is reached only when you ask us for help with a specific problem, or when the law requires it. Access is limited to the people running the beta, and it ends when the beta does.",
  },
  {
    id: "retention",
    heading: "How long it lasts",
    points: [
      "Your account, household, trips, and documents: until you delete them or delete your account.",
      "Original forwarded email messages: the stored copy of the mail is discarded after 30 days. A short record of what arrived and which trip it was filed to stays, and so does the booking read out of it.",
      "Conversations with Aly: 90 days, then deleted.",
      "Diagnostics: 90 days, then deleted, and you can turn them off entirely.",
      "Location: used to answer the question in front of you and not stored.",
      "After you delete your account: removed from our systems within 30 days, and from routine backups within 90, other than what the law requires us to keep.",
    ],
  },
  {
    id: "security",
    heading: "How it is protected",
    points: [
      "Encrypted in transit over HTTPS and encrypted at rest by the database and file storage.",
      "Row-level security in the database itself, so a household's rows are unreachable by another household's session rather than merely unrequested by the app.",
      "Documents are served through short-lived signed links rather than public URLs.",
      "The one exception is the artwork on a trip: those pictures are drawn for you rather than uploaded by you, and they sit at an unlisted web address anyone with the link could open, which is what lets them load instantly and work offline. They hold no personal information. They are deleted with your account, although a copy already sitting in a content network's cache can take a while to expire.",
      "Sign-in is handled by our authentication provider. We never see or store your password.",
      "When you choose a password we check it against a public list of passwords exposed in known breaches, and refuse the ones that appear there. Your browser turns the password into a one-way hash, and only the first five characters of that hash leave — from our server rather than your device. Those five characters match thousands of unrelated passwords, and the comparison that matters happens on your device, so neither we nor the breach service can tell which password you chose.",
      "No system is perfect. If a breach affects your information we will tell you and the regulators we are required to tell, without waiting to be asked.",
    ],
  },
  {
    id: "controls",
    heading: "What you can change yourself",
    points: [
      "Turn Aly off, which stops anything being sent to the AI provider.",
      "Turn diagnostics off.",
      "Turn each optional part on or off: forwarded email, reminders, location, reading fields from documents, and the calendar subscription.",
      "Withdraw your beta consent, which keeps your account and closes the app until you agree again.",
      "Delete a document, a traveler, a trip, or the whole account.",
    ],
    note: "All of it is in Settings, under Beta consent and privacy. None of it requires emailing us.",
  },
  {
    id: "rights",
    heading: "Your rights",
    body: "Depending on where you live, you can ask us to give you a copy of what we hold, correct it, delete it, hand it to somebody else in a portable form, or stop a particular use of it. You can also object to processing and, in the European Economic Area and the United Kingdom, complain to your data protection authority. Under California law you can ask what we collected and why, ask for it to be deleted or corrected, and be told we do not sell or share it for cross-context advertising, which we do not. We will not treat you worse for asking.",
    note: `Write to ${SUPPORT_EMAIL} and we will answer within 30 days. We may ask you to confirm you control the account before we hand anything over, which is a protection for you rather than an obstacle.`,
  },
  {
    id: "basis",
    heading: "Why we are allowed to hold it",
    points: [
      "To provide the app you asked for: performance of our agreement with you.",
      "For AI processing, forwarded email, notifications, location, and document reading: your consent, given at the gate and withdrawable in Settings.",
      "For security, fraud prevention, and fixing what is broken: our legitimate interests, weighed against yours.",
      "For records the law requires us to keep: legal obligation.",
    ],
  },
  {
    id: "children",
    heading: "Children",
    body: "Independent sign-in requires you to be 18 or older. A parent may add a child as a traveler so plans and packing fit the family. A parent can also open a temporary, read-only view of that child’s assigned non-draft trips and own packing. The child does not sign in, use Ask Aly, send messages, edit lists, upload files, share location, or register for push notifications. This view uses a necessary access cookie and no screen-use analytics or session replay. Parent authorization and security records are scheduled for removal after 30 days; essential hosting and security logs may also be retained under the policies described here. Parent passkey public keys remain until the parent account is deleted. Revoking a login does not itself delete existing traveler information. Parents can contact us for access, correction, or deletion.",
  },
  {
    id: "transfers",
    heading: "Where in the world it sits",
    body: "Our database, file storage, and hosting are in the United States, and so is the AI provider. If you use the app from outside the United States your information is transferred there. Where the law requires a transfer mechanism, we rely on the standard contractual clauses in our agreements with those providers.",
  },
  {
    id: "labels",
    heading: "What the store labels say",
    body: "The App Store privacy card and the Google Play data safety section describe the same collection this page does. If you ever find a difference between them, this page is the one we stand behind, and telling us is a bug report worth sending.",
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: `This version is dated ${EFFECTIVE}. If what we collect or who receives it changes, we change the date, and every beta tester is shown the changed screens and asked again before carrying on. We will not treat an old agreement as agreement to something new.`,
  },
  {
    id: "contact",
    heading: "Reaching us",
    body: `${CONTROLLER.name}, ${CONTROLLER.place}. Questions, requests, and anything you want on the record: ${CONTROLLER.email}. A person reads it.`,
  },
];
