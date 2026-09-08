// Turn a family's inbox_local_part into the address that goes in a person's
// contacts app. Kept in one place so the domain lives in one place too, and
// so the string the copy-button hands to the clipboard is exactly the string
// the setup guide tells Postmark to catch.
//
// The domain lives on an env var so a preview deploy can point at a different
// Postmark inbound stream (a staging domain, say) without a code change. The
// production value is `trips.alyeska.app` -- literal, boring, and separate
// from any transactional mail alyeska.app itself might send later, so a
// runaway forwarder cannot hurt the parent domain's reputation.

const DEFAULT_DOMAIN = "trips.alyeska.app";

export function inboxDomain() {
  return (process.env.NEXT_PUBLIC_INBOX_DOMAIN || DEFAULT_DOMAIN).toLowerCase();
}

export function inboxAddressFor(localPart) {
  if (!localPart) return "";
  return `${String(localPart).toLowerCase()}@${inboxDomain()}`;
}

// Pull the local part out of an address that arrived at the webhook. Postmark
// sometimes reports the To with a display name (e.g. `"Trips" <fhc5h4@...>`),
// sometimes bare -- this handles both. Returns null if the address is not on
// our domain, so the webhook can 200-and-ignore rather than trying to route it.
export function localPartFromAddress(raw) {
  if (!raw) return null;
  const angle = String(raw).match(/<([^>]+)>/);
  const bare = (angle ? angle[1] : String(raw)).trim().toLowerCase();
  const [local, domain] = bare.split("@");
  if (!local || !domain) return null;
  if (domain !== inboxDomain()) return null;
  // Strip Postmark's `+tag` suffix if a forwarder happens to add one.
  return local.split("+")[0];
}
