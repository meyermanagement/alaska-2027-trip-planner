export const CHILD_NOTICE_VERSION = "2026-09-19-draft-1";

// This release collects parent setup choices, NOT children's messages. No
// environment switch, database status, or client checkbox can activate chat.
export const CHILD_CHAT_AVAILABLE = false;
// Legacy record interpretation only. Current access is in minorReview.js.

export function childRequestState(request, now = Date.now()) {
  if (!request || request.status === "revoked") return "off";
  if (request.status === "rejected") return "rejected";
  if (request.notice_version !== CHILD_NOTICE_VERSION) return "outdated";
  if (new Date(request.expires_at).valueOf() <= now) return "expired";
  return request.status === "verified" ? "verified" : "pending";
}

export const CHILD_STATE_LABELS = {
  off: "Not requested",
  pending: "Archived request",
  verified: "Archived verification",
  rejected: "Verification not accepted",
  outdated: "Review the updated parent notice",
  expired: "Request expired",
};

export function validateChildRequest(body) {
  if (body?.askAly === true || body?.aiDisclosure === true) return "Ask Aly is unavailable to minors.";
  if (body?.guardian !== true || body?.collection !== true) {
    return "Confirm that you are the parent or legal guardian and that you have read the parent notice.";
  }
  return null;
}
