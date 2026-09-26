# Assistant connections (MCP)

A read-only MCP server at `/api/mcp`. It accepts two kinds of bearer token:
an OAuth token Supabase issued to an approved assistant (production), or a
developer key (local only).

## Developer key

One key, one account, read only.

### Set up

Add to `.env.local` (never to Vercel production; the route refuses there):

```
SUPABASE_SERVICE_ROLE_KEY=...
MCP_DEV_KEY=$(openssl rand -hex 32)
MCP_DEV_USER_ID=<your auth.users id>
```

Run `npm run dev`, then:

```
curl -s localhost:3000/api/mcp \
  -H "Authorization: Bearer $MCP_DEV_KEY" \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2026-07-28" \
  -H "Mcp-Method: tools/call" -H "Mcp-Name: get_itinerary_day" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_itinerary_day","arguments":{"trip":"Disney","date":"2026-11-26"}}}'
```

To try it from Claude Desktop or another MCP client, point a remote server at
`http://localhost:3000/api/mcp` with the same bearer header.

## OAuth connections

### Discovery

An assistant starts with only `https://www.alyeska.app/api/mcp`. A request
with no token gets a 401 whose `WWW-Authenticate` header names
`resource_metadata`. That document (RFC 9728) is served at both
`/.well-known/oauth-protected-resource/api/mcp` and
`/.well-known/oauth-protected-resource`. It names the resource and the
authorization server, Supabase Auth at `<NEXT_PUBLIC_SUPABASE_URL>/auth/v1`
(trimmed; see `lib/mcp/discovery.js`). The resource is built from the request
host, so previews and localhost describe themselves.

Supabase has no registration endpoint, so every client is registered by hand.

### Registering a client

1. In the Supabase dashboard, Authentication, OAuth Apps, create the client:
   public, no secret, authorization code and refresh token grants, and only
   the assistant's documented redirect URI. Claude's is
   `https://claude.ai/api/mcp/auth_callback`. Production auth settings are
   changed by Mark, not by an agent.
2. Add its row to `assistant_oauth_clients` with the client ID Supabase
   created: `client_name`, `client_description`, `purpose_summary`, and
   `approved_for_consent = true`. Without the row, the consent screen shows
   the client as unrecognized and refuses an answer.
3. In the assistant, add the connector by its MCP URL and the client ID.

Registered today: Claude (`a53e5071-421c-41e6-a40e-040ae4592331`).

### Consent

Supabase sends the person to `/oauth/consent`. It refuses minors, shows the
client's name and purpose, the scopes in plain words, and the host the answer
goes back to. Allowing writes an `allowed` row to `assistant_connections`,
stamped with `CONSENT_SURFACE_VERSION` from `lib/mcp/consentVersion.js`. Raise
that version whenever the screen's wording changes; older approvals then stop
counting and the person is asked again.

### The approval check

`lib/mcp/grant.js` runs before any method, `tools/list` included, and every
read runs as the person under RLS:

1. The token has a `client_id` (a browser session token does not).
2. The client is in `assistant_oauth_clients` with `approved_for_consent`.
3. The person has an `allowed`, unrevoked row for that client on the current
   consent version.
4. `public.assistant_connections_enabled()` returns true.

A missing or bad token gets 401 with a challenge. Steps 1 to 3 failing gets
403. Step 4 failing, or a failed lookup, gets a plain JSON-RPC error
(`-32001`, HTTP 200; 202 for a notification; 503 when the lookup failed) with
no challenge, so the assistant shows the sentence instead of reporting a
failed sign-in.

### The switch

`assistant_connections_enabled()` returns true since
`20261021_assistant_connections_go_live.sql`, applied on Mark's go-ahead
before counsel's sign-off. To turn every connection off at once, apply a
migration that returns false. If counsel changes the consent wording, raise
`CONSENT_SURFACE_VERSION` in the same release so earlier approvals ask again.

### Removing a connection

Settings, Connected assistants (`components/AssistantConnectionsControl.js`)
lists the person's rows. Remove sets `status = 'revoked'` and `revoked_at`,
then calls `supabase.auth.oauth.revokeGrant({ clientId })` so Supabase stops
refreshing the token. The row stays as a record; nobody can delete it.

## Tools

Trip tools (`lib/mcp/tools.js`): `list_trips`, `get_trip`,
`get_itinerary_day` (with saved booking advice), `get_packing_status`,
`get_travelers`, `get_pro_tips`, `get_prior_reviews`.

Household tools (`lib/mcp/householdTools.js`): `get_preferences`, `get_budget`,
`get_expiration_dates`, `get_insurance`, `get_wallet`, `get_day_pack`,
`get_reminders`, `get_house_tasks`, `get_deadlines`, `get_trip_essentials`,
`get_nearby_tips`, `get_bucket_list`, `get_fare_alerts`, `get_pets`,
`get_trip_log`.

Write tools, all through the reader's own signed-in client, so RLS and the
secondary guard triggers apply exactly as they do in the app:

- `check_off_packing_item` (tools.js), `check_off_day_pack_item`,
  `complete_reminder` (writeTools.js): set or clear the done flag on one line
  the matching read tool shows this reader. A secondary reaches their own
  lines (day pack: also Shared). More than one match changes nothing and lists
  up to six.
- `add_packing_item`, `add_reminder`, `add_bucket_list_place`: primary
  travelers only. For a trip traveler, a child, or Shared. Refuses health text
  and returns `changed:false` for a line already there.

- planTools.js, primary travelers only, each changing one row:
  `add_itinerary_item` / `update_itinerary_item` (cancel is a status; dates
  must fall in the trip; lodging and cruise alone span nights),
  `create_trip` (roster by name; returns `next_steps` to offer, never acted on) /
  `update_trip` (name, destination, dates, status, budget),
  `add_rewards_program` / `update_rewards_program` (adults or Shared; balance,
  status tier, annual fee; refuses member and card numbers),
  `add_template_item` (base list unless named; existing trips unchanged), and
  `add_day_pack_item` (links an existing packing-list line; never creates one).

- moreTools.js, primary travelers only:
  `start_packing_list` (the base list, once; never on a draft),
  `set_trip_templates` (add-on templates; unlinks dropped ones, never deletes a
  template or a line), `add_trip_cost` / `update_trip_cost`,
  `update_packing_item` (name, owner, bag, quantity, last-minute; never notes),
  `update_reminder` (title, owner, due date, timing, priority; never detail),
  `add_favorite_moment` (one adult), `put_fare_on_trip` / `dismiss_fare`
  (open, unexpired fares only), `save_home_airport` (US and Canadian codes),
  `retire_bucket_list_place`, `set_pet_plan` (arrangement and notes; syncs the
  pet's packing lines), and `add_preference` / `update_preference` (said by
  the person; adults or the household, never a child or health).

Updates are marked destructive, since they replace a saved value. None deletes
a record, and none touches notes, confirmation numbers or a child's
preferences. These write directly, without Ask Aly's review cards. The other 22
are marked read-only.
No AI calls.

## Never returned

Children and anything that names one -- except that a primary traveler sees,
and can check off and add, packing and day pack lines assigned to their children --
health, allergy and accessibility
details (including a pet's service-animal flag, medications and diet),
typed notes, confirmation, ID, member, policy and microchip numbers, document
files, vet contacts, email bodies, Ask Aly conversations, other households,
and draft trips a secondary traveler is not on. Expiration dates are shown for
adults' documents only, as a type and a date.

## Secondary travelers

Their own and shared rows only, and never a child's packing. They can check
off only their own packing and reminder lines and their own or Shared day
pack lines, and cannot add anything. Budget, insurance, house tasks, bucket list,
fare alerts and pets are refused.

## Refused

No current beta agreement, a minor account, or no household.

## Tests

`node --test scripts/mcp-*.test.mjs`
