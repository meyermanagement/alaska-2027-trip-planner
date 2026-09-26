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

export async function clientById(supabase, clientId) {
  if (!clientId) return null;
  const { data, error } = await supabase
    .from("assistant_oauth_clients")
    .select("client_id, client_name, client_description, purpose_summary, approved_for_consent")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
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

export function sameRedirect(clientId, returnUrl) {
  const registered = REDIRECT_URIS[clientId];
  if (!registered) return false;
  try {
    const a = new URL(registered);
    const b = new URL(returnUrl);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}
