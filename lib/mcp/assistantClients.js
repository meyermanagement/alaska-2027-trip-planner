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
