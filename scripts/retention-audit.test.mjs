import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const { runRetentionPurges, PARENT_VIEW_SECURITY, COMPLETED_HISTORY } = await import(url(
  read("lib/retention/purge.js").replace('"./history.js"', JSON.stringify(url(read("lib/retention/history.js")))),
));

function client({ audit = [null], purgeError = null } = {}) {
  const writes = [], purges = [];
  return { writes, purges,
    rpc: async name => {
      purges.push(name);
      return { data: { expired: 3 }, error: purgeError };
    },
    from: table => {
      assert.equal(table, "retention_runs");
      return { insert: async row => {
        writes.push(row);
        const failure = audit.shift();
        if (failure instanceof Error) throw failure;
        return { error: failure || null };
      } };
    },
  };
}

test("confirmed audit writes report success and do not add response-only fields to the stored row", async () => {
  const supabase = client();
  const result = await runRetentionPurges({ supabase, jobs: [PARENT_VIEW_SECURITY] });
  assert.equal(result.ok, true);
  assert.equal(result.jobs[0].purged, 3);
  assert.equal(result.jobs[0].auditRecorded, true);
  assert.equal(result.jobs[0].auditError, null);
  assert.ok(!("auditRecorded" in supabase.writes[0]));
});

for (const failure of [{ message: "PRIVATE DATABASE DETAIL" }, new Error("PRIVATE DATABASE DETAIL")]) {
  test(`audit ${failure instanceof Error ? "exception" : "returned error"} fails the pass without losing counts or stopping later jobs`, async t => {
    const logs = [];
    t.mock.method(console, "error", (...args) => logs.push(args));
    const supabase = client({ audit: [failure, null] });
    const result = await runRetentionPurges({ supabase, jobs: [PARENT_VIEW_SECURITY, PARENT_VIEW_SECURITY] });
    assert.equal(result.ok, false);
    assert.equal(result.jobs[0].purged, 3);
    assert.equal(result.jobs[0].scanned, 3);
    assert.equal(result.jobs[0].auditRecorded, false);
    assert.match(result.jobs[0].error, /audit record could not be saved/);
    assert.equal(result.jobs[1].auditRecorded, true);
    assert.equal(supabase.purges.length, 2);
    assert.equal(supabase.writes.length, 2);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], "retention_audit_write_failed");
    assert.doesNotMatch(JSON.stringify({ result, logs }), /PRIVATE DATABASE DETAIL/);
  });
}

test("purge failure and audit failure are both retained", async t => {
  t.mock.method(console, "error", () => {});
  const result = await runRetentionPurges({
    supabase: client({ audit: [{ message: "offline" }], purgeError: { message: "Purge failed" } }),
    jobs: [PARENT_VIEW_SECURITY],
  });
  assert.equal(result.ok, false);
  assert.match(result.jobs[0].error, /Purge failed.*audit record could not be saved/);
  assert.equal(result.jobs[0].purged, 0);
  assert.equal(result.jobs[0].auditRecorded, false);
});

test("an absent audit response is not counted as a confirmed write", async t => {
  t.mock.method(console, "error", () => {});
  const supabase = client();
  supabase.from = () => ({ insert: async () => undefined });
  const result = await runRetentionPurges({ supabase, jobs: [PARENT_VIEW_SECURITY] });
  assert.equal(result.ok, false);
  assert.equal(result.jobs[0].auditRecorded, false);
});

test("audit fix does not enable completed-history deletion", async () => {
  const original = process.env.NEXT_PUBLIC_HISTORY_RETENTION_ENABLED;
  delete process.env.NEXT_PUBLIC_HISTORY_RETENTION_ENABLED;
  try {
    const supabase = client();
    const result = await runRetentionPurges({ supabase, jobs: [COMPLETED_HISTORY] });
    assert.equal(result.ok, true);
    assert.equal(result.jobs[0].detail.disabled, true);
    assert.equal(result.jobs[0].purged, 0);
    assert.equal(supabase.purges.length, 0);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_HISTORY_RETENTION_ENABLED;
    else process.env.NEXT_PUBLIC_HISTORY_RETENTION_ENABLED = original;
  }
});

test("manual and scheduled maintenance return HTTP failure for audit failures", async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-only";
  try {
    for (const retentionOk of [false, true]) {
      for (const path of ["maintain", "remind"]) {
        const calls = [];
        globalThis.__retentionRouteTest = {
          NextResponse: { json: (data, options = {}) => ({ data, status: options.status || 200 }) },
          createAdminClient: () => ({}),
          runRetentionPurges: async () => {
            calls.push("retention");
            return { ok: retentionOk, jobs: [{ auditRecorded: retentionOk }] };
          },
          retryOpenDeletions: async () => ({ ok: true }),
          sendDueTodayReminders: async () => {
            calls.push("reminders");
            return { ok: true, sent: [{ to: "test@example.invalid" }], failed: [] };
          },
          siteOrigin: () => "https://example.invalid",
          homeToday: () => "2026-09-19",
          runRecordsFor: () => [],
          deliverParentKeyAlerts: async () => ({ sent: 0 }),
          JOBS: [PARENT_VIEW_SECURITY],
        };
        const code = read(`app/api/tasks/${path}/route.js`).replace(/^import .*;\n/gm, "");
        const { GET } = await import(url(`
          const {NextResponse,createAdminClient,runRetentionPurges,retryOpenDeletions,
            sendDueTodayReminders,siteOrigin,homeToday,runRecordsFor,deliverParentKeyAlerts,JOBS}
            = globalThis.__retentionRouteTest;
          ${code}
          // ${path}-${retentionOk}
        `));
        const response = await GET({
          url: "https://example.invalid/api/tasks/maintain",
          headers: { get: () => "Bearer test-only" },
        });
        assert.equal(response.status, retentionOk ? 200 : 500);
        assert.equal(response.data.ok, retentionOk);
        if (path === "remind") {
          assert.equal(response.data.remindersOk, true);
          assert.equal(response.data.sent.length, 1);
          assert.deepEqual(calls, ["reminders", "retention"]);
        }
      }
    }
  } finally {
    delete globalThis.__retentionRouteTest;
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});
