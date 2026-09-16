/**
 * Is this password one of the ones already in a breach corpus?
 *
 * Runs in the browser. The password is hashed here, only the first five
 * characters of the digest are sent to our own proxy (app/api/auth/pwned), and
 * the comparison of the rest happens here, offline. Nothing that leaves this
 * function can be turned back into the password.
 *
 * Returns a count rather than a boolean because "this password has appeared in
 * 214,000 breaches" is a far more persuasive thing to show a person than "not
 * allowed". Returns null when the answer is unknown — no Web Crypto, no network,
 * a proxy that is down — and the caller must let an unknown answer through. A
 * signup screen that cannot be completed because a security check is offline is
 * a worse outcome than a weak password.
 */
export async function leakedPasswordCount(password) {
  if (!password || typeof password !== "string") return null;
  if (!globalThis.crypto?.subtle) return null;

  let prefix;
  let suffix;
  try {
    const digest = await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(password),
    );
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    prefix = hex.slice(0, 5);
    suffix = hex.slice(5);
  } catch {
    return null;
  }

  let text;
  try {
    const res = await fetch(`/api/auth/pwned?prefix=${prefix}`, {
      cache: "force-cache",
    });
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null;
  }

  // Each line is SUFFIX:COUNT. The padding rows the upstream API adds to
  // disguise response size carry a count of zero and are ignored by the same
  // comparison that ignores every other non-matching row.
  for (const line of text.split("\n")) {
    const [candidate, count] = line.trim().split(":");
    if (candidate === suffix) {
      const n = Number.parseInt(count, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return 0;
}

/**
 * The sentence a person reads when their password is in the corpus. Written to
 * blame the password rather than the person, and to say what to do next.
 */
export function leakedPasswordMessage(count) {
  const times = count === 1 ? "once" : `${count.toLocaleString("en-US")} times`;
  return `This password has turned up ${times} in known data breaches, so it is one attackers try first. Choose a different one — a few unrelated words together works well.`;
}
