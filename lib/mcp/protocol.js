// The Model Context Protocol, as one stateless request and one answer.
//
// The 2026-07-28 revision retired the initialize handshake and the session
// header, so every POST stands alone. initialize is still answered for clients
// that have not caught up, and it holds no state either way.

import { TOOLS, ToolError, callTool } from "./tools";
import { VOICE_INSTRUCTIONS, VOICE_REFUSAL, isVoiceTool, voiceResult, voiceTools } from "./voice";
import {
  CONFIRM_PROPERTY,
  checkConfirm,
  describeChange,
  isWriteTool,
  issueConfirm,
  previewText,
  supportsFormElicitation,
} from "./confirm";

export const PROTOCOL_VERSION = "2026-07-28";
// 2025-03-26 is what Alexa+ sends in initialize. Nothing here depends on a
// later revision: structured results and elicitation are extra fields an
// older client ignores, and confirm falls back to the link when the client
// does not declare elicitation.
export const SUPPORTED_VERSIONS = [PROTOCOL_VERSION, "2025-11-25", "2025-06-18", "2025-03-26"];
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
  "Access to one household's saved travel in Alyeska: trips, one itinerary day at a time with booking advice, packing and day packs, reminders, adult travelers, preferences, budget, wallet balances and card offers, document and pet expiration dates, insurance coverage, deadlines, trip essentials, pro tips, nearby tips, bucket list, fare alerts, pets, favorite moments and past reviews. It can check packing items, day pack items and reminders off or back on, and a primary traveler can add a packing item, a reminder or a bucket-list place; add or change an itinerary item; create a trip or change its name, dates, destination, status or budget; add a Wallet program or update its balance, status or fee; add an item to a packing template; put a packing-list item in a day pack; start a trip's packing list and choose its add-on templates; add or update budget lines; update a packing line or a reminder; add a favorite moment; put a fare on a trip or turn it down; save a home airport; retire a bucket-list place; set a pet's plan for a trip; and add or update travel preferences for adults or the whole household. Nothing is ever deleted: to drop an itinerary item, set its status to cancelled. Choosing a trip's templates unlinks any template left out, never the template itself. It cannot change notes, confirmation numbers or a child's preferences; point the person to Alyeska for those. When a tool refuses or says something is done in Alyeska, pass its sentence and link on and point the person to Alyeska. After create_trip, offer its next_steps and ask before doing them. A template change applies to trips built afterward; when upcoming trips would change, next_steps says which and links to where it is pushed in Alyeska. After other writes, offer any next_steps they return and ask before acting on them. A day pack item must already be on the trip's packing list. If more than one line matches, it changes nothing and lists them; ask the person which. Adding something already on the list changes nothing. A parent also sees, checks off and adds their children's packing and day pack items; nothing else about a child is shared. Health and allergy details, typed notes, and confirmation, ID, member, policy and microchip numbers are not shared. Some tools are for the household's primary travelers only. Every change is confirmed before it saves. Either the person is asked directly, or the tool saves nothing and returns what it would change with a confirm code: show the person that change in plain words, ask, and call again with the same arguments and the code only after they say yes. Never send a code the person has not agreed to, and ask again for each change.";

const CAPABILITIES = { tools: { listChanged: false } };

// Write tools carry the optional confirm code in their schema, so a client
// that cannot show a confirm prompt can still send the person's yes back.
const LISTED_TOOLS = TOOLS.map((tool) =>
  isWriteTool(tool)
    ? { ...tool, inputSchema: { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, confirm: CONFIRM_PROPERTY } } }
    : tool
);

const VOICE_LISTED = voiceTools(LISTED_TOOLS);

function unsaved(text, extra = {}) {
  return { content: [{ type: "text", text }], structuredContent: { saved: false, ...extra } };
}

// Returns null when the write may run, or the reply to send instead.
function confirmGate(tool, params, args, { secret, principal }) {
  if (!secret || !principal?.userId) {
    return unsaved("This change could not be confirmed just now, so nothing was saved. It can be made in Alyeska.");
  }
  const preview = previewText(tool, args);

  // Multi Round-Trip retry: the client showed its own prompt.
  const answer = params?.inputResponses?.confirm;
  if (answer) {
    if (answer.action !== "accept") {
      return unsaved(`Not saved. The person chose not to make this change:\n${preview}`, { declined: true });
    }
    const verdict = checkConfirm({ secret, principal, tool: tool.name, args, token: params?.requestState });
    if (verdict === "ok") return null;
  } else if (args.confirm != null) {
    const verdict = checkConfirm({ secret, principal, tool: tool.name, args, token: args.confirm });
    if (verdict === "ok") return null;
    if (verdict === "expired") {
      // Fall through to a fresh code below.
    } else {
      return unsaved("That confirm code doesn't match this change, so nothing was saved. Ask the person again.");
    }
  }

  const token = issueConfirm({ secret, principal, tool: tool.name, args });
  if (supportsFormElicitation(params)) {
    const { title, lines } = describeChange(tool, args);
    return {
      resultType: "input_required",
      inputRequests: {
        confirm: {
          method: "elicitation/create",
          params: {
            mode: "form",
            message: `Save this change in Alyeska?\n\n${title}${lines.length ? `\n${lines.join("\n")}` : ""}`,
            requestedSchema: { type: "object", properties: {} },
          },
        },
      },
      requestState: token,
    };
  }
  return unsaved(
    `Nothing is saved yet. Ask the person whether to make this change:\n${preview}\nOnly if they say yes, call ${tool.name} again with the same arguments and confirm: "${token}".`,
    { needs_confirmation: true, change: describeChange(tool, args), confirm: token }
  );
}

function reply(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function fail(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

// Returns { status, body } where body is null for a notification.
// `getScope` is called only for tools/call, so listing tools never touches the
// database.
export async function handleMessage(message, { headers = {}, client, getScope, confirmSecret, clientId, surface = "full", log = () => {} }) {
  const voice = surface === "voice";
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
          instructions: voice ? VOICE_INSTRUCTIONS : INSTRUCTIONS,
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
          instructions: voice ? VOICE_INSTRUCTIONS : INSTRUCTIONS,
        }),
      };
    case "ping":
      return { status: 200, body: reply(id, {}) };
    case "tools/list":
      return { status: 200, body: reply(id, { tools: voice ? VOICE_LISTED : LISTED_TOOLS, ttlMs: 3600000 }) };
    case "tools/call": {
      const name = params?.name;
      const started = Date.now();
      // Checked before anything is read, so a held-back tool costs nothing
      // and a write never reaches the confirm step on a speaker.
      if (voice && !isVoiceTool(name)) {
        log({ tool: name, ok: false, refused: "voice", ms: 0 });
        return { status: 200, body: reply(id, { content: [{ type: "text", text: VOICE_REFUSAL }], isError: true }) };
      }
      try {
        const scope = await getScope();
        if (scope.refused) {
          return { status: 200, body: reply(id, { content: [{ type: "text", text: scope.message }], isError: true }) };
        }
        const args = params?.arguments || {};
        const tool = TOOLS.find((t) => t.name === name);
        // Arguments the tool would reject anyway go straight to it, so a bad
        // call fails at once instead of after the person has said yes.
        const wellFormed =
          args && typeof args === "object" && !Array.isArray(args) &&
          Object.entries(args).every(
            ([key, value]) => (key === "confirm" || key in (tool?.inputSchema?.properties || {})) && (value == null || typeof value === "string")
          );
        if (isWriteTool(tool) && wellFormed) {
          const held = confirmGate(tool, params, args, {
            secret: confirmSecret,
            principal: { userId: scope.userId, clientId },
          });
          if (held) {
            log({ tool: name, ok: true, held: held.resultType || (held.structuredContent?.declined ? "declined" : "asked"), ms: Date.now() - started });
            return { status: 200, body: reply(id, held) };
          }
        }
        const { confirm: _confirm, ...rest } = args && typeof args === "object" && !Array.isArray(args) ? args : {};
        const raw = await callTool(client, scope, name, args && typeof args === "object" && !Array.isArray(args) ? rest : args);
        const result = voice ? voiceResult(name, raw) : raw;
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
