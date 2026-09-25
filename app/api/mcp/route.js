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
// Before any method runs -- tools/list included -- lib/mcp/grant.js checks
// that the token belongs to a named OAuth client, that assistant connections
// are switched on, and that this person allowed this client on the current
// consent wording. The switch (public.assistant_connections_enabled()) stays
// hard-false until counsel reviews the consent screen, so today every call is
// refused, which is what the consent screen tells people.

import { homeToday } from "@/lib/format";
import { bearerChallenge, originOf } from "@/lib/mcp/discovery";
import { GRANT_REFUSALS, connectionGrant } from "@/lib/mcp/grant";
import { bearerOf, oauthMcpConfig, tokenIdentity } from "@/lib/mcp/oauthToken";
import { handleMessage } from "@/lib/mcp/protocol";
import { REFUSALS, readerScope } from "@/lib/mcp/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = () => new Response("Not found.", { status: 404 });

function forbidden(origin, reason) {
  return new Response(JSON.stringify({ error: GRANT_REFUSALS[reason] || GRANT_REFUSALS.unavailable, reason }), {
    status: 403,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "www-authenticate": bearerChallenge(origin, "insufficient_scope"),
    },
  });
}

function unauthorized(origin, message = "A valid Supabase access token is required.", error) {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": bearerChallenge(origin, error),
    },
  });
}

export async function POST(request) {
  const config = oauthMcpConfig();
  if (!config) return NOT_FOUND();

  const origin = originOf(request);
  const token = bearerOf(request);
  if (!token) return unauthorized(origin);

  const identity = await tokenIdentity(token);
  if (!identity) return unauthorized(origin, "This token is missing, expired, or was not issued by this project.", "invalid_token");

  const grant = await connectionGrant(identity.client, identity);
  if (!grant.ok) {
    console.log(JSON.stringify({ at: "mcp", clientId: identity.clientId, refused: grant.refused }));
    return forbidden(origin, grant.refused);
  }

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
