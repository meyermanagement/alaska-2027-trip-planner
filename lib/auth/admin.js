/**
 * Who is allowed to see the beta desk.
 *
 * One person runs this beta, and the check is against that person's account id
 * rather than their email address. An id is issued once by the auth server and
 * cannot be moved: it is in the signed token, so a forged or edited cookie fails
 * the signature check before this function is reached, and nobody can arrive at
 * it by registering or claiming an address. An email can be changed by whoever
 * controls the mailbox and is the weaker thing to trust.
 *
 * There is deliberately no role column. A table that can grant this power is a
 * table that can be got at, and it would need its own policies to protect. The
 * list is an environment variable read on the server only, and it falls back to
 * the account that owns the deployment so the desk works on a fresh deployment
 * with nothing configured and still refuses everybody else.
 *
 * Every door checks for itself: the page, and each of the routes behind it. A
 * page that hides a button is not a permission model.
 */

// The owner's account on this project. Not a secret -- an id alone opens nothing
// without that account's own signed session.
const OWNER_ID = "f91fe07b-cdb4-4f9a-a7be-50ae20cc90e3";

/** The account ids allowed in, lowercased. */
export function adminUserIds() {
  const raw = process.env.ALYESKA_ADMIN_USER_IDS || "";
  const listed = raw
    .split(/[,\s]+/)
    .map((one) => one.trim().toLowerCase())
    .filter(Boolean);
  return listed.length ? listed : [OWNER_ID];
}

/**
 * True only for the account or accounts named above.
 *
 * @param {{ id?: string | null } | null | undefined} user the whoIs result
 */
export function isAdminUser(user) {
  const id = user?.id;
  if (!id) return false;
  return adminUserIds().includes(String(id).trim().toLowerCase());
}
