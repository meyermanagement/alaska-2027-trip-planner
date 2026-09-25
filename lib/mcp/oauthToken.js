// Who an MCP call is speaking for, once the credential is a real Supabase
// OAuth 2.1 access token instead of the developer key in lib/mcp/devKey.js.
//
// The token this file checks was not typed into a password field. It came out
// of a browser redirect: an assistant asked Supabase's OAuth server for
// permission, the person approved a specific client on the /oauth/consent
// screen, and Supabase minted a normal Supabase JWT with a client_id claim
// riding along. Everything after that is exactly what lib/supabase/who.js
// already does for a cookie-carried session -- verify the signature locally
// against the project's published JWKS, no round trip -- because an
// OAuth-issued access token and a browser session token are the same kind of
// object with the same claims shape. This file does not reimplement that
// check; it borrows it, and adds the one thing a session token never had to
// answer: which client is asking, so the caller can build a client-scoped
// database client instead of an admin one.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function bearerOf(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

/**
 * Verify the bearer token and return who it speaks for.
 *
 * Returns null for anything that is not a currently valid Supabase-issued
 * token: missing, expired, forged, or signed by a different project. There is
 * no fallback identity -- a token that does not verify is the same as no
 * token, the same rule lib/supabase/who.js applies to a session.
 */
export async function tokenIdentity(bearerToken) {
  if (!bearerToken) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  // A short-lived, unauthenticated-by-cookie client whose only job is to
  // carry this one bearer token for the claims check and for every query the
  // caller runs afterward. Nothing here persists a session or refreshes a
  // token -- each MCP request verifies its own token from scratch, the same
  // as every other stateless call this route makes.
  const client = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
  });

  const { data, error } = await client.auth.getClaims(bearerToken);
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  return {
    id: claims.sub,
    email: claims.email || "",
    provider: String(claims.app_metadata?.provider || "").toLowerCase(),
    // Present only on a token issued through the OAuth 2.1 server to a
    // registered client; absent on an ordinary session token. Every caller
    // through this route is expected to have it, since nothing but an OAuth
    // client is meant to reach /api/mcp -- a session token without it is
    // refused by the route, not treated as a weaker version of the same
    // thing.
    clientId: claims.client_id || null,
    client,
  };
}

/**
 * Whether this deployment is configured to accept OAuth-issued MCP calls at
 * all. Mirrors devKeyConfig()'s shape (a plain object or null) so the route
 * can check one thing instead of three.
 */
export function oauthMcpConfig(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
