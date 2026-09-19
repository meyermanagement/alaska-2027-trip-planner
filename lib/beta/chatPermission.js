import { consentGap } from "@/lib/beta/consent";

/** Missing permission is not a transient model failure. Never advise retrying it. */
export function chatPermissionError(row, { minor = false, unavailable = false } = {}) {
  if (unavailable) return {
    error: "Aly could not check your account permissions. Nothing was sent. Please try again shortly.",
    permissionUnavailable: true,
  };
  if (minor) return {
    error: "Ask Aly is not available to anyone under 18. A parent or guardian can enable read-only itinerary and packing access, but cannot enable chat. Nothing was sent.",
    childAccessRequired: true,
    retryable: false,
  };
  const gap = consentGap(row);
  if (gap === "none") return {
    error: "Your beta agreement has not been completed. Open the agreement to finish setting up your account. Nothing was sent to Aly.",
    consentRequired: true,
    actionHref: "/welcome/beta",
    actionLabel: "Open agreement",
    retryable: false,
  };
  if (gap === "withdrawn") return {
    error: "You withdrew your beta agreement. Review and accept it again if you want to resume. Nothing was sent to Aly.",
    consentRequired: true,
    actionHref: "/welcome/beta",
    actionLabel: "Review agreement",
    retryable: false,
  };
  if (gap) return {
    error: `The ${gap === "privacy" ? "privacy notice" : "beta agreement"} has been updated. Review it before asking Aly again. Nothing was sent.`,
    consentStale: true,
    actionHref: "/welcome/beta",
    actionLabel: "Review changes",
    retryable: false,
  };
  if (!row.ai_processing) return {
    error: "Aly is turned off for this account. Turn on AI assistance in Settings to ask her something.",
    aiOff: true,
    actionHref: "/settings",
    actionLabel: "Open Settings",
    retryable: false,
  };
  return null;
}
