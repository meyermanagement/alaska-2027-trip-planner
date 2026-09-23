import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { waitlistRows, travelersLabel } from "../lib/beta/waitlist.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const now = new Date("2026-09-24T12:00:00Z");

const entries = [
  { id: "a", first_name: "Dani", last_name: "Kahale", email: "first@example.com", created_at: "2026-09-20T00:00:00Z", household_size: 4 },
  { id: "b", email: "second@example.com", created_at: "2026-09-21T00:00:00Z", organizer: true },
  { id: "c", email: "sent@example.com", created_at: "2026-09-19T00:00:00Z" },
  { id: "d", email: "spent@example.com", created_at: "2026-09-18T00:00:00Z" },
  { id: "e", email: "retired@example.com", created_at: "2026-09-22T00:00:00Z" },
  { id: "f", email: "member@example.com", created_at: "2026-09-17T00:00:00Z" },
];
const codes = [
  { code: "ALY-SENT-0001", assignedEmail: "Sent@Example.com", assignedAt: "2026-09-23T00:00:00Z", sentAt: "2026-09-23T00:00:00Z", sendCount: 2 },
  { code: "ALY-USED-0001", assignedEmail: "spent@example.com", assignedAt: "2026-09-22T00:00:00Z", usedAt: "2026-09-23T00:00:00Z" },
  { code: "ALY-DEAD-0001", assignedEmail: "retired@example.com", assignedAt: "2026-09-22T00:00:00Z", expiresAt: "2026-09-23T00:00:00Z" },
];

test("each waitlist address is placed from the codes table and accounts", () => {
  const rows = waitlistRows(entries, codes, new Set(["member@example.com"]), now);
  const by = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(by.a.state, "waiting");
  assert.equal(by.b.state, "waiting");
  assert.equal(by.c.state, "invited");
  assert.equal(by.c.code, "ALY-SENT-0001");
  assert.equal(by.c.sendCount, 2);
  assert.equal(by.d.state, "joined");
  assert.equal(by.d.viaAccount, false);
  // A retired code would arrive dead, so the address waits for a live one.
  assert.equal(by.e.state, "waiting");
  assert.equal(by.e.code, null);
  // In by another door: said, and nothing to send.
  assert.equal(by.f.state, "joined");
  assert.equal(by.f.viaAccount, true);
});

test("a name from the form heads the row; older entries fall back to the address", () => {
  const rows = waitlistRows(entries, codes, new Set(), now);
  const by = Object.fromEntries(rows.map((row) => [row.id, row]));
  assert.equal(by.a.fullName, "Dani Kahale");
  assert.equal(by.a.firstName, "Dani");
  assert.equal(by.b.fullName, null);
  const desk = read("app/admin/waitlist/WaitlistDesk.js");
  assert.match(desk, /\{row\.fullName \|\| row\.email\}/);
  assert.match(desk, /setName\(row\.firstName \|\| ""\)/);
  assert.match(read("app/admin/waitlist/page.js"), /select\("id, first_name, last_name, email/);
});

test("waiting comes first, oldest first; the rest newest first", () => {
  const rows = waitlistRows(entries, codes, new Set(["member@example.com"]), now);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b", "e", "c", "d", "f"],
  );
});

test("traveler counts read as words, six meaning six or more", () => {
  assert.equal(travelersLabel(null), null);
  assert.equal(travelersLabel(1), "1 traveler");
  assert.equal(travelersLabel(4), "4 travelers");
  assert.equal(travelersLabel(6), "6+ travelers");
});

test("the waitlist screen is gated, listed in Admin, and sends through the desk", () => {
  const page = read("app/admin/waitlist/page.js");
  assert.match(page, /if \(!isAdminUser\(user\)\) notFound\(\)/);
  assert.match(page, /from\("waitlist"\)/);
  const desk = read("app/admin/waitlist/WaitlistDesk.js");
  assert.match(desk, /fetch\("\/api\/admin\/beta"/);
  assert.match(desk, /action: "invite", email: row\.email, name, note/);
  assert.match(desk, /action: "waitlist_remove"/);
  assert.match(desk, /import FilterBar from "@\/components\/FilterBar"/);
  assert.match(read("app/admin/AdminHub.js"), /href: "\/admin\/waitlist"/);
});

test("the desk route removes waitlist rows only behind its gate, and never resends a retired code", () => {
  const route = read("app/api/admin/beta/route.js");
  const gate = route.indexOf("if (!user) return new NextResponse(null, { status: 404 })");
  const remove = route.indexOf('action === "waitlist_remove"');
  assert.ok(gate > 0 && remove > gate);
  assert.match(route, /from\("waitlist"\)\.delete\(\)\.eq\("id", id\)/);
  assert.match(route, /latest\.expires_at &&\s+new Date\(latest\.expires_at\) <= new Date\(\)\s+\? null/);
});

test("the privacy policy says what the waitlist keeps, and the form links to it", () => {
  const policy = read("lib/privacy.js");
  assert.match(policy, /id: "waitlist",\s*\/\/[^\n]*\n\s*anchor: true,\s*heading: "If you joined the waitlist"/);
  assert.ok(policy.includes("The waitlist: until you ask us to take you off it."));
  assert.ok(policy.includes("never saved with your entry"));
  assert.ok(read("components/LegalProse.js").includes("id={section.anchor ? section.id : undefined}"));
  assert.ok(read("components/home/WaitlistForm.js").includes('href="/privacy#waitlist"'));
});
