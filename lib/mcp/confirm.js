// The confirm step in front of every assistant write.
//
// A write tool never saves on its first call. It answers with what it would
// change, and saves only when the same call comes back carrying proof that the
// person said yes:
//
//   - A client that declares form elicitation gets an MCP InputRequiredResult
//     (the 2026-07-28 Multi Round-Trip Request). The client itself shows the
//     person a Save / Decline prompt, and the model cannot answer it for them.
//   - Any other client gets an ordinary, unsaved result with a `confirm` code
//     and an instruction to ask the person. The same call with that code saves.
//
// The code and the requestState are one signed token. It names the person,
// the assistant, the tool and a digest of the exact arguments, and lapses
// after ten minutes, so it cannot be reused for another person, another tool
// or changed arguments. It is signed with a key derived from the caller's own
// access token, which the model never sees, so the model cannot mint one. A
// refreshed token simply means asking again. It is not single-use: within the
// ten minutes the identical change could be sent twice, which the tools
// already treat as "already done" for check-offs and duplicate adds.

import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 10 * 60 * 1000;
const LABEL = "alyeska-mcp-confirm-v1";

function stable(args) {
  const out = {};
  for (const key of Object.keys(args).sort()) {
    if (key === "confirm") continue;
    const value = args[key];
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return JSON.stringify(out);
}

function sign(secret, body) {
  const key = createHmac("sha256", LABEL).update(String(secret)).digest();
  return createHmac("sha256", key).update(body).digest("base64url");
}

function digest(args) {
  return createHmac("sha256", LABEL).update(stable(args)).digest("base64url").slice(0, 22);
}

export function issueConfirm({ secret, principal, tool, args, now = Date.now() }) {
  const body = Buffer.from(
    JSON.stringify({ t: tool, d: digest(args), u: principal.userId, c: principal.clientId || "", e: now + TTL_MS })
  ).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

// "ok", "expired", or "invalid".
export function checkConfirm({ secret, principal, tool, args, token, now = Date.now() }) {
  if (typeof token !== "string" || !token.includes(".")) return "invalid";
  const [body, mac] = token.split(".");
  const want = Buffer.from(sign(secret, body));
  const got = Buffer.from(mac || "");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return "invalid";
  let claim;
  try {
    claim = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return "invalid";
  }
  if (claim.t !== tool || claim.d !== digest(args)) return "invalid";
  if (claim.u !== principal.userId || claim.c !== (principal.clientId || "")) return "invalid";
  if (typeof claim.e !== "number" || now > claim.e) return "expired";
  return "ok";
}

function label(key) {
  return key.replace(/_/g, " ");
}

// What the change is, in the person's terms: the tool's own title, then each
// argument as it was given.
export function describeChange(tool, args) {
  const lines = Object.entries(args)
    .filter(([key, value]) => key !== "confirm" && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${label(key)}: ${value}`);
  return { title: tool.title || tool.name, lines };
}

export function previewText(tool, args) {
  const { title, lines } = describeChange(tool, args);
  return lines.length ? `${title}\n${lines.map((l) => `- ${l}`).join("\n")}` : title;
}

export function supportsFormElicitation(params) {
  const caps = params?._meta?.["io.modelcontextprotocol/clientCapabilities"];
  const elicitation = caps?.elicitation;
  if (!elicitation || typeof elicitation !== "object") return false;
  // An empty object means form mode, for backward compatibility.
  return Object.keys(elicitation).length === 0 || "form" in elicitation;
}

export const CONFIRM_PROPERTY = {
  type: "string",
  description:
    "Leave this out the first time. The tool then saves nothing and returns a confirm code. Ask the person whether to make the change, and only if they say yes in this conversation, call the same tool again with the same arguments and this code.",
};

export function isWriteTool(tool) {
  return Boolean(tool && tool.annotations && tool.annotations.readOnlyHint === false);
}
