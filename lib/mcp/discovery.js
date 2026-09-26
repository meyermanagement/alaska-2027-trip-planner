// OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP endpoint.
//
// An assistant that has never seen Alyeska starts with one URL: the MCP
// endpoint. It calls it, gets a 401, and reads `resource_metadata` from the
// WWW-Authenticate header to find this document. The document names the
// resource and the authorization server (Supabase Auth), and the assistant
// reads Supabase's own published metadata from there. Clients that ignore the
// header try /.well-known/oauth-protected-resource/api/mcp and then the root
// form, so both paths serve the same document.
//
// The resource is built from the host the request arrived on, so production
// (www.alyeska.app), previews and local development each describe themselves.
// Nothing here is secret: it is the same information Supabase publishes.

export const MCP_PATH = "/api/mcp";
export const METADATA_PATH = "/.well-known/oauth-protected-resource";

export function originOf(request) {
  return new URL(request.url).origin;
}

export function resourceUrl(origin) {
  return `${origin}${MCP_PATH}`;
}

export function metadataUrl(origin) {
  return `${origin}${METADATA_PATH}${MCP_PATH}`;
}

export function authorizationServer(env = process.env) {
  // Trimmed: production's value arrived with a trailing newline, which put a
  // line break inside the issuer URL and made it unusable to any client.
  const base = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}/auth/v1` : null;
}

export function protectedResourceMetadata(origin, env = process.env) {
  const issuer = authorizationServer(env);
  if (!issuer) return null;
  return {
    resource: resourceUrl(origin),
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    resource_name: "Alyeska",
    resource_documentation: `${origin}/privacy`,
  };
}

// The Bearer challenge on the endpoint's 401 and 403 answers.
export function bearerChallenge(origin, error) {
  const parts = [`realm="alyeska-mcp"`, `resource_metadata="${metadataUrl(origin)}"`];
  if (error) parts.push(`error="${error}"`);
  return `Bearer ${parts.join(", ")}`;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "mcp-protocol-version",
};

export function metadataResponse(request) {
  const body = protectedResourceMetadata(originOf(request));
  if (!body) return new Response("Not found.", { status: 404 });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600", ...CORS },
  });
}

export function metadataOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// Alexa+ reads the metadata document at its well-known address and refuses a
// 401 that carries a WWW-Authenticate header, which every other assistant
// needs. So the header is left off only when the request names itself as the
// Alexa+ client. Nothing is gained by faking that: the answer is still a 401.
export function isAlexaClient(message, request) {
  const name = message?.params?.clientInfo?.name;
  if (typeof name === "string" && /^Alexa\+/.test(name)) return true;
  return /\bAlexa\+/.test(request.headers.get("user-agent") || "");
}
