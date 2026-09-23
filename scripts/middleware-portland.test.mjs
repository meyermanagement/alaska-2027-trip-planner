import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const { accountChecks } = jiti("../lib/auth/accountChecks.js");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const LAG = 40;
function fakeRpc(answers) {
  const calls = [];
  const t0 = Date.now();
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args, at: Math.round((Date.now() - t0) / LAG) });
      const out = typeof answers[name] === "function" ? answers[name](args) : answers[name];
      return new Promise((ok) => setTimeout(() => ok(out), LAG));
    },
  };
}

test("both account checks leave in the same round", async () => {
  const db = fakeRpc({
    account_session_allowed: { data: true, error: null },
    account_is_minor: { data: false, error: null },
  });
  const started = Date.now();
  const out = await accountChecks(db, "u1");
  assert.deepEqual(db.calls.map((c) => c.name).sort(), ["account_is_minor", "account_session_allowed"]);
  assert.deepEqual(new Set(db.calls.map((c) => c.at)), new Set([0]));
  assert.ok(Date.now() - started < LAG * 1.8, "one round, not two");
  assert.deepEqual(db.calls.find((c) => c.name === "account_is_minor").args, { account_id: "u1" });
  assert.equal(out.allowed, true);
  assert.equal(out.sessionError, null);
  assert.deepEqual(out.age, { unavailable: false, minor: false });
});

test("a refused session still reads as refused when the age check errors", async () => {
  // A handed-off session makes account_is_minor raise; middleware must see the
  // refusal, not a 'try again' from the age error.
  const db = fakeRpc({
    account_session_allowed: { data: false, error: null },
    account_is_minor: { data: null, error: { message: "This session has been signed out." } },
  });
  const out = await accountChecks(db, "u1");
  assert.equal(out.allowed, false);
  assert.equal(out.sessionError, null);
  assert.equal(out.age.unavailable, true);
  const mw = read("middleware.js");
  const gate = mw.slice(mw.indexOf("await accountChecks("));
  assert.ok(gate.indexOf("if (sessionError)") < gate.indexOf("if (!allowed)"));
  assert.ok(gate.indexOf("if (!allowed)") < gate.indexOf("if (age.unavailable)"));
  assert.ok(gate.indexOf("if (age.unavailable)") < gate.indexOf("if (age.minor)"));
});

test("a minor answer and an unreadable age come through unchanged", async () => {
  const minor = await accountChecks(fakeRpc({
    account_session_allowed: { data: true, error: null },
    account_is_minor: { data: true, error: null },
  }), "k");
  assert.deepEqual(minor.age, { unavailable: false, minor: true });
  const broken = await accountChecks(fakeRpc({
    account_session_allowed: { data: null, error: { message: "down" } },
    account_is_minor: { data: "yes", error: null },
  }), "k");
  assert.ok(broken.sessionError);
  assert.deepEqual(broken.age, { unavailable: true, minor: false });
});

test("nothing about the account is remembered between requests", () => {
  const mw = read("middleware.js");
  const src = read("lib/auth/accountChecks.js");
  assert.ok(!/cookies\.set\([^)]*(allowed|minor|session_ok)/i.test(mw));
  assert.ok(!/new Map|globalThis|let cache/.test(src));
  assert.equal((mw.match(/account_session_allowed/g) || []).length, 0, "only through accountChecks");
  assert.equal((mw.match(/accountChecks\(/g) || []).length, 1);
});

test("middleware stays on the edge; Node ran near the visitor anyway", () => {
  const mw = read("middleware.js");
  const config = mw.slice(mw.indexOf("export const config"));
  assert.doesNotMatch(config, /runtime:/);
  assert.doesNotMatch(mw, /runtime:\s*"nodejs"/);
  // Pages and API routes still run beside the database.
  const vercel = JSON.parse(read("vercel.json"));
  assert.deepEqual(vercel.regions, ["pdx1"]);
});

test("signed in at the front door goes to Now before any account check", () => {
  const mw = read("middleware.js");
  const home = mw.indexOf('if (user && pathname === "/")');
  assert.ok(home > mw.indexOf("const user = await whoIs(supabase)"));
  assert.ok(home > mw.indexOf("const { pathname } = request.nextUrl"));
  assert.ok(home < mw.indexOf("await accountChecks("));
  const block = mw.slice(home, mw.indexOf("return home;", home));
  assert.match(block, /url\.pathname = "\/now"/);
  assert.match(block, /url\.search = ""/);
  // Refreshed sign-in cookies ride along on the redirect.
  assert.match(block, /response\.cookies\.getAll\(\)/);
  // The child view is judged before this: its allowlist runs first.
  assert.ok(mw.indexOf("CHILD_VIEW_COOKIE)") < home);
  // The page keeps the same decision as a fallback.
  assert.match(read("app/page.js"), /if \(user\) redirect\("\/now"\)/);
});
