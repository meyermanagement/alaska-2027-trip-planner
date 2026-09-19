import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { chatPermissionError } = jiti("../lib/beta/chatPermission.js");
const { aiAllowed, consentOpenPath } = jiti("../lib/beta/consent.js");
const { AGREEMENT_VERSION, PRIVACY_VERSION } = jiti("../lib/beta/agreement.js");
const { isMinorTraveler, validBirthday } = jiti("../lib/beta/accountAge.js");
const { childRequestState, CHILD_NOTICE_VERSION, CHILD_CHAT_AVAILABLE, validateChildRequest } = jiti("../lib/beta/childAccess.js");
const current = { agreement_version: AGREEMENT_VERSION, privacy_version: PRIVACY_VERSION, age_confirmed: true, data_acknowledged: true, ai_processing: true };
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("missing, withdrawn, updated agreement, updated privacy, and AI-off are distinct", () => {
  assert.equal(chatPermissionError(null).consentRequired, true);
  assert.doesNotMatch(chatPermissionError(null).error, /has been updated|Reload/);
  assert.match(chatPermissionError({ ...current, withdrawn_at: "2026-09-19" }).error, /withdrew/);
  assert.match(chatPermissionError({ ...current, agreement_version: "old" }).error, /beta agreement.*updated/);
  assert.match(chatPermissionError({ ...current, privacy_version: "old" }).error, /privacy notice.*updated/);
  assert.equal(chatPermissionError({ ...current, ai_processing: false }).aiOff, true);
  assert.equal(chatPermissionError(current), null);
});
test("a child is never sent to the adult agreement or told to retry", () => {
  for (const row of [null, current, { ...current, withdrawn_at: "yesterday" }]) {
    const result = chatPermissionError(row, { minor: true });
    assert.equal(result.childAccessRequired, true);
    assert.equal(result.retryable, false);
    assert.equal(result.actionHref, undefined);
    assert.match(result.error, /parent or guardian/);
  }
});
test("lookup failures are not mislabeled as missing consent", () => {
  const result = chatPermissionError(null, { unavailable: true });
  assert.equal(result.permissionUnavailable, true);
  assert.equal(result.consentRequired, undefined);
});
test("age decisions handle birthdays and reject invalid dates", () => {
  assert.equal(isMinorTraveler({ date_of_birth: "2014-02-02" }, "2026-09-19"), true);
  assert.equal(isMinorTraveler({ date_of_birth: "2008-09-20" }, "2026-09-19"), true);
  assert.equal(isMinorTraveler({ date_of_birth: "2008-09-19" }, "2026-09-19"), false);
  assert.equal(validBirthday("2014-02-31"), false);
  assert.equal(validBirthday("not-a-date"), false);
  assert.equal(isMinorTraveler({ date_of_birth: "2030-01-01" }, "2026-09-19"), false);
});
test("parent choices require separate AI acknowledgement and never enable chat", () => {
  assert.ok(validateChildRequest({ guardian: true }));
  assert.ok(validateChildRequest({ guardian: "true", collection: true }));
  assert.equal(validateChildRequest({ guardian: true, collection: true }), null);
  assert.ok(validateChildRequest({ guardian: true, collection: true, askAly: true }));
  assert.equal(validateChildRequest({ guardian: true, collection: true, askAly: true, aiDisclosure: true }), null);
  assert.equal(CHILD_CHAT_AVAILABLE, false);
});
test("request lifecycle reports pending, verified hold, revoked, expired, and reissued notice", () => {
  const request = { status: "pending", notice_version: CHILD_NOTICE_VERSION, expires_at: "2026-10-19T00:00:00Z" };
  const now = new Date("2026-09-19").valueOf();
  assert.equal(childRequestState(request, now), "pending");
  assert.equal(childRequestState({ ...request, status: "verified" }, now), "verified");
  assert.equal(childRequestState({ ...request, status: "revoked" }, now), "off");
  assert.equal(childRequestState({ ...request, notice_version: "old" }, now), "outdated");
  assert.equal(childRequestState(request, new Date("2026-11-01").valueOf()), "expired");
});

function client({ minor = false, error = false } = {}) {
  return { from(table) {
    const result = table === "travelers"
      ? { data: minor ? [{ date_of_birth: "2014-02-02" }] : [], error: error ? new Error("offline") : null }
      : { data: current, error: null };
    const query = { select() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve(result); },
      then(ok, fail) { return Promise.resolve(result).then(ok, fail); } };
    return query;
  } };
}
test("model boundary refuses a minor even with an existing adult consent row", async () => {
  assert.equal(await aiAllowed(client({ minor: true }), "child"), false);
  assert.equal(await aiAllowed(client({ error: true }), "unknown"), false);
  assert.equal(await aiAllowed(client(), "adult"), true);
});
test("request refusal occurs before household reads, thread creation, or the model", () => {
  const route = read("app/api/chat/route.js");
  const refusal = route.indexOf("if (permissionError)");
  assert.ok(refusal > 0);
  for (const call of ["loadEverything(supabase", "ensureConversation(", "generate("]) {
    assert.ok(route.indexOf(call) > refusal, call);
  }
  assert.match(route, /strict: true/);
  assert.match(read("components/ChatPanel.js"), /retryable === false \|\| \[401, 403\]/);
});
test("withdrawal and the child's waiting page remain reachable through the beta gate", () => {
  assert.equal(consentOpenPath("/welcome/parent"), true);
  assert.equal(consentOpenPath("/family/child-access"), true);
  assert.equal(consentOpenPath("/api/family/child-access"), true);
  assert.equal(consentOpenPath("/family/child-access-other"), false);
});
test("all live wordmarks measure the same Aly span; emails no longer use fixed pixels", () => {
  for (const path of ["app/HomeLanding.js", "app/login/page.js", "components/NavTabs.js", "components/BootVeil.js"]) {
    assert.match(read(path), /<AlyWordmark/);
    assert.doesNotMatch(read(path), /aly-word-rule/);
  }
  assert.match(read("components/AlyWordmark.js"), /aly-word-prefix">Aly<\/span>eska/);
  assert.match(read("app/globals.css"), /right: 0\.26em/);
  assert.doesNotMatch(read("lib/email/wordmark.js"), /width:38px/);
});
