export const MINOR_REVIEW_NOTICE_VERSION = "2026-09-19-parent-view-2";
export const MINOR_REVIEW_NOTICE = [
  { title: "Only their trips", body: "Your child can review itineraries for trips they are included on, never drafts, and their own assigned packing items. Booking references, documents, costs, private notes, and other people’s packing lists are not shown." },
  { title: "Their packing and their theme", body: "Your child can check or uncheck only their own assigned packing items and choose their theme. These choices are saved to their traveler profile and packing list for future visits, not to your theme. Itineraries are read-only. They cannot edit plans, add items, upload files, share location, send feedback, or use Ask Aly. Ask Aly is unavailable to anyone under 18." },
  { title: "A separate, temporary view", body: "Your child does not sign in. This browser loses your adult Alyeska session and receives a restricted trip pass lasting two hours. Returning requires your parent passkey and a fresh sign-in. You can close open views from another signed-in device." },
  { title: "Protect the device too", body: "Alyeska cannot lock your email, Google account, other browser profiles, or device. Close other signed-in tabs and use Guided Access or your device’s app-pinning controls before handing it over. Do not share your parent passkey or device unlock code." },
  { title: "Privacy and help", body: "This view uses parent-managed trip details and a necessary access cookie. It has no screen-use analytics, session replay, AI calls, location collection, or push registration. Essential hosting and security logs may still be kept. Parent authorization and its date are recorded. For data access, correction, or deletion, contact admin@alyeska.app." },
];
export function validateMinorReview(body) {
  if (body?.noticeVersion !== MINOR_REVIEW_NOTICE_VERSION) return "The trip-view notice has changed. Reload this page and review it before continuing.";
  if (body?.askAly === true || body?.aiDisclosure === true) return "Ask Aly is unavailable to minors.";
  if (body?.guardian !== true || body?.collection !== true) return "Confirm that you are the parent or legal guardian and have read the trip-view access notice.";
  return null;
}
