import { NextResponse } from "next/server";

/**
 * The leaked-password check, done without the password ever leaving the device.
 *
 * Supabase's own leaked-password protection is a Pro-plan feature and this
 * project is on Free, so the control is built here instead. It uses the same
 * source — the Pwned Passwords corpus — through the same k-anonymity range
 * protocol, and it is arguably tighter than the hosted version: the hosted one
 * receives the password at the auth server first, while here the browser hashes
 * the password locally and sends only the first five characters of the SHA-1
 * hex digest. Five characters name a bucket of roughly eight hundred hashes.
 * They cannot identify a password, and they never identify a person, because
 * this route takes no session, no email, and no body.
 *
 * The comparison of the remaining thirty-five characters happens back in the
 * browser (see lib/auth/pwned.js). This route is a proxy and nothing more, which
 * is the second reason it exists: without it the browser would contact
 * haveibeenpwned.com directly and hand a third party the visitor's IP address
 * during signup.
 *
 * Nothing here is logged. A prefix plus a timestamp plus an IP would be a
 * meaningful clue about a password, which is exactly what this control exists to
 * avoid handling.
 */

const PREFIX = /^[0-9A-F]{5}$/;
// The upstream corpus does not move quickly, and a stale answer only ever means
// a very recently leaked password slips through once. An hour on the edge keeps
// signup fast and keeps the outbound call rate low.
const CACHE_SECONDS = 3600;

export const runtime = "edge";

export async function GET(request) {
  const prefix = (
    new URL(request.url).searchParams.get("prefix") || ""
  ).toUpperCase();

  if (!PREFIX.test(prefix)) {
    return NextResponse.json({ error: "bad prefix" }, { status: 400 });
  }

  let upstream;
  try {
    upstream = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Padding makes every response a similar size, so the length of what
      // comes back over TLS says nothing about which bucket was asked for.
      headers: { "Add-Padding": "true", "User-Agent": "alyeska-beta" },
      next: { revalidate: CACHE_SECONDS },
    });
  } catch {
    // Fail open, deliberately. A password checker that cannot reach its corpus
    // must not become a wall between a tester and their account; the caller
    // treats an error as "unknown" and lets the signup proceed.
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const body = await upstream.text();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}
