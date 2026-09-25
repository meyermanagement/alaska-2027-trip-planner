// The developer-only key for the assistant connection, and the only credential
// it accepts until real sign-in (OAuth) exists.
//
// It is deliberately narrow. It works only when both MCP_DEV_KEY and
// MCP_DEV_USER_ID are set, only when the key is long enough to be a real secret,
// and never on the production deployment -- so leaving the variables unset,
// which is the default everywhere, means the route does not exist. The key
// stands for exactly one person, named by MCP_DEV_USER_ID, and everything the
// route returns is scoped to what that person could see in the app.

import { createHash, timingSafeEqual } from "node:crypto";

const MIN_KEY_LENGTH = 32;

export function devKeyConfig(env = process.env) {
  const key = String(env.MCP_DEV_KEY || "");
  const userId = String(env.MCP_DEV_USER_ID || "").trim();
  if (env.VERCEL_ENV === "production") return null;
  if (key.length < MIN_KEY_LENGTH || !userId) return null;
  return { key, userId };
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest();
}

// Compare digests, not strings, so the check takes the same time whether the
// guess is wrong in its first character or its last, and whatever its length.
export function keyMatches(presented, expected) {
  if (!presented || !expected) return false;
  return timingSafeEqual(digest(presented), digest(expected));
}

export function bearerOf(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}
