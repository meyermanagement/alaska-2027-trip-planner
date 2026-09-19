export const CHILD_NOTICE_VERSION = "2026-09-19-draft-1";

// This release collects parent setup choices, NOT children's messages. No
// environment switch, database status, or client checkbox can activate chat.
export const CHILD_CHAT_AVAILABLE = false;
export const CHILD_ACCESS_NOTICE = [
  {
    title: "You manage their access",
    body: "Only a parent or legal guardian should request access. A primary traveler is not automatically a guardian. Your child will not be asked to accept the adult beta agreement.",
  },
  {
    title: "What you are requesting",
    body: "Trip access would cover only trips this child is included on, never drafts. Ask Aly would be an optional, separate permission. It would not allow changes to trip plans.",
  },
  {
    title: "Before anything is activated",
    body: "This saves your request and permission choices, not permission to start collecting from your child. We must verify your parental consent and finish the child-specific privacy notice and access safeguards before activation. Child chat stays off.",
  },
  {
    title: "If you request Ask Aly",
    body: "The proposed chat would send your child’s question and limited relevant trip details to the Google Gemini API to generate a reply. Questions and replies would be available for parental review. This choice does not authorize advertising, marketing, precise location, uploads, or household-wide access.",
  },
  {
    title: "Your choices and your records",
    body: "You can withdraw this request here at any time. This screen records your choices, notice version, timestamps, and verification status. Request access to or deletion of existing child data at admin@alyeska.app. Do not upload identity documents, payment details, or your child’s messages to this form.",
  },
];

export const VERIFICATION_METHODS = [
  { id: "signed_form", label: "Signed parent consent form" },
  { id: "trained_video_call", label: "Video call with trained staff" },
];

export function childRequestState(request, now = Date.now()) {
  if (!request || request.status === "revoked") return "off";
  if (request.status === "rejected") return "rejected";
  if (request.notice_version !== CHILD_NOTICE_VERSION) return "outdated";
  if (new Date(request.expires_at).valueOf() <= now) return "expired";
  return request.status === "verified" ? "verified" : "pending";
}

export const CHILD_STATE_LABELS = {
  off: "Not requested",
  pending: "Waiting for parent verification",
  verified: "Parent verified · activation on hold",
  rejected: "Verification not accepted",
  outdated: "Review the updated parent notice",
  expired: "Request expired",
};

export function validateChildRequest(body) {
  if (body?.guardian !== true || body?.collection !== true) {
    return "Confirm that you are the parent or legal guardian and that you have read the parent notice.";
  }
  if (body?.askAly === true && body?.aiDisclosure !== true) {
    return "Separately confirm the proposed Google Gemini processing to request Ask Aly.";
  }
  return null;
}
