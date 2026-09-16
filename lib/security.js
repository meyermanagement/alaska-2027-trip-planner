// How to tell us a security problem, and what we do when you do.
//
// Every serious app has a page like this and Alyeska did not, which was the gap
// (07 item 13): a researcher who found a way to read another household's trips
// had no address to send it to, no idea whether we would thank them or threaten
// them, and no statement of what we would do afterwards. A private beta with
// passport scans in it cannot be missing that page.
//
// The words live here rather than in the page so that a change is one edit, and
// so that the reporting address is the same string the contact route uses.
//
// This is not the beta agreement or the privacy policy. It is a commitment about
// our own conduct, so it carries a review date rather than a consent version --
// changing it must not re-gate every tester's access, which is what bumping a
// versioned document does.

export const SECURITY_EMAIL = "admin@alyeska.app";

// Reviewed rather than agreed to. Kept as a plain date string so the page can
// print it without a locale surprise.
export const SECURITY_REVIEWED = "2026-09-16";

export const SECURITY_INTRO =
  "If you have found a way to reach information in Alyeska that should not be reachable — another household's trips, somebody else's travel documents, a way past a permission — please tell us. This page is the address, what we promise to do about it, and what we are asking you not to do while you look.";

export const SECURITY_SECTIONS = [
  {
    id: "report",
    heading: "How to report something",
    body: `Email ${SECURITY_EMAIL} with what you found and enough detail for us to reproduce it: the URL or screen, the account or household you were signed in as, what you expected, and what happened instead. A screenshot or a short recording helps more than a long description.`,
    note: `There is no separate security address and no bug bounty program. ${SECURITY_EMAIL} is read by the person who wrote the app.`,
  },
  {
    id: "response",
    heading: "What happens after you send it",
    points: [
      "We acknowledge your report within 3 business days.",
      "We tell you whether we could reproduce it, usually within 7 days.",
      "We tell you when it is fixed, and we credit you by name if you want that.",
      "If we decide not to fix something, we say so and why, rather than going quiet.",
    ],
  },
  {
    id: "notify",
    heading: "If personal information was exposed",
    body: "If we confirm that a security problem exposed personal information, we notify the affected households without undue delay and no later than 72 hours after we confirm it, by email to the address each account signs in with. The notice says what happened, what information was involved, what we have done, and what — if anything — the household should do. We notify regulators where the law requires it, on the timelines the law sets.",
    note: "We would rather send a notice that turns out to be cautious than sit on an unclear one. A beta is not a reason to tell somebody less.",
  },
  {
    id: "safe-harbor",
    heading: "Testing in good faith",
    body: "If you are looking for problems in good faith and you stay inside the lines below, we will not pursue a legal claim against you or ask anybody else to, and we will not close your beta account over it.",
    points: [
      "Use your own account and your own household, or one whose members asked you to test it.",
      "Stop as soon as you have proved a problem exists — do not read, keep, or share another household's information.",
      "Do not change or delete anybody else's data, and do not lock anybody out.",
      "Do not run load tests, denial-of-service attempts, or anything that degrades the service for the families using it.",
      "Do not use social engineering, phishing, or physical access against us or our testers.",
      "Give us a reasonable chance to fix it before you write about it publicly.",
    ],
  },
  {
    id: "scope",
    heading: "What is in scope",
    body: "The app at alyeska.app and its API, and the email address the app forwards booking confirmations to. Reports about our third-party providers — Supabase, Vercel, Google, Resend — should go to those providers, though we are glad to know about them.",
    note: "Findings we already know about and have written down: the beta is a private test with a small number of households, and some hardening work is deliberately scheduled rather than done. If you report something already on that list we will tell you so.",
  },
  {
    id: "no-answer",
    heading: "If we do not answer",
    body: `If you have emailed ${SECURITY_EMAIL} and heard nothing for 5 business days, send it again with URGENT in the subject line. A report that reached nobody is the failure this page exists to prevent.`,
  },
];
