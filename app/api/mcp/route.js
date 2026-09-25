// The assistant connection: a read-only MCP endpoint.
//
// Step two of the plan in research/assistant-surface-implementation-spec.md.
// Step one's credential was a developer key standing for one hard-coded
// account, refused outright on production. This step replaces it with real
// sign-in: the bearer token is a Supabase OAuth 2.1 access token, minted only
// after a person approved a specific client on /oauth/consent, and it carries
// their real identity the same way a browser session does.
//
// That changes where the scoping happens. Step one read through the service
// role and re-stated every access rule in lib/mcp/scope.js by hand, because a
// developer key has no Supabase session to check against. A verified OAuth
// token names a real signed-in user, so this route builds a client
// authenticated as that person (lib/mcp/oauthClient.js) and every query runs
// through the database's own row-level security -- the same policies that
// already keep a minor's account read-only and a secondary traveler off a
// draft trip. lib/mcp/scope.js keeps only what RLS cannot express: the beta
// consent gate, and the MCP-specific redactions an assistant is held to that a
// person browsing their own app is not.
//
// This route does not yet check assistant_connections (see the migration
// naming that table). Building the OAuth path and the consent schema was
// authorized ahead of counsel's review of the consent screen; wiring a live
// approval check here is the last step, done only after that review, per
// research/assistant-surface-implementation-spec.md and the standing
// instruction not to enable live assistant use before then.

import { homeToday } from "@/lib/format";
import { bearerOf, oauthMcpConfig, tokenIdentity } from "@/lib/mcp/oauthToken";
import { handleMessage } from "@/lib/mcp/protocol";
import { REFUSALS, readerScope } from "@/lib/mcp/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = () => new Response("Not found.", { status: 404 });

function unauthorized(message = "A valid Supabase access token is required.") {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": 'Bearer realm="alyeska-mcp"',
    },
  });
}

export async function POST(request) {
  const config = oauthMcpConfig();
  if (!config) return NOT_FOUND();

  const token = bearerOf(request);
  if (!token) return unauthorized();

  const identity = await tokenIdentity(token);
  if (!identity) return unauthorized("This token is missing, expired, or was not issued by this project.");

  let message;
  try {
    message = await request.json();
  } catch {
    message = null;
  }

  const headers = {};
  for (const name of ["mcp-method", "mcp-name", "mcp-protocol-version"]) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  const { status, body } = await handleMessage(message, {
    headers,
    client: identity.client,
    getScope: async () => {
      const scope = await readerScope(identity.client, identity.id, homeToday());
      return scope.refused ? { refused: scope.refused, message: REFUSALS[scope.refused] } : scope;
    },
    log: (entry) =>
      console.log(JSON.stringify({ at: "mcp", clientId: identity.clientId, ...entry })),
  });

  if (!body) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET() {
  if (!oauthMcpConfig()) return NOT_FOUND();
  return new Response("Use POST.", { status: 405, headers: { allow: "POST" } });
}
