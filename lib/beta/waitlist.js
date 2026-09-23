/**
 * Where each waitlist address has got to.
 *
 * Worked out from the codes table rather than stored on the waitlist row. The
 * beta desk already records who a code went to, when it was sent and whether it
 * was spent; a second copy of that on the waitlist would be a second answer to
 * the same question, and the two would drift the first time somebody was invited
 * from the desk instead of from this list.
 *
 *   waiting  -- nothing sent yet
 *   invited  -- a live code is assigned to the address (sent, or a send failed)
 *   joined   -- the code was spent, or the address already has an account
 *
 * A retired code does not count as an invitation. Sending again would mail a
 * code that no longer works, so the address reads as waiting and gets a new one.
 */

export const WAITLIST_STATES = [
  { id: "waiting", label: "Waiting" },
  { id: "invited", label: "Invited" },
  { id: "joined", label: "Joined" },
];

function expired(code, now) {
  return Boolean(code.expiresAt && new Date(code.expiresAt) <= now);
}

/**
 * @param {Array} entries waitlist rows {id, email, household_size, organizer, created_at}
 * @param {Array} codes   signup codes {code, assignedEmail, assignedAt, sentAt, sendCount, usedAt, expiresAt}
 * @param {Set<string>} accountEmails lowercased addresses that already have an account
 */
export function waitlistRows(entries = [], codes = [], accountEmails = new Set(), now = new Date()) {
  const byEmail = new Map();
  for (const code of codes) {
    const email = String(code.assignedEmail || "").toLowerCase();
    if (!email) continue;
    const list = byEmail.get(email) || [];
    list.push(code);
    byEmail.set(email, list);
  }

  const rank = { waiting: 0, invited: 1, joined: 2 };

  return entries
    .map((entry) => {
      const email = String(entry.email || "").toLowerCase();
      const theirs = (byEmail.get(email) || []).sort((a, b) =>
        String(b.assignedAt || "").localeCompare(String(a.assignedAt || "")),
      );
      const spent = theirs.find((one) => one.usedAt);
      const live = theirs.find((one) => !one.usedAt && !expired(one, now));
      const hasAccount = accountEmails.has(email);

      let state = "waiting";
      if (spent || hasAccount) state = "joined";
      else if (live) state = "invited";

      const code = spent || live || null;
      return {
        id: entry.id,
        email,
        householdSize: entry.household_size ?? null,
        organizer: Boolean(entry.organizer),
        listedAt: entry.created_at || null,
        state,
        // Joined by some other door: an account with this address and no code
        // from this list behind it. Said, so nobody sends a code to somebody
        // who is already in.
        viaAccount: state === "joined" && !spent,
        code: code?.code || null,
        sentAt: code?.sentAt || null,
        sendCount: code?.sendCount || 0,
        usedAt: spent?.usedAt || null,
      };
    })
    .sort((a, b) => {
      if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
      // First come, first served among the ones still waiting; newest first
      // once somebody has been dealt with.
      const byTime = String(a.listedAt || "").localeCompare(String(b.listedAt || ""));
      return a.state === "waiting" ? byTime : -byTime;
    });
}

/** "1 traveler", "4 travelers", "6+ travelers", or nothing if they did not say. */
export function travelersLabel(size) {
  if (!size) return null;
  if (size >= 6) return "6+ travelers";
  return size === 1 ? "1 traveler" : `${size} travelers`;
}
