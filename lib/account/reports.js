// Taking the person out of the reports, without taking the reports.
//
// feedback.user_id used to cascade from auth.users, so deleting an account
// deleted every bug report filed from it. A minified React error on /inbox is a
// fact about this application rather than about the person who happened to hit
// it, and erasing it does nothing for them: it just leaves the issue log with a
// hole in its numbering and no account of why. The key now sets user_id to null
// instead, and this is the other half of that -- the pass that strips everything
// else pointing at a person, so what survives is the defect and not the reporter.
//
// Written once and shared, because both callers delete the same login. The route
// does it while somebody waits, the nightly retry does it from a ledger row, and
// the two drifting apart on which columns count as naming a person is exactly the
// kind of gap nobody notices until a report still carries an address.

/**
 * Strip every reference to a person from their reports, keeping the report.
 *
 * What stays is the defect: the path, the build, the look, the stack, the kind,
 * the count and what they wrote. What goes is the address, the browser string,
 * the screen size, the trail of screens they walked, the trip named, and the
 * screenshot keys -- whose objects both callers remove from storage in the same
 * run, so keeping the keys would only leave rows naming files that are gone.
 *
 * Idempotent by construction, and deliberately in two passes. The first is the
 * ordinary one, by user_id, which is what the route runs before the login is
 * deleted. The second exists because a login can go without this having run --
 * a deletion that stopped halfway, or a row removed by hand during the beta --
 * and the key setting user_id to null is precisely what makes that orphan
 * impossible to find by owner afterwards. An ownerless report carrying the
 * address named on a deletion receipt is that orphan, and nothing else is.
 *
 * @param {object} input
 * @param {object} input.admin   service-role client
 * @param {string} input.userId
 * @param {string} [input.email] the address on the deletion receipt
 * @returns {Promise<{ok: boolean, message: string|null}>}
 */
export async function anonymizeReports({ admin, userId, email = "" }) {
  const scrubbed = {
    email: null,
    user_agent: null,
    viewport: null,
    trail: [],
    shots: [],
    trip_id: null,
    anonymized_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("feedback")
    .update(scrubbed)
    .eq("user_id", userId);
  if (error) return { ok: false, message: error.message };

  const address = String(email || "").trim();
  if (!address) return { ok: true, message: null };

  const { error: orphanError } = await admin
    .from("feedback")
    .update(scrubbed)
    .is("user_id", null)
    .eq("email", address);

  return {
    ok: !orphanError,
    message: orphanError ? orphanError.message : null,
  };
}
