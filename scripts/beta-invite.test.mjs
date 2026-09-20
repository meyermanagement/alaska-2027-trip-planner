import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const { betaInviteEmail } = jiti("../lib/email/betaInvite.js");
const input = {
  name: "Sam Whitfield",
  email: "sam@example.com",
  code: "ALY-REVIEW-ONLY",
  siteUrl: "https://example.com",
};

test("invitation uses the approved subject, preview and personal opening", () => {
  const mail = betaInviteEmail(input);
  assert.equal(mail.subject, "You’re invited to try Alyeska");
  assert.match(mail.html, /Bring a trip idea\. We’ll take it from there\./);
  for (const body of [mail.html, mail.text]) {
    assert.match(body, /Hi Sam, I’m Aly\./);
    assert.doesNotMatch(body, /AI travel-planning assistant|Let me in|what you would pay|every screen/);
  }
});

test("original conversational opening precedes one primary action and its code", () => {
  const { html, text } = betaInviteEmail(input);
  for (const body of [html, text]) {
    assert.ok(body.indexOf("Start exploring") < body.indexOf("Your invitation code"));
    assert.ok(body.indexOf("My help doesn’t stop") < body.indexOf("Start exploring"));
    assert.match(body, /You don’t need to have a trip figured out before we talk\./);
    assert.doesNotMatch(body, /Try something real|<ul/);
  }
  assert.equal((html.match(/>Start exploring<\/a>/g) || []).length, 1);
});

test("code is safely encoded in the existing login URL", () => {
  const mail = betaInviteEmail({ ...input, code: 'A&B ?"<C>' });
  const url = `${input.siteUrl}/login?code=${encodeURIComponent('A&B ?"<C>')}`;
  assert.ok(mail.html.includes(`href="${url}"`));
  assert.ok(mail.text.includes(url));
  assert.ok(mail.html.includes("A&amp;B ?&quot;&lt;C&gt;"));
});

test("missing or whitespace-only names get a natural greeting", () => {
  for (const name of [undefined, "", "   "]) {
    const mail = betaInviteEmail({ ...input, name });
    assert.match(mail.text, /^Hi there, I’m Aly\./);
    assert.equal(mail.subject, "You’re invited to try Alyeska");
  }
  assert.match(betaInviteEmail({ ...input, name: "  Sam   Whitfield " }).text, /^Hi Sam,/);
});

test("optional inviter note is preserved and HTML-escaped", () => {
  const note = '<img src=x onerror="alert(1)"> & welcome';
  const mail = betaInviteEmail({ ...input, name: "<Sam>", note });
  assert.match(mail.html, /Hi &lt;Sam&gt;,/);
  assert.ok(mail.html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; welcome"));
  assert.ok(mail.text.includes(`From Mark: ${note}`));
  assert.doesNotMatch(betaInviteEmail(input).html, /A line from Mark/);
});

test("HTML and plain text retain the same essential guidance and both reassurance lines", () => {
  const mail = betaInviteEmail(input);
  for (const body of [mail.html, mail.text]) {
    for (const copy of ["build a day-by-day itinerary around you.",
      "Tell me how it goes", "Beta survey in the menu under More", "Reply to this email.",
      "Beta testing is free.", "18 or older", "parents can include children",
      "works once"]) assert.ok(body.includes(copy), copy);
    assert.equal((body.match(/Wherever you’re headed, I’ve got your back\./g) || []).length, 1);
    assert.equal((body.match(/Wherever you end up, I’ve got your back\./g) || []).length, 1);
  }
  assert.doesNotMatch(mail.text, /Your code is already filled in|Then tell me about a trip/);
  assert.doesNotMatch(mail.html, /Your code is already filled in|Then tell me about a trip/);
});

test("both reassurance lines are bold and the bottom signature is removed", () => {
  const { html, text } = betaInviteEmail(input);
  for (const line of ["Wherever you’re headed, I’ve got your back.", "Wherever you end up, I’ve got your back."]) {
    assert.ok([...html.matchAll(/<strong\b[^>]*>([^<]*)<\/strong>/g)].some((match) => match[1] === line));
  }
  assert.ok(html.indexOf("Wherever you end up") > html.indexOf("My help doesn’t stop"));
  assert.ok(html.indexOf("Wherever you end up") < html.indexOf("You’re one of the first families"));
  assert.doesNotMatch(html, />Aly<br\s*\/?>Alyeska</);
  assert.doesNotMatch(text, /\nAly\nAlyeska\n/);
});

test("email keeps branded PNG references and a compact responsive survey image", () => {
  const { html } = betaInviteEmail(input);
  for (const asset of ["alyeska-mark.png", "report-flag.png", "beta-survey-menu.png"]) {
    assert.ok(html.includes(`${input.siteUrl}/${asset}`));
  }
  assert.match(html, /max-width:300px; height:auto/);
  assert.doesNotMatch(html, /<script|<svg|<form/);
});

test("secondary demo link opens the public home page without an invitation code", () => {
  const { html, text } = betaInviteEmail(input);
  assert.match(html, /Want to see me in action first\?<br><a href="https:\/\/example\.com"[^>]*font-size:18px; font-weight:700;[^>]*>See how it works\.<\/a>/);
  assert.ok(text.includes(`Want to see me in action first? See how it works: ${input.siteUrl}`));
  assert.ok(html.indexOf("See how it works.") > html.indexOf("Wherever you end up"));
  assert.ok(html.indexOf("See how it works.") < html.indexOf("Start exploring"));
  assert.equal((html.match(/>Start exploring<\/a>/g) || []).length, 1);
});

test("invitation code leads straight into feedback, including when an optional note exists", () => {
  for (const note of [undefined, "A personal welcome"]) {
    const { html, text } = betaInviteEmail({ ...input, note });
    const afterCode = html.slice(html.indexOf(`>${input.code}</div>`) + `>${input.code}</div>`.length);
    assert.match(afterCode, /^\s*<\/td><\/tr><\/table>\s*<h2[^>]*>Tell me how it goes<\/h2>/);
    assert.ok(text.includes(`Your invitation code: ${input.code}\n\nTell me how it goes`));
    if (note) {
      assert.ok(html.indexOf("A line from Mark") < html.indexOf("Start exploring"));
      assert.ok(text.indexOf("From Mark:") < text.indexOf("Start exploring"));
    }
  }
});
