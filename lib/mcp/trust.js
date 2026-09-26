// Which assistant a self-registered OAuth client is, judged only by where its
// approvals go.
//
// With dynamic client registration on, anybody can register a client and call
// it "Claude". The name proves nothing. What can't be faked is the return
// address: Supabase sends the authorization code only to a redirect URI the
// client registered, so a client whose every registered address belongs to
// claude.ai can only ever deliver codes to Claude.
//
// The rule is deliberately all-or-nothing: a client is trusted only when it has
// at least one registered address and every one of them matches the same
// assistant below. One stray address (a lookalike host, localhost, a different
// path) makes the whole client unknown, because Supabase may later auto-approve
// a request to that address without showing our consent screen.
//
// The name, description and purpose shown on the consent screen come from this
// list, never from the client's own registration metadata.

const PURPOSE =
  "Reads your trips, daily plans, packing and day packs (your children's too), reminders, preferences, budget, wallet, document and pet expiration dates, insurance, bucket list, fare alerts, and past reviews so NAME can answer questions about your travel. It can check off packing, day pack items and reminders; add packing items, reminders and bucket-list places; and create and change trips, itinerary items, wallet programs, packing templates, day packs, budgets, fares, home airports, pet plans and adults' travel preferences. Before any change saves, you're shown what it will change and asked to confirm. It can't delete anything except taking an add-on packing template off a trip when you ask.";

// The hosts Alyeska's MCP server is reached on, as Gemini writes them (dots,
// and possibly hyphens, as underscores).
const MCP_HOSTS = ["www.alyeska.app", "alyeska.app", "alaska-2027-trip-planner.vercel.app"];
const HOST_SLUGS = [...new Set(MCP_HOSTS.flatMap((h) => [h.replace(/\./g, "_"), h.replace(/[.-]/g, "_")]))];
const GEMINI_PATH = {
  origin: "https://oauth-redirect.googleusercontent.com",
  path: new RegExp(`^/r/user_bound_custom-mcp-[0-9]{6,40}-(?:${HOST_SLUGS.join("|")})$`),
};

// exact: origin and path must equal. prefix: same origin, and the path must
// start with this prefix followed by at least one more character. pattern:
// same origin, and the whole path must match the expression.
export const TRUSTED_ASSISTANTS = [
  {
    key: "claude",
    name: "Claude",
    description: "Anthropic's assistant, on claude.ai and the Claude apps.",
    redirects: [
      { exact: "https://claude.ai/api/mcp/auth_callback" },
      { exact: "https://claude.com/api/mcp/auth_callback" },
    ],
  },
  {
    key: "chatgpt",
    name: "ChatGPT",
    description: "OpenAI's assistant, on chatgpt.com.",
    redirects: [
      { exact: "https://chatgpt.com/connector_platform_oauth_redirect" },
      { prefix: "https://chatgpt.com/connector/oauth/" },
    ],
  },
  {
    key: "gemini",
    name: "Gemini",
    description: "Google's assistant, on gemini.google.com.",
    // Gemini gives each person's connection its own address under Google's
    // shared account-linking host, e.g. (from a Square developer forum post,
    // not Google's documentation)
    //   /r/user_bound_custom-mcp-107303354335300565420-mcp_squareup_com
    // for mcp.squareup.com: a numeric id, then the MCP server's host with dots
    // as underscores. The bare /r/ path is NOT enough: any Google developer
    // can own an address there (/r/<their project id>). Project ids can't
    // contain underscores, so requiring this exact shape, ending in one of our
    // own hosts, keeps it to Gemini connections made to Alyeska. Confirm
    // against the first real Gemini registration.
    redirects: [{ pattern: GEMINI_PATH }],
  },
].map((a) => ({ ...a, purpose: PURPOSE.replace("NAME", a.name) }));

// A registered address, reduced to what may be compared. Anything unusual --
// not https, a port, credentials, a query or fragment, a dot segment or an
// encoded slash in the path -- is refused rather than normalized.
function strictUrl(value) {
  if (typeof value !== "string" || value !== value.trim() || !value) return null;
  let u;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.port || u.username || u.password) return null;
  if (u.search || u.hash || value.includes("?") || value.includes("#")) return null;
  if (/%2f|%5c|%2e|\\/i.test(u.pathname) || /(^|\/)\.\.?(\/|$)/.test(value.replace(/^https:\/\/[^/]+/, ""))) return null;
  // new URL lowercases the host; require the original to already be the same,
  // so what we compare is what was registered.
  if (!value.startsWith(u.origin + "/")) return null;
  return u;
}

function matches(rule, u) {
  if (rule.exact) {
    const r = new URL(rule.exact);
    return u.origin === r.origin && u.pathname === r.pathname;
  }
  if (rule.pattern) return u.origin === rule.pattern.origin && rule.pattern.path.test(u.pathname);
  const r = new URL(rule.prefix);
  return u.origin === r.origin && u.pathname.startsWith(r.pathname) && u.pathname.length > r.pathname.length;
}

// The assistant one address belongs to, or null.
export function assistantForRedirect(value) {
  const u = strictUrl(value);
  if (!u) return null;
  return TRUSTED_ASSISTANTS.find((a) => a.redirects.some((rule) => matches(rule, u))) || null;
}

// Supabase stores a client's redirect_uris as one text value; accept that or
// an array.
export function parseRedirectUris(raw) {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string" && x);
  if (typeof raw !== "string") return [];
  return raw.split(/[\s,]+/).filter(Boolean);
}

// The one assistant every registered address belongs to, or null.
export function assistantForClient(redirectUris) {
  const uris = parseRedirectUris(redirectUris);
  if (uris.length === 0) return null;
  let found = null;
  for (const uri of uris) {
    const a = assistantForRedirect(uri);
    if (!a) return null;
    if (found && found.key !== a.key) return null;
    found = a;
  }
  return found;
}
