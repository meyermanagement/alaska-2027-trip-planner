// Whether this token's client may read this person's data at all, before any
// MCP method runs -- including tools/list.
//
// A verified token only proves who signed in. It does not prove they allowed
// this assistant, or that assistant connections are live. The consent screen
// promises "no assistant can read your trips until this is turned on", so the
// route has to keep that promise itself:
//
//   1. The token must come from the OAuth server for a named client. An
//      ordinary browser session token has no client_id and is refused.
//   2. The client must be in assistant_oauth_clients with approved_for_consent.
//   3. This person must have an 'allowed' row for this client, given on the
//      current consent wording and not revoked.
//   4. public.assistant_connections_enabled() must be true. It is hard-false
//      until counsel clears the consent screen.
//
// Every read runs as the person (RLS), and any error or missing row refuses.
// There is no fallback that widens access.

import { CONSENT_SURFACE_VERSION } from "@/lib/mcp/consentVersion";

export const GRANT_REFUSALS = {
  "not-oauth": "This endpoint accepts only tokens issued to an approved assistant.",
  "not-live": "Alyeska's assistant connections aren't turned on yet. Your approval is saved, and your trips will be readable here once they are.",
  "unknown-client": "This assistant isn't approved to connect.",
  "not-allowed": "This account hasn't allowed this assistant to read its trips.",
  unavailable: "Assistant access couldn't be checked just now.",
};

export async function connectionGrant(client, { id: userId, clientId } = {}) {
  if (!clientId) return { refused: "not-oauth" };
  if (!userId || !client) return { refused: "not-allowed" };

  try {
    const known = await client
      .from("assistant_oauth_clients")
      .select("client_id, approved_for_consent")
      .eq("client_id", clientId)
      .maybeSingle();
    if (known.error) return { refused: "unavailable" };
    if (!known.data || known.data.approved_for_consent !== true) return { refused: "unknown-client" };

    const row = await client
      .from("assistant_connections")
      .select("status, consent_version, revoked_at")
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (row.error) return { refused: "unavailable" };
    const r = row.data;
    if (!r || r.status !== "allowed" || r.revoked_at || r.consent_version !== CONSENT_SURFACE_VERSION) {
      return { refused: "not-allowed" };
    }

    // Last, so "not-live" only ever describes a connection that is otherwise
    // complete. The route answers that one case with a plain message instead
    // of an auth challenge: the person did everything right, and an
    // "insufficient_scope" reply made Claude report a failed sign-in.
    const live = await client.rpc("assistant_connections_enabled");
    if (live.error) return { refused: "unavailable" };
    if (live.data !== true) return { refused: "not-live" };
    return { ok: true };
  } catch {
    return { refused: "unavailable" };
  }
}

// How the route answers the two refusals that signing in again cannot fix.
// A JSON-RPC error on a 200 for a request and a bare 202 for a notification,
// so an assistant shows the sentence rather than "authorization failed".
// "unavailable" is a 503, because that one is worth retrying.
export const NOT_SERVING_CODE = -32001;
export function notServing(message, reason) {
  const text = GRANT_REFUSALS[reason] || GRANT_REFUSALS.unavailable;
  const status = reason === "unavailable" ? 503 : 200;
  const isRequest = Boolean(message) && typeof message === "object" && !Array.isArray(message) && message.id !== undefined;
  if (!isRequest && status === 200) return new Response(null, { status: 202 });
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: isRequest ? message.id : null,
      error: { code: NOT_SERVING_CODE, message: text, data: { reason } },
    }),
    { status, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}
