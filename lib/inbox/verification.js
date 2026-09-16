/**
 * Recognizing the one piece of mail a household reads rather than files.
 *
 * Setting up forwarding is a loop that runs through this app: you give Gmail the
 * household address, Gmail writes to that address to check somebody agreed, and
 * the person who has to agree is looking at an Alyeska screen rather than their
 * own mailbox. If the inbox cannot show them what Google said, forwarding cannot
 * be finished, and every other thing the inbox does is unreachable behind that.
 *
 * So this is deliberately not a parser in the sense the rest of `lib/inbox` uses
 * the word. Nothing here goes to a model, nothing is written to the itinerary,
 * and nothing is inferred: the confirmation link is a literal URL on a known
 * host, and the code is a literal run of digits next to the word that Google and
 * the others actually use. Anything it is not sure about it declines to claim,
 * because the fallback -- the message body, shown as it arrived -- is good
 * enough, and a wrong link here sends somebody to a page that approves a
 * forwarding request they did not mean to approve.
 *
 * Providers covered are the ones whose verification mail is addressed to the
 * forwarding target rather than the account owner, which is what makes it land
 * here at all.
 */

// Senders whose mail is a verification handshake, not a booking. Matched on the
// full address rather than the domain: `noreply@google.com` sends a great many
// things that are none of this app's business, and only the forwarding sender
// should get a band that offers a one-tap approval.
const VERIFIERS = [
  {
    from: "forwarding-noreply@google.com",
    provider: "Gmail",
    // Gmail's confirmation lands on its settings host under a `/mail/vf-` path.
    // The cancel link on the same message is `/mail/uf-`, which must never be
    // offered as the thing to press.
    confirmHost: "mail-settings.google.com",
    confirmPath: "/mail/vf-",
    cancelPath: "/mail/uf-",
  },
  {
    from: "forwarding-noreply@googlemail.com",
    provider: "Gmail",
    confirmHost: "mail-settings.google.com",
    confirmPath: "/mail/vf-",
    cancelPath: "/mail/uf-",
  },
];

function verifierFor(fromEmail) {
  const said = String(fromEmail || "")
    .trim()
    .toLowerCase();
  if (!said) return null;
  return VERIFIERS.find((v) => v.from === said) || null;
}

/**
 * Every http(s) URL in a body, in the order they appear.
 *
 * Google wraps its confirmation link across two lines in the plain-text part and
 * URL-encodes the square brackets around the token, so the character class here
 * has to admit `%`, `[` and `]` while stopping at whitespace. Trailing sentence
 * punctuation is trimmed, since a link at the end of a sentence otherwise
 * carries the full stop into the href.
 */
function urlsIn(text) {
  const found = String(text || "").match(/https?:\/\/[^\s<>"')]+/g) || [];
  return found.map((u) => u.replace(/[.,;:]+$/, ""));
}

/**
 * The link that approves the request, and only that link.
 *
 * Host and path are both checked, and the cancel path is excluded explicitly
 * rather than by relying on the confirm path being found first, because the two
 * differ by a single letter and getting them the wrong way round would turn an
 * approve button into a cancel button.
 */
function confirmLinkIn(text, verifier) {
  for (const raw of urlsIn(text)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    if (url.hostname !== verifier.confirmHost) continue;
    if (verifier.cancelPath && url.pathname.startsWith(verifier.cancelPath)) {
      continue;
    }
    if (!url.pathname.startsWith(verifier.confirmPath)) continue;
    return raw;
  }
  return null;
}

/**
 * A confirmation code, when the provider sent one.
 *
 * Gmail sends a link for an external address and a code for some others, and the
 * instructions used to promise a code unconditionally, which is what sent
 * somebody hunting for a number that was not there. So this returns null far more
 * often than it returns a value, and the caller has to be willing to show nothing.
 *
 * Anchored on the words a provider actually writes next to the number, rather
 * than on "a run of digits", because a verification mail is full of runs of
 * digits -- support article numbers among them -- and offering one of those as
 * the code is worse than offering none.
 */
function codeIn(text) {
  const said = String(text || "");
  const patterns = [
    /confirmation code[^0-9]{0,40}(\d{6,12})/i,
    /verification code[^0-9]{0,40}(\d{6,12})/i,
    /\bcode\b[^0-9a-z]{0,20}(\d{8,12})\b/i,
  ];
  for (const re of patterns) {
    const hit = said.match(re);
    if (hit) return hit[1];
  }
  return null;
}

/**
 * The address being confirmed, so the band can say what is about to be approved.
 *
 * Shown rather than assumed: a household with more than one address, or somebody
 * who pasted the wrong one into Gmail, should be able to see the mismatch before
 * pressing anything.
 */
function targetAddressIn(text) {
  const hit = String(text || "").match(
    /\b([a-z0-9._%+-]+@[a-z0-9.-]*\btrips\.[a-z0-9.-]+)\b/i,
  );
  return hit ? hit[1].toLowerCase() : null;
}

/**
 * What the inbox card should lead with for this message, or null for the great
 * majority of mail, which is a booking and wants the ordinary treatment.
 */
export function readVerification(message) {
  if (!message) return null;
  const verifier = verifierFor(message.from_email);
  if (!verifier) return null;

  const body = message.text_body || "";
  const confirmUrl = confirmLinkIn(body, verifier);
  const code = codeIn(body);

  // A known sender with neither a link nor a code is still worth naming as a
  // verification message -- the body is what the person needs, and the band
  // saying which provider it came from is a smaller claim than staying silent.
  return {
    provider: verifier.provider,
    confirmUrl,
    code,
    address: targetAddressIn(body),
  };
}

export const VERIFICATION_SENDERS = VERIFIERS.map((v) => v.from);
