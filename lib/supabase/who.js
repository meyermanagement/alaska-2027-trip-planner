/**
 * Who is asking, without a trip to the auth server and back.
 *
 * Every protected page in this app began with `auth.getUser()`, and middleware
 * ran the same call before the page was even reached. That call is not a cookie
 * read: it is an HTTPS request to Supabase's auth server, which answers who the
 * token belongs to. So a single tap on a menu row spent two full network
 * round-trips finding out something the browser had already handed over --
 * before the first query about trips or templates or looks had been sent. On a
 * phone on mobile data that is most of the wait people read as "the loading
 * page is taking too long".
 *
 * `auth.getClaims()` answers the same question by checking the token's
 * signature instead of asking who signed it. This project publishes an ES256
 * public key at /auth/v1/.well-known/jwks.json, so the check is arithmetic done
 * in the same process: no request, no round-trip, and the same refusal for a
 * token that is forged or expired. The key is fetched once and cached, so the
 * first request of a cold start pays for it and the rest do not.
 *
 * It is not a weakening of the check. When a project signs its tokens with the
 * old shared secret rather than a key pair there is nothing to verify locally,
 * and getClaims falls back to getUser itself -- so the worst case here is
 * exactly the behavior this replaced, and the best case is the same answer
 * without leaving the building.
 *
 * Returns the two things every caller actually wanted, and null when there is
 * nobody. Callers redirect on null exactly as they did before.
 */
export async function whoIs(supabase) {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: claims.email || "" };
}
