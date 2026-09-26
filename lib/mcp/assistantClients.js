// Reading assistant_oauth_clients: the names and descriptions the consent
// screen shows for a client_id Supabase's OAuth server already validated.
//
// Supabase's getAuthorizationDetails() answers what the OAuth *protocol* needs
// -- client_id, redirect_uri, the scope string -- but nothing about what the
// client actually is to a family deciding whether to allow it. This table is
// where that name and one-sentence purpose live, written by us at
// registration time (Dashboard -> Authentication -> OAuth Apps), not by the
// client itself. A client_id the table has never heard of is shown as
// unrecognized rather than guessed at from the protocol payload alone.

import { assistantForClient, assistantForRedirect, parseRedirectUris } from "@/lib/mcp/trust";

// The client as Alyeska knows it, or null. Two ways to be known:
//
//   1. Registered by hand in Supabase (registration_type "manual"), with a row
//      we wrote in assistant_oauth_clients. The row decides, including
//      approved_for_consent = false.
//   2. Self-registered (registration_type "dynamic"), with every registered
//      return address belonging to one assistant in lib/mcp/trust.js. The name
//      and purpose come from that list, never from the client's own metadata.
//      This is checked on every call, even once the client has a row: the row
//      only anchors people's answers, and can block the client
//      (approved_for_consent = false) but never widen it.
//
// Anything else is unknown. Returns { client, error } so a caller can tell a
// refusal from a failed read.
export async function resolveClient(supabase, clientId) {
  if (!clientId) return { client: null, error: null };
  const [rowRes, regRes] = await Promise.all([
    supabase
      .from("assistant_oauth_clients")
      .select("client_id, client_name, client_description, purpose_summary, approved_for_consent")
      .eq("client_id", clientId)
      .maybeSingle(),
    supabase.rpc("assistant_client_redirects", { p_client_id: clientId }),
  ]);
  if (rowRes.error) return { client: null, error: rowRes.error };
  const row = rowRes.data || null;

  if (regRes.error) {
    // Before public.assistant_client_redirects exists there can be no dynamic
    // clients to tell apart, so a hand-registered row still stands. Any other
    // failure is a failed read.
    if (regRes.error.code === "PGRST202" && row) return { client: { ...row, source: "registered" }, error: null };
    return { client: null, error: regRes.error };
  }
  const reg = Array.isArray(regRes.data) ? regRes.data[0] : regRes.data;

  if (reg?.registration_type === "dynamic") {
    const assistant = assistantForClient(reg.redirect_uris);
    if (!assistant) return { client: null, error: null };
    return {
      client: {
        client_id: clientId,
        client_name: assistant.name,
        client_description: assistant.description,
        purpose_summary: assistant.purpose,
        approved_for_consent: row ? row.approved_for_consent === true : true,
        source: "dynamic",
        assistant: assistant.key,
        has_row: Boolean(row),
        redirect_uris: parseRedirectUris(reg.redirect_uris),
      },
      error: null,
    };
  }
  if (row) return { client: { ...row, source: "registered" }, error: null };
  return { client: null, error: null };
}

export async function clientById(supabase, clientId) {
  try {
    const { client } = await resolveClient(supabase, clientId);
    return client;
  } catch {
    return null;
  }
}

// Where each registered client's approvals go back to, as registered in
// Supabase (Authentication -> OAuth Apps). The consent screen reads this only
// to tell, when Supabase skips the screen on an earlier approval, which client
// the request is for. auth.oauth_clients isn't readable from a signed-in
// session, so a new client needs a line here too.
export const REDIRECT_URIS = {
  "a53e5071-421c-41e6-a40e-040ae4592331": "https://claude.ai/api/mcp/auth_callback",
  "941b58b8-e453-4b2f-bb71-ec4102beae05": "https://httpbin.org/anything",
};

// Whether a return address belongs to this client. Hand-registered clients
// are listed above; a dynamic client carries its own registered addresses
// from resolveClient.
export function sameRedirect(clientOrId, returnUrl) {
  const known = typeof clientOrId === "object" && clientOrId ? clientOrId : null;
  const clientId = known ? known.client_id : clientOrId;
  const registered = REDIRECT_URIS[clientId] ? [REDIRECT_URIS[clientId]] : known?.redirect_uris || [];
  if (known?.source === "dynamic") {
    // The return carries ?code=&state=; judge the address it goes to.
    let bare = null;
    try {
      const u = new URL(returnUrl);
      bare = u.origin + u.pathname;
    } catch {
      return false;
    }
    if (!assistantForRedirect(bare)) return false;
  }
  return registered.some((r) => {
    try {
      const a = new URL(r);
      const b = new URL(returnUrl);
      return a.origin === b.origin && a.pathname === b.pathname;
    } catch {
      return false;
    }
  });
}
