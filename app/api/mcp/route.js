// The assistant connection: a read-only MCP endpoint.
//
// Step one of the plan in research/assistant-surface-implementation-spec.md. The
// only credential is a developer key (lib/mcp/devKey.js) that stands for one
// account and is refused on the production deployment, so this route is off
// unless someone sets it up on their own machine or a preview. Real sign-in
// (OAuth through Supabase) replaces the key in step two; the scope and the tools
// stay the same.
//
// Reads go through the service role and are scoped by lib/mcp/scope.js, the same
// way the calendar feed works, because the caller has no Supabase session.

import { createAdminClient } from "@/lib/supabase/admin";
import { homeToday } from "@/lib/format";
import { bearerOf, devKeyConfig, keyMatches } from "@/lib/mcp/devKey";
import { handleMessage } from "@/lib/mcp/protocol";
import { REFUSALS, readerScope } from "@/lib/mcp/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = () => new Response("Not found.", { status: 404 });

function unauthorized() {
  return new Response(JSON.stringify({ error: "A valid key is required." }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="alyeska-mcp"' },
  });
}

export async function POST(request) {
  const config = devKeyConfig();
  if (!config) return NOT_FOUND();
  if (!keyMatches(bearerOf(request), config.key)) return unauthorized();

  const admin = createAdminClient();
  if (!admin) return new Response("Not configured.", { status: 503 });

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
    admin,
    getScope: async () => {
      const scope = await readerScope(admin, config.userId, homeToday());
      return scope.refused ? { refused: scope.refused, message: REFUSALS[scope.refused] } : scope;
    },
    log: (entry) => console.log(JSON.stringify({ at: "mcp", ...entry })),
  });

  if (!body) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function GET() {
  if (!devKeyConfig()) return NOT_FOUND();
  return new Response("Use POST.", { status: 405, headers: { allow: "POST" } });
}
