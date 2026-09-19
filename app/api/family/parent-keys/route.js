import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { parentContext, requestOrigin, keysFor, issueChallenge, consumeChallenge, verifyParentKey,
  randomToken, hashToken, cookieOptions, privateHeaders } from "@/lib/childView/server";
import { hasFreshParentSignIn, normalizeRecoveryCode, validRecoveryCode, parentKeyLabel } from "@/lib/childView/keyPolicy";
import { deliverParentKeyAlerts } from "@/lib/childView/keyAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const grantCookie = "alyeska-parent-key-grant";
const kinds = ["add", "remove", "recovery-code"];
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
const recoveryCode = () => randomBytes(24).toString("hex").toUpperCase().match(/.{6}/g).join("-");
async function status(ctx) {
  const [keys, state] = await Promise.all([
    keysFor(ctx.admin, ctx.user.id),
    ctx.admin.from("parent_key_security").select("recovery_created_at").eq("guardian_user_id", ctx.user.id).maybeSingle(),
  ]);
  if (state.error) throw new Error("Parent access settings could not be loaded.");
  return { keys: keys.map(k => ({ id: k.credential_id, label: k.label, createdAt: k.created_at })),
    recoveryReady: Boolean(state.data?.recovery_created_at), freshSignIn: hasFreshParentSignIn(ctx.claims) };
}
export async function GET() {
  try { return reply(await status(await parentContext())); }
  catch { return reply({ error: "Parent access settings could not be loaded. Please sign in again." }, 403); }
}
async function registration(ctx, rp, grant, keys) {
  const options = await generateRegistrationOptions({
    rpName: "Alyeska parent access", rpID: rp.rpID, userName: ctx.user.email,
    userID: new TextEncoder().encode(ctx.user.id), attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    excludeCredentials: keys.map(k => ({ id: k.credential_id, transports: k.transports })),
  });
  await issueChallenge(ctx.admin, ctx.user.id, "key-register", options.challenge, `${ctx.sessionId}:${hashToken(grant)}`);
  (await cookies()).set(grantCookie, grant, { ...cookieOptions, maxAge: 300 });
  return reply({ options });
}
async function finish(ctx, grant, key = null, label = null, newCode = null) {
  const { error } = await ctx.admin.rpc("finish_parent_key_change", {
    parent_id: ctx.user.id, adult_session: ctx.sessionId, grant_hash: hashToken(grant),
    key_id: key?.id || null, key_public: key ? Buffer.from(key.publicKey).toString("base64url") : null,
    key_counter: key?.counter || 0, key_transports: key?.transports || [],
    key_label: parentKeyLabel(label), next_recovery_hash: newCode ? hashToken(normalizeRecoveryCode(newCode)) : null,
  });
  if (error) throw new Error("The change could not be saved. Refresh this page and verify again.");
  // The transaction queues the notification. Failure cannot roll back security;
  // the existing daily maintenance run retries pending alerts.
  const alerts = await deliverParentKeyAlerts(ctx.admin, ctx.user.id).catch(() => ({ sent: 0, pending: true }));
  let updated;
  try { updated = await status(ctx); } catch { updated = { refreshNeeded: true }; }
  // A follow-up read failure must not hide a freshly rotated one-time code.
  return reply({ ok: true, recoveryCode: newCode, notificationPending: alerts.pending, ...updated });
}
export async function POST(request) {
  try {
    const rp = requestOrigin(request);
    const ctx = await parentContext();
    const body = await request.json();
    const { admin, user, sessionId } = ctx;
    const keys = await keysFor(admin, user.id);
    if (body.action === "auth-options") {
      if (!kinds.includes(body.kind)) throw new Error("Choose a parent-access action.");
      const eligible = keys.filter(k => body.kind !== "remove" || k.credential_id !== body.target);
      if (!eligible.length) throw new Error("Keep at least one parent passkey. Add a backup first.");
      if (body.kind === "add" && keys.length >= 5) throw new Error("Keep up to five parent passkeys.");
      const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required",
        allowCredentials: eligible.map(k => ({ id: k.credential_id, transports: k.transports })) });
      await issueChallenge(admin, user.id, "key-auth", options.challenge,
        JSON.stringify([sessionId, body.kind, body.kind === "remove" ? body.target : null]));
      return reply({ options });
    }
    if (body.action === "auth-verify" || body.action === "recover") {
      const recovering = body.action === "recover";
      if (recovering && !hasFreshParentSignIn(ctx.claims))
        return reply({ error: "Sign in again, then return here within five minutes.", needsSignIn: true }, 403);
      const kind = recovering ? "recover" : body.kind;
      if (!recovering && !kinds.includes(kind)) throw new Error("Choose a parent-access action.");
      let proof = null;
      if (!recovering) {
        const challenge = await consumeChallenge(admin, user.id, "key-auth",
          JSON.stringify([sessionId, kind, kind === "remove" ? body.target : null]));
        proof = await verifyParentKey(admin, user.id, body.response, challenge, rp);
      }
      const grant = randomToken();
      const { data, error } = await admin.rpc("authorize_parent_key_change", {
        parent_id: user.id, adult_session: sessionId, change_kind: kind, verified_key: proof,
        target_key_id: kind === "remove" ? body.target : null,
        code_hash: recovering && validRecoveryCode(body.code) ? hashToken(normalizeRecoveryCode(body.code)) : null,
        grant_hash: hashToken(grant),
      });
      if (error) throw new Error("Parent verification could not be saved. Refresh and try again.");
      if (!data) return reply({ error: "Recovery could not be verified. Check your saved code. After repeated attempts, wait 15 minutes." }, 403);
      if (kind === "add" || kind === "recover") return await registration(ctx, rp, grant, keys);
      return await finish(ctx, grant, null, null, kind === "recovery-code" ? recoveryCode() : null);
    }
    if (body.action === "register-verify") {
      const jar = await cookies();
      const grant = jar.get(grantCookie)?.value;
      if (!grant) throw new Error("Verification expired. Start again.");
      jar.delete(grantCookie);
      const { data: g, error } = await admin.from("parent_key_grants").select("kind")
        .eq("token_hash", hashToken(grant)).eq("guardian_user_id", user.id).eq("session_id", sessionId)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (error || !g || !["add", "recover"].includes(g.kind)) throw new Error("Verification expired. Start again.");
      if (g.kind === "recover" && !hasFreshParentSignIn(ctx.claims))
        return reply({ error: "Sign in again, then restart recovery.", needsSignIn: true }, 403);
      const challenge = await consumeChallenge(admin, user.id, "key-register", `${sessionId}:${hashToken(grant)}`);
      const result = await verifyRegistrationResponse({
        response: body.response, expectedChallenge: challenge, expectedOrigin: rp.origin,
        expectedRPID: rp.rpID, requireUserVerification: true,
      });
      if (!result.verified || !result.registrationInfo?.userVerified) throw new Error("Parent verification did not finish.");
      return await finish(ctx, grant, result.registrationInfo.credential, body.label, g.kind === "recover" ? recoveryCode() : null);
    }
    return reply({ error: "Unknown action." }, 400);
  } catch (error) {
    const allowed = /^(Choose a parent-access action\.|Keep at least one parent passkey\. Add a backup first\.|Keep up to five parent passkeys\.|Parent verification could not be saved\. Refresh and try again\.|Verification expired\. Start again\.|The change could not be saved\. Refresh this page and verify again\.|Too many attempts\. Please wait five minutes\.|Please sign in.*|A parent or guardian.*)$/;
    const safe = allowed.test(error.message) ? error.message : "Parent verification did not finish. Please try again.";
    return reply({ error: safe }, 400);
  }
}
