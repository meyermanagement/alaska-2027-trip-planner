export const MINOR_REVIEW_NOTICE_VERSION = "2026-09-19-review-1";
export const MINOR_REVIEW_NOTICE = [
  { title: "Only their trips", body: "Your child can review itineraries for trips they are included on, never drafts, and their own assigned packing items. Booking references, documents, costs, private notes, and other people’s packing lists are not shown." },
  { title: "Review, not changes", body: "This enables a read-only view. Your child cannot check off items, edit plans, upload files, share location, send feedback, or use Ask Aly. Ask Aly is unavailable to anyone under 18." },
  { title: "You stay in control", body: "Only a parent or legal guardian should enable access. You can turn it off here. Your confirmation and its date are recorded; it is not an identity-verification record. Earlier requests do not activate this new access." },
  { title: "Privacy and help", body: "This view uses their existing sign-in and your saved trip details. It does not record screen-use analytics or send their activity to an AI provider. Essential authentication and security logs may still be kept. For access, correction, or deletion requests, contact admin@alyeska.app." },
];
export function validateMinorReview(body) {
  if (body?.askAly === true || body?.aiDisclosure === true) return "Ask Aly is unavailable to minors.";
  if (body?.guardian !== true || body?.collection !== true) return "Confirm that you are the parent or legal guardian and have read the read-only access notice.";
  return null;
}
