// Reading the single switch that decides whether an approved connection can
// do anything: public.assistant_connections_enabled() in
// supabase/migrations/20261019_assistant_connection_consent.sql.
//
// The function hard-returns false in the migration that created it, and stays
// false until this project's counsel has reviewed this exact consent screen.
// The flip waits in supabase/held/assistant_connections_go_live.sql.
// Nothing else in the OAuth or MCP path checks a second flag -- this is the
// one place a "go live" decision gets made, on purpose, so turning assistant
// access on is one migration, not a search for every place that assumed it
// was already off.

export async function assistantConnectionsEnabled(supabase) {
  const { data, error } = await supabase.rpc("assistant_connections_enabled");
  return !error && data === true;
}
