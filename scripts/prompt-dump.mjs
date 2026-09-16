// What Aly is actually about to send, printed instead of sent.
//
// The packet claims a list of things that never reach the model: document
// numbers, insurance policy numbers, and what a family paid for a policy. It
// also claims one thing that deliberately does reach it -- the deductible,
// because that is what decides whether a claim is worth filing. Both are
// claims about a string, so the honest way to back them is to build the string
// the same way the chat route builds it and read it.
//
// This signs in as a real account with the publishable key, exactly as the
// browser does, so every read goes through row-level security rather than
// around it. It calls the same loader and the same prompt builder the route
// calls. It never calls a model: it prints the payload and exits.
//
//   node scripts/prompt-dump.mjs <email> <password> "the question" [tripId]

import { createJiti } from "jiti";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.env.APP_ROOT || "/home/user/workspace/repo";
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });

const [email, password, said = "What should I know before this trip?", tripId] =
  process.argv.slice(2);
if (!email || !password) {
  console.error(
    'usage: node scripts/prompt-dump.mjs <email> <password> "question" [tripId]',
  );
  process.exit(2);
}

const URL = process.env.SUPABASE_URL || "https://iqpuwrmfmdndayphlngp.supabase.co";
const KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_SJgPP1NgHDxxzBb-9mespw_hXigt937";

// supabase-js builds a realtime client on construction, and on Node 20 that
// looks for a WebSocket it will never use here. A stub keeps the constructor
// happy; nothing in this script subscribes to anything.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {
    constructor() {
      throw new Error("realtime is not used by this script");
    }
  };
}

const supabase = createClient(URL, KEY);
const { data: signIn, error: signInError } =
  await supabase.auth.signInWithPassword({ email, password });
if (signInError) {
  console.error("sign-in failed:", signInError.message);
  process.exit(1);
}
const user = signIn.user;

const { loadEverything } = await jiti.import(`${ROOT}/lib/agent/load.js`);
const { buildSystemPrompt } = await jiti.import(`${ROOT}/lib/agent/context.js`);

const ctx = await loadEverything(supabase, user.id, tripId || null, said, null);
const system = buildSystemPrompt(ctx.text, null, ctx.focusTripName, {
  people: ctx.travelerNames,
  petNames: ctx.known?.pets ? Array.from(ctx.known.pets.values()) : [],
});

const payload = `${system}\n\n===== USER MESSAGE =====\n${said}\n`;

console.log(`# signed in as ${email} (${user.id})`);
console.log(`# question: ${said}`);
console.log(`# payload characters: ${payload.length}`);
console.log("=".repeat(72));
console.log(payload);

// Turns the dump into a check rather than a reading exercise. FORBID is a
// comma-separated list of strings that must not appear -- seed a document
// number, a policy number and a premium and name them here -- and REQUIRE is
// the list that must. Exits non-zero when either is violated, so this can be
// run as a regression rather than re-read by eye every release.
const list = (name) =>
  (process.env[name] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const forbid = list("FORBID");
const require_ = list("REQUIRE");
if (forbid.length || require_.length) {
  const leaked = forbid.filter((s) => payload.includes(s));
  const absent = require_.filter((s) => !payload.includes(s));
  console.log("=".repeat(72));
  for (const s of forbid)
    console.log(`${leaked.includes(s) ? "LEAKED  " : "absent  "} ${s}`);
  for (const s of require_)
    console.log(`${absent.includes(s) ? "MISSING " : "present "} ${s}`);
  if (leaked.length || absent.length) {
    console.log("FAIL");
    process.exit(1);
  }
  console.log("PASS");
}
