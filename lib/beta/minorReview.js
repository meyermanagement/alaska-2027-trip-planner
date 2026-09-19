export const MINOR_REVIEW_NOTICE_VERSION = "2026-09-19-parent-view-1";
export const MINOR_REVIEW_NOTICE = [
  { title: "Only their trips", body: "Your child can review itineraries for trips they are included on, never drafts, and their own assigned packing items. Booking references, documents, costs, private notes, and other people’s packing lists are not shown." },
  { title: "Review, not changes", body: "This enables a read-only view. Your child cannot check off items, edit plans, upload files, share location, send feedback, or use Ask Aly. Ask Aly is unavailable to anyone under 18." },
  { title: "A separate, temporary view", body: "Your child does not sign in. This browser loses your adult Alyeska session and receives a view-only pass lasting two hours. Returning requires your parent passkey and a fresh sign-in. You can close open views from another signed-in device." },
  { title: "Protect the device too", body: "Alyeska cannot lock your email, Google account, other browser profiles, or device. Close other signed-in tabs and use Guided Access or your device’s app-pinning controls before handing it over. Do not share your parent passkey or device unlock code." },
  { title: "Privacy and help", body: "This view uses parent-managed trip details and a necessary access cookie. It has no screen-use analytics, session replay, AI calls, location collection, or push registration. Essential hosting and security logs may still be kept. Parent authorization and its date are recorded. For data access, correction, or deletion, contact admin@alyeska.app." },
];
export function validateMinorReview(body) {
  if (body?.askAly === true || body?.aiDisclosure === true) return "Ask Aly is unavailable to minors.";
  if (body?.guardian !== true || body?.collection !== true) return "Confirm that you are the parent or legal guardian and have read the read-only access notice.";
  return null;
}
