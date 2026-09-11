/**
 * Who is allowed to see the beta desk.
 *
 * There is no role column and there should not be one yet: exactly one person
 * runs this beta, and a table that can grant that power is a table that can be
 * got at. So the list is an environment variable read on the server only, and it
 * falls back to the account that owns the deployment — which means the desk
 * works on a fresh deployment with nothing configured, and still refuses
 * everybody else.
 *
 * Every door checks for itself: the page, and each of the routes behind it. A
 * page that hides a button is not a permission model.
 */

const OWNER = "meyermanagement@gmail.com";

/** The addresses allowed in, lowercased. */
export function adminEmails() {
  const raw = process.env.ALYESKA_ADMIN_EMAILS || "";
  const listed = raw
    .split(/[,\s]+/)
    .map((one) => one.trim().toLowerCase())
    .filter(Boolean);
  return listed.length ? listed : [OWNER];
}

/** @param {string | null | undefined} email */
export function isAdminEmail(email) {
  if (!email) return false;
  return adminEmails().includes(String(email).trim().toLowerCase());
}
