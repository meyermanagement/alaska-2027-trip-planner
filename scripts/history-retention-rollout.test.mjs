import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import config from "../next.config.mjs";

test("approved rollout enables the shared client/server history setting", () => {
  assert.equal(config.env.NEXT_PUBLIC_HISTORY_RETENTION_ENABLED, "true");
});

test("automatic history cleanup uses existing guarded daily maintenance", () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const deployment = JSON.parse(read("vercel.json"));
  assert.equal(deployment.crons.find(job => job.path === "/api/tasks/remind").schedule, "0 12 * * *");
  const morning = read("app/api/tasks/remind/route.js");
  assert.ok(morning.indexOf('request.headers.get("authorization")') < morning.indexOf("await runRetentionPurges("));
  assert.match(read("lib/retention/purge.js"), /\[COMPLETED_HISTORY\]: purgeCompletedHistory/);
  assert.match(read("lib/retention/history.js"), /if \(!dryRun && !historyRetentionEnabled\(\)\)/);
});
