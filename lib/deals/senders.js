// Which senders are fare alerts, and what to credit them as.
//
// Deliberately a list of names rather than a cleverer test. The alternative is
// asking a model "is this a deal newsletter", which costs a call on every piece
// of mail the household forwards and answers yes to a hotel promotion. A list of
// the newsletters people actually subscribe to is boring, cheap, and wrong in a
// way anybody can see and fix: if Jack's Flight Club is missing, the symptom is
// that its mail is read as a booking, which fails politely, and the repair is one
// line here.
//
// The domain is the trigger because Gmail's own forwarding keeps the original
// From header intact -- a rule that forwards deals@thriftytraveler.com to the
// household address arrives here still saying it came from Thrifty Traveler. That
// is also why there is no +deals tag on the address: the household has one inbox
// address, already copied into their contacts, and asking somebody to set up
// forwarding to a second slightly different address is asking for a typo.
//
// The name matters as much as the match. It becomes source_name on the fare, and
// source_name is the column that makes a price quotable at all: the card credits
// the newsletter, and a person can go back to their own inbox and check the fare
// before spending anything on it. So the name here is the newsletter's own name,
// spelled the way it spells itself.

const SENDERS = [
  ["thriftytraveler.com", "Thrifty Traveler"],
  ["going.com", "Going"],
  ["scottscheapflights.com", "Going"],
  ["dollarflightclub.com", "Dollar Flight Club"],
  ["jacksflightclub.com", "Jack's Flight Club"],
  ["secretflying.com", "Secret Flying"],
  ["theflightdeal.com", "The Flight Deal"],
  ["airfarewatchdog.com", "Airfarewatchdog"],
  ["faredrop.com", "FareDrop"],
];

/** The newsletters this app recognizes by sender, for the setup instructions to name. */
export const FARE_NEWSLETTERS = [...new Set(SENDERS.map(([, name]) => name))];

function hostOf(email) {
  const bare = String(email || "")
    .trim()
    .toLowerCase();
  const angle = bare.match(/<([^>]+)>/);
  const address = angle ? angle[1] : bare;
  const at = address.lastIndexOf("@");
  return at < 0 ? "" : address.slice(at + 1);
}

/**
 * The newsletter this message came from, or null if it is not one we know.
 *
 * Matched on the end of the host so a sub-domain counts: alerts sent from
 * email.thriftytraveler.com or mail.going.com are the same newsletter and would
 * otherwise be missed by an equality test.
 */
export function fareSourceFor(fromEmail) {
  const host = hostOf(fromEmail);
  if (!host) return null;
  for (const [domain, name] of SENDERS) {
    if (host === domain || host.endsWith(`.${domain}`)) return { name, domain };
  }
  return null;
}

/**
 * What to credit a fare alert the list did not recognize.
 *
 * Only reached when the model has already said the message is a fare alert, which
 * is how a newsletter nobody thought of still works. The sender's display name is
 * the best available answer -- it is what the family would call it themselves --
 * and the host is the fallback, because a source of "unknown" would fail the
 * not-null check and lose the fare rather than credit it awkwardly.
 */
export function creditFor(fromEmail, fromName) {
  const known = fareSourceFor(fromEmail);
  if (known) return known.name;
  const said = String(fromName || "").trim();
  if (said) return said;
  const host = hostOf(fromEmail);
  return host || "a forwarded email";
}
