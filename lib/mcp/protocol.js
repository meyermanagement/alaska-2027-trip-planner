// The Model Context Protocol, as one stateless request and one answer.
//
// The 2026-07-28 revision retired the initialize handshake and the session
// header, so every POST stands alone. initialize is still answered for clients
// that have not caught up, and it holds no state either way.

import { TOOLS, ToolError, callTool } from "./tools";

export const PROTOCOL_VERSION = "2026-07-28";
export const SUPPORTED_VERSIONS = [PROTOCOL_VERSION, "2025-11-25", "2025-06-18"];
// The icon an assistant may show beside the connection (serverInfo.icons, from
// the 2025-11-25 revision). Clients are free to ignore it, and some look the
// site's favicon up through a cache instead, so this helps rather than
// guarantees. Absolute, because the client has no base URL to resolve against.
export const SERVER_ICON = "https://www.alyeska.app/alyeska-icon.png";
export const SERVER_INFO = {
  name: "alyeska",
  title: "Alyeska",
  version: "0.1.0",
  websiteUrl: "https://www.alyeska.app",
  icons: [{ src: SERVER_ICON, mimeType: "image/png", sizes: ["512x512"] }],
};

const INSTRUCTIONS =
  "Read-only access to one household's saved travel in Alyeska: trips, one itinerary day at a time with booking advice, packing and day packs, reminders, adult travelers, preferences, budget, wallet balances and card offers, document and pet expiration dates, insurance coverage, deadlines, trip essentials, pro tips, nearby tips, bucket list, fare alerts, pets, favorite moments and past reviews. Nothing here changes anything. Children, health and allergy details, typed notes, and confirmation, ID, member, policy and microchip numbers are not shared. Some tools are for the household's primary travelers only.";

const CAPABILITIES = { tools: { listChanged: false } };

function reply(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function fail(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

// Returns { status, body } where body is null for a notification.
// `getScope` is called only for tools/call, so listing tools never touches the
// database.
export async function handleMessage(message, { headers = {}, client, getScope, log = () => {} }) {
  if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0") {
    return { status: 400, body: fail(null, -32600, "Expected one JSON-RPC 2.0 request.") };
  }
  const { id, method, params = {} } = message;
  if (typeof method !== "string") return { status: 400, body: fail(id, -32600, "Missing method.") };

  const headerMethod = headers["mcp-method"];
  if (headerMethod && headerMethod !== method) {
    return { status: 400, body: fail(id, -32600, "Mcp-Method header does not match the request.") };
  }
  const headerName = headers["mcp-name"];
  if (method === "tools/call" && headerName && headerName !== params?.name) {
    return { status: 400, body: fail(id, -32600, "Mcp-Name header does not match the tool.") };
  }

  if (id === undefined) return { status: 202, body: null };

  const version = headers["mcp-protocol-version"];
  if (version && !SUPPORTED_VERSIONS.includes(version)) {
    return { status: 400, body: fail(id, -32602, `Unsupported protocol version ${version}. Supported: ${SUPPORTED_VERSIONS.join(", ")}.`) };
  }

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return {
        status: 200,
        body: reply(id, {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSION,
          capabilities: CAPABILITIES,
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        }),
      };
    }
    case "server/discover":
      return {
        status: 200,
        body: reply(id, {
          supportedVersions: SUPPORTED_VERSIONS,
          capabilities: CAPABILITIES,
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        }),
      };
    case "ping":
      return { status: 200, body: reply(id, {}) };
    case "tools/list":
      return { status: 200, body: reply(id, { tools: TOOLS, ttlMs: 3600000 }) };
    case "tools/call": {
      const name = params?.name;
      const started = Date.now();
      try {
        const scope = await getScope();
        if (scope.refused) {
          return { status: 200, body: reply(id, { content: [{ type: "text", text: scope.message }], isError: true }) };
        }
        const result = await callTool(client, scope, name, params?.arguments || {});
        log({ tool: name, ok: true, ms: Date.now() - started });
        return {
          status: 200,
          body: reply(id, {
            content: [{ type: "text", text: result.summary }],
            structuredContent: result,
          }),
        };
      } catch (err) {
        const known = err instanceof ToolError;
        log({ tool: name, ok: false, ms: Date.now() - started, known });
        if (known && /^Unknown tool/.test(err.message)) {
          return { status: 200, body: fail(id, -32602, err.message) };
        }
        return {
          status: 200,
          body: reply(id, {
            content: [{ type: "text", text: known ? err.message : "That could not be read just now." }],
            isError: true,
          }),
        };
      }
    }
    default:
      return { status: 200, body: fail(id, -32601, `Method not found: ${method}`) };
  }
}
