import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const { emailDetailHtml } = jiti("../lib/email/detail.js");
const { reminderEmail } = jiti("../lib/email/reminder.js");
const longUrl = `https://www.example.com/reservations/check-in?booking=123&tracking=${"a".repeat(2200)}#documents`;

test("bare references show a short host while preserving the complete destination", () => {
  const html = emailDetailHtml(`Check in here: ${longUrl}`);
  assert.ok(html.includes(`href="${longUrl.replace(/&/g, "&amp;")}"`));
  assert.match(html, />example\.com<\/a>/);
  assert.equal(html.replace(/<[^>]*>/g, ""), "Check in here: example.com");
});

test("Markdown references retain useful labels, including long destinations", () => {
  const html = emailDetailHtml(`Read [Check-in instructions](${longUrl}).`);
  assert.match(html, />Check-in instructions<\/a>\./);
  assert.ok(html.includes(`href="${longUrl.replace(/&/g, "&amp;")}"`));
  assert.doesNotMatch(html, /\[Check-in/);
  assert.match(emailDetailHtml(`[${longUrl}](${longUrl})`), />example\.com<\/a>/);
});

test("sentence punctuation stays outside references; balanced URL parentheses survive", () => {
  const html = emailDetailHtml("See (https://example.com/guide_(summer)), then https://example.org/info.");
  assert.match(html, /href="https:\/\/example.com\/guide_\(summer\)"/);
  assert.match(html, /<\/a>\), then/);
  assert.match(html, /href="https:\/\/example.org\/info"/);
  assert.match(html, /<\/a>\.$/);
  assert.match(emailDetailHtml("[Guide](https://example.com/guide_(summer))"), />Guide<\/a>$/);
});

test("angle references, multiple links, uppercase protocols and newlines are supported", () => {
  const html = emailDetailHtml("<https://example.com/a>\nHTTPS://example.org/b");
  assert.equal((html.match(/<a /g) || []).length, 2);
  assert.match(html, /<\/a><br><a /);
});

test("untrusted text stays escaped and non-web schemes cannot become links", () => {
  const html = emailDetailHtml('<img src=x onerror=alert(1)>\n[Bad](javascript:alert(1)) [Bad](data:text/html,hello)');
  assert.doesNotMatch(html, /<img|<a /);
  assert.match(html, /&lt;img/);
  const label = emailDetailHtml('[<img src=x>](https://example.com/?a=1&b=%22)');
  assert.match(label, /&lt;img src=x&gt;<\/a>/);
  assert.match(label, /a=1&amp;b=%22/);
  assert.doesNotMatch(emailDetailHtml("https://name:secret@example.com/x"), /<a /);
});

test("ordinary descriptions retain words and compact link labels are bounded", () => {
  assert.equal(emailDetailHtml("Bring ID & tickets.\nArrive early."), "Bring ID &amp; tickets.<br>Arrive early.");
  assert.match(emailDetailHtml(`[${"Title ".repeat(60)}](https://example.com)`), />.{61}…<\/a>/);
  assert.equal(emailDetailHtml(null), "");
});

test("actual daily template uses compact HTML references and keeps the text fallback functional", () => {
  const { html, text, subject } = reminderEmail({
    name: "Sam", email: "sam@example.test", siteUrl: "https://app.example.test",
    items: [{
      title: "Complete check-in", detail: `Bring ID. [Check-in guide](${longUrl})\nReference: https://example.org/rules.`,
      tripName: "Sample trip", tripRef: "sample-trip", exact: true,
    }],
  });
  assert.match(subject, /1 thing to do today/);
  assert.match(html, />Check-in guide<\/a>/);
  assert.match(html, />example\.org<\/a>\./);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ""), /tracking=|https:\/\/example\.org\/rules/);
  assert.ok(text.includes(longUrl)); // Plain text cannot hide a URL behind a label.
  assert.ok(text.includes("https://app.example.test/trips/sample-trip?tab=tasks"));
});
