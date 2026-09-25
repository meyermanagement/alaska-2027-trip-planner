# Assistant connection: developer key

Step one of the read-only MCP plan. One key, one account, read only.

## Set up

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

## Tools

`list_trips`, `get_trip`, `get_itinerary_day`, `get_packing_status`,
`get_travelers`, `get_pro_tips`, `get_prior_reviews`. All marked read-only.
No AI calls and no writes.

## Never returned

Children and their packing items, health and accessibility details, notes,
confirmation numbers, costs, documents, wallet data, other households, and
draft trips a secondary traveler is not on.

## Refused

No current beta agreement, a minor account, or no household.
