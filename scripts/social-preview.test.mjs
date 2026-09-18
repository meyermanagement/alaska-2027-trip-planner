import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("home declares one branded public PNG for Open Graph and Twitter", async () => {
  const page = await readFile(new URL("../app/page.js", import.meta.url), "utf8");
  assert.match(page, /openGraph:\s*\{/);
  assert.match(page, /images:\s*\[shareImage\]/);
  assert.match(page, /card: "summary_large_image"/);
  assert.match(page, /images:\s*\[\{ url: shareImage.url, alt: shareImage.alt \}\]/);
  assert.match(page, /alyeska-share-midnight-v1\.png/);
});

test("share image is a real 1200 by 630 PNG, below 1 MB", async () => {
  const image = await readFile(new URL("../public/alyeska-share-midnight-v1.png", import.meta.url));
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.ok(image.length < 1024 * 1024);
});
