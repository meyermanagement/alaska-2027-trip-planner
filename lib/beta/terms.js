/**
 * The parts of the public beta terms that the gate does not show.
 *
 * The thirteen sections a tester scrolls through at /welcome/beta are the
 * agreement, and they are not repeated here: /beta-terms imports AGREEMENT from
 * lib/beta/agreement.js and draws exactly those, so a tester who wants to reread
 * what they accepted is reading the same words rather than a public
 * approximation of them. That is the whole point of the split.
 *
 * What is here is the framing a standalone document needs and a consent screen
 * has no business carrying: who the agreement is with, how it is entered into,
 * and the three housekeeping clauses at the end that matter only if something
 * has already gone wrong.
 *
 * Adding a clause here that changes what a tester is agreeing to means bumping
 * AGREEMENT_VERSION, the same as changing one of the thirteen. A clause on a
 * public page is not a clause somebody agreed to unless they were shown it.
 */

import { BETA_ENDS, SUPPORT_EMAIL } from "@/lib/beta/agreement";
import { CONTROLLER } from "@/lib/privacy";

export const TERMS_INTRO = `These are the terms of taking part in the Alyeska beta. They are between you and ${CONTROLLER.name} of ${CONTROLLER.place}. You accept them on the screens shown the first time you sign in as a tester, and the version you accepted, the date, and the build are recorded on your account and shown back to you in Settings.`;

// Said before the agreement rather than after it, because "am I even eligible"
// and "what is this thing" are the two questions somebody has before they will
// read a word of the rest.
export const TERMS_BEFORE = [
  {
    id: "who",
    heading: "Who can take part",
    body: "You need an invitation code, an account, and to be 18 or older. You may add the rest of your household as travelers, including children, but the account and this agreement are yours. Testing is free and nothing in the beta is for sale.",
  },
  {
    id: "how",
    heading: "How you accept",
    body: "By working through the beta screens on your first sign-in and pressing the button at the end. Nothing is recorded until then, and closing the app before it changes nothing. If you would rather not accept, do not press it and tell us; there is no penalty for reading this and walking away.",
  },
];

// After the agreement: the clauses that decide what happens when the rest of it
// is already in dispute.
export const TERMS_AFTER = [
  {
    id: "whole",
    heading: "The whole of it",
    body: "This agreement and the privacy policy are the entire understanding between us about the beta, and they replace anything said in an email, a chat, or a call before you accepted. Nothing either of us says informally changes them.",
  },
  {
    id: "severable",
    heading: "If one part fails",
    body: "If a court finds any section unenforceable, that section is narrowed only as far as it must be, and the rest stays in force.",
  },
  {
    id: "transfer",
    heading: "Transfers",
    body: "You cannot transfer your place in the beta to somebody else. We may transfer this agreement to a successor if the business changes hands, and we will tell you before your information moves.",
  },
  {
    id: "after",
    heading: "What survives the beta ending",
    body: `The beta ends ${BETA_ENDS}. The sections on feedback, confidentiality, warranty, liability, and governing law carry on after that, and after you leave. Everything else stops when your access does.`,
  },
  {
    id: "questions",
    heading: "Questions about these terms",
    body: `${SUPPORT_EMAIL}. If a section reads as though it means something we clearly did not intend, that is worth telling us, and it is the kind of thing we fix rather than defend.`,
  },
];
