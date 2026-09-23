#!/usr/bin/env node
// Where did the cached prefix stop matching?
//
// Reads [aly.prefix] lines -- pasted, or straight from
// `vercel logs --json --query aly.prefix` -- and, for each call, says where its
// request first differs from the call before it with the same feature. Nothing
// here reads prompt text: the log holds hashes and offsets only, so the answer
// is an offset to look up in a local rebuild of the prompt.
//
//   vercel logs --json --query aly.prefix --since 1h | node scripts/prefix-diff.mjs
//   node scripts/prefix-diff.mjs saved-lines.txt
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { parsePrefixLines, firstDifference } = await jiti.import("../lib/agent/fingerprint.js");

const text = process.argv[2] ? readFileSync(process.argv[2], "utf8") : readFileSync(0, "utf8");
const prints = parsePrefixLines(text);
const lastBy = new Map();
for (const p of prints) {
  const key = p.f || "unnamed";
  const before = lastBy.get(key);
  const d = before ? firstDifference(before, p) : { where: "first" };
  const sys = String(p.sys || "").split(":")[1];
  console.log(
    [
      key,
      p.m,
      `attempt ${p.a ?? "?"}`,
      `system ${sys} chars, record at ${p.at ?? "?"}`,
      `${(p.c || []).length} turns`,
      d.where === "system"
        ? `differs in system block ${d.block} at offset ${d.offset} (${d.side})`
        : d.where === "contents"
          ? `differs at turn ${d.turn}`
          : d.where === "none"
            ? "identical to the call before"
            : `differs: ${d.where}`,
    ].join(" | "),
  );
  lastBy.set(key, p);
}
if (!prints.length) console.log("No [aly.prefix] lines found.");
