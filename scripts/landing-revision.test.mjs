import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const root = new URL("..", import.meta.url).pathname;
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const home = read("app/HomeLanding.js");
const nudge = read("components/home/NudgeCard.js");
const together = read("components/BetterTogether.js");
const form = read("components/home/WaitlistForm.js");
const publicCopy = [home, nudge, together, form, read("lib/home/alyIndex.js")].join("\n").replaceAll('role="alert"', "");

test("hero leads with the static line, the new body and the waitlist link", () => {
  const hero = home.split('<section className="home-hero"')[1].split("</section>")[0];
  assert.ok(hero.includes("Travel · Personalized. Contextualized. Simplified."));
  assert.ok(hero.includes("hear about what matters before it matters."));
  assert.ok(!hero.includes("get help along the way"));
  assert.match(hero, /href="#waitlist"[^>]*>\s*join the waitlist below/);
  assert.ok(hero.includes("<NudgeCard />"));
  assert.ok(!/AskDemo|RotatingWord/.test(home));
});

test("the hero examples are nudges, before and during, labeled, with drawn controls only", () => {
  assert.ok(nudge.indexOf("Maui · January 8") < nudge.indexOf("Maui · February 3"));
  assert.ok(nudge.indexOf("Maui · February 3") < nudge.indexOf("Kīhei · Tuesday, 11:10 am"));
  assert.ok(nudge.includes("Biscuit is coming now, but the hotel doesn’t allow pets."));
  assert.ok(nudge.includes('act: "See pet-friendly stays"'));
  assert.ok(nudge.includes("Dani’s driver’s license expires March 2, twelve days before the flight"));
  assert.ok(nudge.includes('act: "Add reminder"') && nudge.includes('act: "Apply"'));
  assert.doesNotMatch(nudge.split("const NUDGES")[1], /passport/i);
  assert.match(nudge.replace(/\s+/g, " "), /Rain is forecast at 2\. Lunch at the condo moves to 12:30 and the Mākena snorkel stays dry\. Sunset walk unchanged\./);
  assert.match(nudge.replace(/\s+/g, " "), /A real nudge is built from your own trip, your own travelers, and your own wallet\. You choose what changes\./);
  assert.ok(nudge.includes(">Example<"));
  assert.ok(nudge.includes("NUDGES.map"));
  assert.doesNotMatch(nudge, /<button|<a |ma-in|ma-fade/);
});

test("scenes run in the new order and alternate", () => {
  const order = ["Before you go", "While you are there", "<BetterTogether />", "When it changes", "Building the trip", "The money", "Pro tips"]
    .map((l) => (l.startsWith("<") ? home.indexOf(l) : home.indexOf(`label="${l}"`)));
  assert.ok(order.every((i) => i > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  const flips = [...home.matchAll(/<Scene\n\s+label="([^"]+)"\n(\s+flip\n)?/g)].map((m) => [m[1], !!m[2]]);
  assert.deepEqual(flips, [["Before you go", false], ["While you are there", true], ["When it changes", false],
    ["Building the trip", true], ["The money", false], ["Pro tips", true]]);
  const after = (a, b) => assert.ok(home.indexOf(a) < home.indexOf(b), `${a} before ${b}`);
  after("ALY_INDEX.map", "What we promise");
  after("What we promise", "On the roadmap, as of September 2026.");
  after("On the roadmap, as of September 2026.", "<WaitlistForm");
});

test("Better together shows each part and says the kids line", () => {
  assert.ok(together.includes("Kids see the plan and check off their own list in a view a parent controls."));
  assert.ok(together.includes("Parent-managed"));
  assert.ok(together.includes("Dani and Sam are planning"));
  assert.doesNotMatch(together, /\bgroups?\b|\bwork\b|colleague|team/i);
});

test("public copy avoids the words and names the plan rules out", () => {
  assert.doesNotMatch(publicCopy, /\balerts?\b/i);
  assert.doesNotMatch(publicCopy, /Works with|Grok/);
  assert.doesNotMatch(publicCopy.replaceAll("Pro tips", ""), /\bPro\b|\bBasic\b/);
});

test("What Aly knows sits after the promises, labeled, at a reserved signed-in address", () => {
  const promise = home.indexOf("PLEDGE_PROMISES.map");
  const card = home.indexOf("What Aly knows about you, on one page.");
  assert.ok(promise > 0 && card > promise);
  assert.ok(home.includes("Coming to Alyeska Family"));
  assert.ok(home.includes("sm:grid-cols-2 lg:grid-cols-4"));
  const { WHAT_ALY_KNOWS_PATH } = jiti("../lib/whatAlyKnows.js");
  assert.equal(WHAT_ALY_KNOWS_PATH, "/what-aly-knows");
  assert.ok(read("app/what-aly-knows/page.js").includes("index: false"));
  const mw = read("middleware.js");
  const publicList = mw.slice(mw.indexOf("const PUBLIC_PATHS"), mw.indexOf("];", mw.indexOf("const PUBLIC_PATHS")));
  assert.ok(!publicList.includes("/what-aly-knows"), "the page will hold household facts, so it stays behind sign-in");
});

test("roadmap lines are dated and plain", () => {
  const flat = home.replaceAll('{" "}', " ").replace(/\s+/g, " ");
  assert.ok(flat.includes("Alyeska Groups, 2027.</strong> One shared plan from the organizer; each household keeps its own notes and lists."));
  assert.ok(flat.includes("Planned: Claude, ChatGPT, Alexa+, Siri, and Muse. Read your trips first; changes later."));
  assert.ok(flat.includes("Alyeska for iPhone and Android, fall 2027."));
});

test("waitlist validation", () => {
  const { waitlistEntry, makeThrottle } = jiti("../lib/home/waitlist.js");
  assert.deepEqual(waitlistEntry({ email: "  Dani@Example.COM ", household_size: "6", organizer: "on" }),
    { ok: true, row: { email: "dani@example.com", household_size: 6, organizer: true, source: "home" } });
  assert.equal(waitlistEntry({ email: "a@b.co" }).row.household_size, null);
  assert.equal(waitlistEntry({ email: "a@b.co" }).row.organizer, false);
  assert.equal(waitlistEntry({ email: "a@b.co", household_size: "6+" }).row.household_size, 6);
  for (const bad of ["", "nope", "a@b", "a b@c.co", `${"x".repeat(250)}@b.co`, 7]) assert.equal(waitlistEntry({ email: bad }).ok, false);
  for (const size of ["0", "7", "two", "2.5"]) assert.equal(waitlistEntry({ email: "a@b.co", household_size: size }).field, "household_size");
  assert.deepEqual(waitlistEntry({ email: "", website: "http://spam" }), { ok: true, spam: true });
  const allow = makeThrottle({ limit: 2, windowMs: 1000 });
  assert.equal(allow("ip", 0), true); assert.equal(allow("ip", 1), true); assert.equal(allow("ip", 2), false);
  assert.equal(allow("other", 2), true); assert.equal(allow("ip", 1500), true);
});

test("waitlist route and form: public, one answer for repeats, no-JS path", () => {
  const route = read("app/api/waitlist/route.js");
  assert.match(route, /ignoreDuplicates: true/);
  assert.match(route, /if \(!admin\)/);
  assert.match(route, /NextResponse\.redirect\(url, 303\)/);
  assert.match(read("middleware.js"), /"\/api\/waitlist",/);
  assert.match(form, /method="post" action="\/api\/waitlist"/);
  assert.match(form, /id="waitlist"/);
  assert.ok(form.includes("I organize trips for a group or an organization."));
  assert.ok(form.includes("Never sold or shared."));
});

test("waitlist migration locks the table down", () => {
  const sql = read("supabase/migrations/20261016_waitlist.sql");
  assert.match(sql, /email text not null unique/);
  assert.match(sql, /email = lower\(email\)/);
  assert.match(sql, /household_size smallint check \(household_size between 1 and 6\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.waitlist from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy/i);
});
