import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const root = new URL("..", import.meta.url).pathname;
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const home = read("app/HomeLanding.js");
const nudge = read("components/home/NudgeCard.js") + read("lib/home/nudges.js");
const how = read("components/home/HowTabs.js");
const form = read("components/home/WaitlistForm.js");
const publicCopy = [home, nudge, how, form, read("lib/home/alyIndex.js")].join("\n").replaceAll('role="alert"', "");

test("hero leads with the turning line, the new body and the waitlist link", () => {
  const hero = home.split('<section className="home-hero"')[1].split("</section>")[0];
  assert.ok(hero.includes("<TaglineTurn />"));
  const tag = read("components/home/TaglineTurn.js");
  assert.ok(tag.includes('const WORDS = ["Personalized.", "Contextualized.", "Simplified."];'));
  assert.ok(tag.includes("Travel ·"));
  assert.match(tag, /data-on=\{!turning \|\| i === at/, "with nothing running, every word is lit");
  assert.ok(hero.includes("hear about what matters before it matters."));
  assert.ok(!hero.includes("get help along the way"));
  assert.doesNotMatch(hero, /In closed beta|join the waitlist below/, "the hero leads with See how it works, not the beta note");
  assert.ok(hero.includes("<NudgeCard />"));
  assert.ok(!/AskDemo|RotatingWord/.test(hero), "the nudge leads the hero");
  assert.ok(!/RotatingWord|AskDemo|BetterTogether|PLEDGE_/.test(home), "the chat, the household panel and the pledge cards are off the front page");
});

test("the hero examples are nudges, before and during, labeled, with drawn controls only", () => {
  assert.ok(nudge.indexOf("Jan 8 · 65 days before Maui") < nudge.indexOf("Feb 3 · 39 days before Maui"));
  assert.ok(nudge.indexOf("Feb 3 · 39 days before Maui") < nudge.indexOf("Wed 1:40 PM · Day 5 in Maui"));
  assert.ok(nudge.includes('title: "Dani’s license expires before the trip"'));
  assert.ok(nudge.includes('title: "Waiʻānapanapa needs a reservation"'));
  assert.ok(nudge.includes('title: "Fresh pineapple, on your way down"'));
  assert.ok(nudge.includes('title: "Showers from 1 to 3 this afternoon"'), "the rain change is kept for When it changes");
  assert.ok(nudge.includes("Reservations for March 16 open February 14 at midnight Hawaii time."));
  assert.ok(nudge.includes('act: "Remind me Feb 14"'));
  assert.doesNotMatch(nudge.split("const NUDGES")[1], /Biscuit|pets?\b|stays dry/);
  assert.ok(nudge.includes("It expires March 2, twelve days before the flight"));
  assert.ok(nudge.includes('act: "Add reminder"') && nudge.includes('act: "Apply"'));
  assert.doesNotMatch(nudge.split("const NUDGES")[1], /passport/i);
  assert.ok(nudge.includes("Lunch at the condo moves to 12:30, so you’re home before they start."));
  // The heading says what the cards are; the color's meaning is said in words.
  assert.ok(nudge.includes(">Before you think to ask<"));
  assert.match(nudge.replace(/\s+/g, " "), /You don’t have to know the right questions to ask\. Alyeska watches your trip and tells you when something needs you\./);
  assert.deepEqual([...nudge.matchAll(/tag: "([^"]+)"/g)].map((m) => m[1]), ["Needed to travel", "Book Feb 14", "On your way", "Last minute"]);
  assert.doesNotMatch(nudge, /Just say yes|Ready to apply|A real nudge|"High"|"Low"/);
  assert.equal((nudge.match(/>Example</g) || []).length, 1, "labeled once, on the heading");
  assert.ok(nudge.includes("NUDGES.map"));
  // The marks under the stack are the only real control: they choose an example
  // and stop the turning. The choices drawn on each card stay spans.
  assert.equal((nudge.match(/<button/g) || []).length, 1);
  assert.match(nudge, /onClick=\{\(\) => \{\s*setAt\(i\);\s*setTurning\(false\);/);
  assert.doesNotMatch(nudge, /<a |ma-in|ma-fade/);
  assert.deepEqual([...nudge.matchAll(/level: "(\w+)"/g)].map((m) => m[1]), ["high", "medium", "low", "low"]);
  assert.ok(nudge.includes("prefers-reduced-motion"));
  // When it changes shows the same rain message, as the notification it arrives as.
  const notice = read("components/home/RainNotice.js");
  const changes = home.slice(home.indexOf('label: "When it changes"'), home.indexOf('label: "The money"'));
  assert.ok(changes.includes("media: <RainNotice />"));
  assert.ok(notice.includes("RAIN_NUDGE") && notice.includes('src="/landing/rain.jpg"'));
  assert.doesNotMatch(notice, /<button|<a /);
  const css = read("app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.home-nudge-stack \{/);
  // A drag left or right moves between the three, on the same path a tap on a
  // mark uses, so a swipe stops the turning exactly like a tap does.
  assert.match(nudge, /onPointerDown=\{/);
  assert.match(nudge, /onPointerMove=\{/);
  assert.match(nudge, /onPointerUp=\{/);
  assert.match(nudge, /const go = \(dir\) => \{\s*setAt\(\(n\) => \(n \+ dir \+ NUDGES\.length\) % NUDGES\.length\);\s*setTurning\(false\);/);
  assert.match(nudge, /className="home-nudge-swipe"/);
  assert.match(css, /\.home-nudge-swipe \{\s*touch-action: pan-y;/);
});

test("four demonstrations behind one tab strip, in the order a trip happens", () => {
  const labels = [...home.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Before you go", "While you are there", "When it changes", "The money"]);
  assert.ok(home.includes("Pick a moment. See what Alyeska does with it."));
  assert.doesNotMatch(home, /<Scene\b/, "no scenes left on the page");
  // The strip is the trip screen's tab bar, not a new control.
  assert.match(how, /className="tabbar home-how-bar"[\s\S]*?role="tablist"/);
  assert.match(how, /role="tab"[\s\S]*?aria-selected=\{here\}[\s\S]*?className="tab"/);
  assert.match(how, /"ArrowRight"[\s\S]*"ArrowLeft"[\s\S]*"Home"[\s\S]*"End"/);
  // Every panel is server-rendered and stays in the DOM, hidden rather than
  // unmounted, so a crawler and a no-JS browser get all four in order.
  assert.match(how, /className=\{i === at \? "home-how-panel" : "hidden"\}/);
  assert.doesNotMatch(how, /\.scrollIntoView\(/, "the strip is scrolled by hand so the page never jumps");
  // The right-edge fade follows the trip screen's rule and never eats a tap.
  assert.match(how, /setMoreTabs\(bar\.scrollWidth - bar\.clientWidth - bar\.scrollLeft > 2\)/);
  assert.match(how, /\{moreTabs \? \(\s*<span aria-hidden="true" className="home-how-fade" \/>/);
  const css = read("app/globals.css");
  assert.match(css, /\.home-how-fade \{\s*pointer-events: none;/);
  assert.match(css, /@media \(max-width: 420px\) \{\s*\.home-how-bar \{\s*display: grid;\s*grid-template-columns: 1fr 1fr;/);
  // What follows the strip, in order: the one-line index, the household and
  // the roadmap side by side, then the waitlist. The pledge lives at /pledge.
  const after = (a, b) => assert.ok(home.indexOf(a) < home.indexOf(b), `${a} before ${b}`);
  after("<HowTabs", "Also looked after");
  after("Also looked after", "ALY_INDEX.flatMap");
  after("ALY_INDEX.flatMap", "Better together");
  after("Better together", "On the roadmap, as of September 2026.");
  after("On the roadmap, as of September 2026.", "<WaitlistForm");
  for (const line of ["Building the trip", "When you ask", "Pro tips"]) assert.ok(home.includes(`["${line}",`), `${line} is one line in the index`);
  assert.doesNotMatch(home, /What we promise/);
  assert.match(home, /href="\/pledge"[\s\S]*?Our Pledge/);
});

test("Better together is one column: the heading, and the kids line", () => {
  const col = home.slice(home.indexOf("Better together"), home.indexOf("On the roadmap"));
  assert.ok(col.includes("Everyone on the trip sees their part of it."));
  assert.ok(col.includes("Kids get their own days and their own list, and nothing else."));
  assert.doesNotMatch(col, /<img|<button|<video/);
  assert.doesNotMatch(col, /\bgroups?\b|\bwork\b|colleague|team/i);
});

test("public copy avoids the words and names the plan rules out", () => {
  assert.doesNotMatch(publicCopy, /\balerts?\b/i);
  assert.doesNotMatch(publicCopy, /Works with|Grok/);
  assert.doesNotMatch(publicCopy.replaceAll("Pro tips", ""), /\bPro\b|\bBasic\b/);
});

test("What Aly knows stays at a reserved signed-in address, off the front page", () => {
  assert.doesNotMatch(home, /What Aly knows about you|Coming to Alyeska Family/);
  const { WHAT_ALY_KNOWS_PATH } = jiti("../lib/whatAlyKnows.js");
  assert.equal(WHAT_ALY_KNOWS_PATH, "/what-aly-knows");
  assert.ok(read("app/what-aly-knows/page.js").includes("index: false"));
  const mw = read("middleware.js");
  const publicList = mw.slice(mw.indexOf("const PUBLIC_PATHS"), mw.indexOf("];", mw.indexOf("const PUBLIC_PATHS")));
  assert.ok(!publicList.includes("/what-aly-knows"), "the page will hold household facts, so it stays behind sign-in");
  assert.ok(!publicList.includes("/landing-tabs"), "the mockup route did not ship");
});

test("roadmap lines are dated and plain", () => {
  const flat = home.replaceAll('{" "}', " ").replace(/\s+/g, " ");
  assert.ok(flat.includes("Alyeska Groups, 2027.</strong> Several households, one trip."));
  assert.ok(flat.includes("Ask Alyeska from Claude, ChatGPT, Alexa+, Siri, and Muse.</strong> Read first; changes later."));
  assert.ok(flat.includes("iPhone and Android, fall 2027."));
});

test("waitlist validation", () => {
  const { waitlistEntry, makeThrottle } = jiti("../lib/home/waitlist.js");
  const who = { first_name: "Dani", last_name: "Kahale" };
  assert.deepEqual(waitlistEntry({ first_name: "  Dani ", last_name: " de  la Cruz ", email: "  Dani@Example.COM ", household_size: "6", organizer: "on" }),
    { ok: true, row: { first_name: "Dani", last_name: "de la Cruz", email: "dani@example.com", household_size: 6, organizer: true, source: "home" } });
  assert.equal(waitlistEntry({ ...who, email: "a@b.co" }).row.household_size, null);
  assert.equal(waitlistEntry({ ...who, email: "a@b.co" }).row.organizer, false);
  assert.equal(waitlistEntry({ ...who, email: "a@b.co", household_size: "6+" }).row.household_size, 6);
  for (const bad of ["", "nope", "a@b", "a b@c.co", `${"x".repeat(250)}@b.co`, 7]) assert.equal(waitlistEntry({ ...who, email: bad }).field, "email");
  for (const size of ["0", "7", "two", "2.5"]) assert.equal(waitlistEntry({ ...who, email: "a@b.co", household_size: size }).field, "household_size");
  // Both names are required, in the order the form asks for them.
  assert.equal(waitlistEntry({ email: "a@b.co" }).field, "first_name");
  assert.equal(waitlistEntry({ first_name: "   ", last_name: "K", email: "a@b.co" }).field, "first_name");
  assert.equal(waitlistEntry({ first_name: "Dani", email: "a@b.co" }).field, "last_name");
  assert.equal(waitlistEntry({ first_name: "x".repeat(81), last_name: "K", email: "a@b.co" }).field, "first_name");
  assert.equal(waitlistEntry({ first_name: "Da\u0000ni", last_name: "K", email: "a@b.co" }).row.first_name, "Dani");
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
  assert.match(form, /name="first_name"[\s\S]*?autoComplete="given-name"[\s\S]*?required/);
  assert.match(form, /name="last_name"[\s\S]*?autoComplete="family-name"[\s\S]*?required/);
  assert.ok(form.indexOf('name="first_name"') < form.indexOf('name="email"'));
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

test("the example chat is the same trip as the rest of the page", async () => {
  const { createJiti } = await import("jiti");
  const { HERO_CONVERSATION } = createJiti(import.meta.url)("../lib/home/heroConversation.js");
  const text = JSON.stringify(HERO_CONVERSATION);
  for (const turn of HERO_CONVERSATION) assert.match(turn.stamp, /^Kīhei · Monday, \d/);
  assert.ok(text.includes("Mākena") && text.includes("8:20") && text.includes("7:50"), "tomorrow is the Tuesday the day card shows");
  assert.ok(text.includes("the four of you"));
  assert.ok(!/Rivera|three of you|whale|Wednesday/i.test(text));
  const day = read("components/home/DayDemo.js");
  assert.ok(day.includes("Mia’s light jacket") && text.includes("Mia's light jacket"));
});

test("the example day is a real calendar, dated the week the chat talks about", () => {
  const day = read("components/home/DayDemo.js");
  assert.match(home, /media: <DayDemo \/>/);
  assert.match(day, /const TODAY = "2026-03-17"/);
  // Tuesday, March 17 has to be a Tuesday, or the tiles and the header disagree.
  assert.equal(new Date("2026-03-17T12:00:00Z").getUTCDay(), 2);
  const dates = [...day.matchAll(/date: "(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
  assert.deepEqual(dates, [14, 15, 16, 17, 18, 19, 20, 21].map((d) => `2026-03-${d}`));
  // Borrowed from the trip screen rather than redrawn, so the demo cannot drift.
  for (const name of ["DayItemBrief", "WaysThere", "day-tile", "hedgeSaid", "distanceSaid"])
    assert.ok(day.includes(name), name);
  assert.match(day, /invented/i);
});

test("the example day follows the trip screen: bag first, reviews only where the app takes one", () => {
  const day = read("components/home/DayDemo.js");
  const panel = day.slice(day.indexOf("function DayPanel"));
  assert.ok(panel.indexOf("<Pack day={day} />") < panel.indexOf("day.items.map"), "day pack above the bookings");
  assert.match(day, /item\.stars && isReviewable\(item\)/);
  for (const line of day.split("\n").filter((l) => /stars: \d/.test(l)))
    assert.match(line, /category: "(dining|excursion|activity)"/, line.trim().slice(0, 60));
});

test("waitlist names: migration, privacy, and the closing section offers only the waitlist", () => {
  const sql = read("supabase/migrations/20261017_waitlist_names.sql");
  assert.match(sql, /add column if not exists first_name text/);
  assert.match(sql, /add column if not exists last_name text/);
  assert.match(sql, /char_length\(first_name\) between 1 and 80/);
  assert.ok(read("lib/privacy.js").includes("What we keep: your first and last name, your email address"));
  const page = read("app/HomeLanding.js");
  const closing = page.slice(page.indexOf("No ads. No commissions."));
  assert.ok(closing.includes("<WaitlistForm"));
  assert.doesNotMatch(closing, /href="\/login"/);
  assert.doesNotMatch(page, /Meet Aly\s*<\/Link>/);
  // Testers with an account still have a way in, at the top.
  assert.match(page, /href="\/login"[\s\S]*?Sign in/);
});

test("the example day is only as tall as the day on screen", () => {
  const day = read("components/home/DayDemo.js");
  assert.ok(day.includes('className={active ? undefined : "hidden"}'));
  assert.doesNotMatch(day, /grid-area:1\/1|"invisible"/);
  assert.ok(day.includes("inert={active ? undefined : true}"));
});

test("the money scene shows planned against actual and picks a card on points, perks and coverage", () => {
  const budget = read("components/home/BudgetDemo.js");
  assert.match(home, /media: <BudgetDemo \/>/);
  for (const w of ['"Planned"', '"Actual"'].map((x) => x.slice(1, -1))) assert.ok(budget.includes(`>${w}<`));
  for (const k of ['"Points"', '"Perks"', '"Coverage"']) assert.ok(budget.includes(`[${k},`));
  assert.ok(budget.includes("Example trip"));
  assert.doesNotMatch(budget, /Chase|Amex|American Express|Sapphire|Capital One|<button|<a /);
});

test("the hero cards turn at about 300 words a minute, never under four and a half seconds", () => {
  assert.match(nudge, /Math\.max\(4500, `\$\{n\.title\} \$\{n\.text\}`\.split\(\/\\s\+\/\)\.length \* 200\)/);
});
