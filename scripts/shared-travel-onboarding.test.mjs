import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { welcomeAge, welcomeAccess, wantsWelcomeInvite } = await jiti.import("../lib/welcome/access.js");
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const today = "2026-09-20";

test("optional access fails closed for unknown ages and everyone under 18", () => {
  for (const dob of ["", null, "not-a-date", "2030-01-01", "2000-02-31", "2012-01-01", "2008-09-21"]) {
    const person = { dob, accessChoice: "primary" };
    assert.notEqual(welcomeAge(dob, today), "adult");
    assert.equal(welcomeAccess(person, today), "secondary");
    assert.equal(wantsWelcomeInvite(person, today), false);
  }
  assert.equal(welcomeAge("2008-09-20", today), "adult");
  assert.equal(welcomeAccess({ dob: "2008-09-20", accessChoice: "primary" }, today), "primary");
});
test("adult role selection is explicit and skipping never requests an invitation", () => {
  for (const choice of ["", undefined, "admin"]) {
    assert.equal(welcomeAccess({ dob: "1990-01-01", accessChoice: choice }, today), "secondary");
    assert.equal(wantsWelcomeInvite({ dob: "1990-01-01", accessChoice: choice }, today), false);
  }
  for (const accessChoice of ["primary", "secondary"]) {
    assert.equal(wantsWelcomeInvite({ dob: "1990-01-01", accessChoice }, today), true);
    assert.equal(welcomeAccess({ dob: "1990-01-01", accessChoice }, today), accessChoice);
  }
});
test("home says the household part in one column, after the demonstrations, without real controls", () => {
  const home = source("app/HomeLanding.js");
  const start = home.indexOf("Better together");
  assert.ok(start > home.indexOf("<HowTabs"));
  const col = home.slice(start, home.indexOf("On the roadmap"));
  assert.doesNotMatch(col, /<img|<button|TripDemo|<video/);
  assert.ok(col.includes("Everyone on the trip sees their part of it."));
  assert.ok(col.includes("Kids get their own days and their own list"));
});
test("profile save is separate from email sending and preserves retry IDs", () => {
  const form = source("app/welcome/WelcomeForm.js");
  assert.match(form, /email: idx === 0 \? myEmail \|\| null : null/);
  assert.doesNotMatch(form, /fetch\("\/api\/welcome\/invite/);
  assert.match(form, /let writtenPeople = savedPeople/);
  assert.match(form, /if \(!writtenPeople\)/);
  assert.match(form, /Object.hasOwn\(patch, "dob"\).*accessChoice: undefined/);
  assert.match(source("app/welcome/WelcomeInvitations.js"), /if \(!practice\)/);
});

const routeCode = source("app/api/welcome/invite/route.js")
  .replace(/^import .*;\n/gm, "").replace("export const maxDuration", "const maxDuration")
  .replace("export async function POST", "async function POST");
function setup(options = {}) {
  const calls = [], sends = [];
  const person = { id: "person", name: "Riley", date_of_birth: "1990-01-01", access_level: "primary", user_id: null, ...options.person };
  let writing = false;
  const query = {
    select: (...args) => { calls.push(["select", ...args]); return query; },
    eq: (...args) => { calls.push(["eq", ...args]); return query; },
    is: (...args) => { calls.push(["is", ...args]); return query; },
    update: (...args) => { writing = true; calls.push(["update", ...args]); return query; },
    maybeSingle: async () => writing
      ? { data: options.zeroWrite ? null : { id: "person" }, error: options.writeError }
      : { data: options.missing ? null : person, error: options.readError },
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: "owner", email: "owner@example.com" } } }) },
    rpc: async () => ({ data: options.sessionDenied ? false : true, error: options.sessionError }),
    from: table => { calls.push(["from", table]); return query; },
  };
  const post = new Function("NextResponse", "createClient", "resolveAccess", "welcomeAge", "sendTravelerInvite", "siteOrigin", "requestOrigin", `${routeCode}\nreturn POST;`)(
    { json: (body, opts) => new Response(JSON.stringify(body), opts) }, async () => supabase,
    async () => ({ familyId: "family", can: { invitePeople: !options.secondary, setAccessLevels: !options.secondary } }),
    dob => welcomeAge(dob, today),
    async payload => { sends.push(payload); return options.deliveryFailure ? { ok: false, error: "Mailer unavailable.", status: 502 } : { ok: true, to: "riley@example.com" }; },
    () => "https://www.alyeska.app", () => { if (options.badOrigin) throw Error("wrong origin"); },
  );
  return { calls, sends, send: body => post(new Request("https://www.alyeska.app/api/welcome/invite", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
  })) };
}
const payload = { travelerId: "person", accessLevel: "primary", email: " Riley@Example.com ", confirmed: true };
test("invitation requires origin, active session, primary access and explicit confirmation", async () => {
  for (const [options, status] of [[{badOrigin:true},403],[{signedOut:true},401],[{secondary:true},403],[{sessionDenied:true},403],[{sessionError:{}},403]]) {
    const run = setup(options);
    assert.equal((await run.send(payload)).status, status);
    assert.equal(run.sends.length, 0);
    assert.equal(run.calls.filter(c => c[0] === "update").length, 0);
  }
  for (const body of [null, {}, "{", {...payload, confirmed:false}, {...payload, email:"bad"}, {...payload, email:"owner@example.com"}]) {
    const run = setup();
    assert.equal((await run.send(body)).status, 400);
    assert.equal(run.sends.length, 0);
  }
});
test("minor, unknown, linked and inaccessible travelers cannot be invited", async () => {
  for (const options of [{person:{date_of_birth:"2012-01-01"}}, {person:{date_of_birth:null}}, {person:{user_id:"linked"}}, {missing:true}, {readError:{}}]) {
    const run = setup(options);
    assert.ok([403,404].includes((await run.send(payload)).status));
    assert.equal(run.sends.length, 0);
    assert.equal(run.calls.filter(c => c[0] === "update").length, 0);
  }
});
test("confirmed invitation binds writes to tenant, age, role and unclaimed identity", async () => {
  const run = setup();
  assert.equal((await run.send(payload)).status, 200);
  assert.deepEqual(run.calls.find(c => c[0] === "update"), ["update", {email:"riley@example.com"}]);
  assert.equal(run.calls.filter(c => c[0] === "eq" && c[1] === "family_id" && c[2] === "family").length, 2);
  assert.ok(run.calls.some(c => c[0] === "eq" && c[1] === "date_of_birth"));
  assert.ok(run.calls.some(c => c[0] === "eq" && c[1] === "access_level"));
  assert.ok(run.calls.some(c => c[0] === "is" && c[1] === "user_id" && c[2] === null));
  assert.equal(run.sends.length, 1);
});
test("zero-row or failed writes never send; failed delivery discloses saved email", async () => {
  for (const options of [{zeroWrite:true},{writeError:{}},{person:{access_level:"secondary"}}]) {
    const run = setup(options);
    assert.equal((await run.send(payload)).status, 409);
    assert.equal(run.sends.length, 0);
  }
  const result = await setup({deliveryFailure:true}).send(payload);
  assert.equal(result.status, 502);
  assert.match((await result.json()).error, /email is saved, but delivery did not complete/);
});
