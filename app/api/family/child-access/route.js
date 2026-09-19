import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions } from "@simplewebauthn/server";
import { parentContext, requestOrigin, keysFor, issueChallenge, consumeChallenge, verifyParentKey,
  randomToken, hashToken, cookieOptions, privateHeaders } from "@/lib/childView/server";
import { CHILD_VIEW_COOKIE, CHILD_VIEW_NOTICE, CHILD_LOCK_SECONDS } from "@/lib/childView/constants";
import { SKIN_COOKIE, skinOr } from "@/lib/skins";
import { TEXT_COOKIE, textSizeOr } from "@/lib/textsize";
import { isMinorTraveler } from "@/lib/beta/accountAge";
import { validateMinorReview } from "@/lib/beta/minorReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function reply(body, status = 200) { return NextResponse.json(body, { status, headers: privateHeaders }); }
export async function GET() {
  try {
    const { supabase, admin, access, user } = await parentContext();
    const [{ data, error }, keys, views, approvals] = await Promise.all([
      supabase.from("travelers").select("id,name,date_of_birth,access_level")
        .eq("family_id", access.familyId).eq("is_person", true).order("sort_order"),
      keysFor(admin, user.id),
      admin.from("parent_trip_views").select("traveler_id").eq("guardian_user_id", user.id)
        .is("closed_at", null).gt("expires_at", new Date().toISOString()),
      admin.rpc("parent_view_approved_children", { parent_id: user.id, notice: CHILD_VIEW_NOTICE }),
    ]);
    if (error || views.error || approvals.error) throw new Error("Child trip views could not be loaded.");
    const approved = new Set((approvals.data || []).map(row => row.traveler_id));
    return reply({ children: (data || []).filter(row => isMinorTraveler(row))
      .map(row => ({ ...row, canOpenDirectly: approved.has(row.id) })),
    passkeyReady: keys.length > 0, views: views.data || [] });
  } catch (error) { return reply({ error: error.message }, 403); }
}
export async function POST(request) {
  try {
    const relyingParty = requestOrigin(request);
    const ctx = await parentContext();
    const body = await request.json();
    const { admin, user, supabase, access, sessionId } = ctx;
    const keys = await keysFor(admin, user.id);
    if (body.action === "register-options") {
      // Adding a replacement key cannot bypass an already registered parent key.
      if (keys.length) throw new Error("A parent passkey is already registered. Use it to open the trip view.");
      const options = await generateRegistrationOptions({
        rpName: "Alyeska parent access", rpID: relyingParty.rpID, userName: user.email,
        userID: new TextEncoder().encode(user.id), attestationType: "none",
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      });
      await issueChallenge(admin, user.id, "register", options.challenge, sessionId);
      return reply({ options });
    }
    if (body.action === "register-verify") {
      if (keys.length) throw new Error("A parent passkey is already registered.");
      const challenge = await consumeChallenge(admin, user.id, "register", sessionId);
      const result = await verifyRegistrationResponse({
        response: body.response, expectedChallenge: challenge, expectedOrigin: relyingParty.origin,
        expectedRPID: relyingParty.rpID, requireUserVerification: true,
      });
      if (!result.verified || !result.registrationInfo.userVerified) throw new Error("Parent verification was not completed.");
      const key = result.registrationInfo.credential;
      const { error } = await admin.rpc("register_initial_parent_key", {
        parent_id: user.id, adult_session: sessionId, key_id: key.id,
        key_public: Buffer.from(key.publicKey).toString("base64url"), key_counter: key.counter,
        key_transports: key.transports || [],
      });
      if (error) throw new Error("The parent passkey could not be saved.");
      return reply({ ok: true });
    }
    const { data: child, error } = await supabase.from("travelers")
      .select("id,name,family_id,date_of_birth,access_level,is_person").eq("id", body.travelerId).maybeSingle();
    if (error || !child || child.family_id !== access.familyId || !child.is_person || !isMinorTraveler(child)
      || child.access_level !== "secondary") throw new Error("Choose a minor with secondary access in your household.");
    if (body.action === "close-views") {
      const { error: closeError } = await admin.from("parent_trip_views").update({ closed_at: new Date().toISOString() })
        .eq("traveler_id", child.id).eq("guardian_user_id", user.id).is("closed_at", null);
      if (closeError) throw new Error("The views could not be closed. Please try again.");
      return reply({ ok: true });
    }
    if (body.action === "revoke-approval") {
      const { error: revokeError } = await admin.rpc("revoke_parent_view_approval", { parent_id: user.id, child_id: child.id });
      if (revokeError) throw new Error("Approval could not be revoked. Please try again.");
      return reply({ ok: true });
    }
    const savedEntry = body.action === "open-saved";
    if (!savedEntry) {
      const problem = validateMinorReview(body);
      if (problem) throw new Error(problem);
    }
    if (!keys.length) throw new Error("Set up your parent passkey first.");
    const binding = `${sessionId}:${child.id}:${CHILD_VIEW_NOTICE}`;
    if (body.action === "open-options") {
      const options = await generateAuthenticationOptions({ rpID: relyingParty.rpID,
        userVerification: "required", allowCredentials: keys.map(k => ({ id: k.credential_id, transports: k.transports })) });
      await issueChallenge(admin, user.id, "open", options.challenge, binding);
      return reply({ options });
    }
    let verifiedKey = null;
    if (!savedEntry) {
      if (body.action !== "open-verify") return reply({ error: "Unknown action." }, 400);
      const challenge = await consumeChallenge(admin, user.id, "open", binding);
      verifiedKey = await verifyParentKey(admin, user.id, body.response, challenge, relyingParty);
    }
    const token = randomToken();
    const { data: theme, error: openError } = await admin.rpc("open_guarded_parent_trip_view", {
      parent_id: user.id, child_id: child.id, old_session_id: sessionId, view_hash: hashToken(token), notice: CHILD_VIEW_NOTICE,
      freshly_verified: !savedEntry, verified_key: verifiedKey,
    });
    if (savedEntry && openError?.message === "Parent setup required.") {
      return reply({ error: "Please review the child-view setup again.", setupRequired: true }, 409);
    }
    if (openError) throw new Error("The trip view could not open. Check your current beta agreement and try again.");
    const jar = await cookies();
    for (const cookie of jar.getAll()) {
      if ((cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))
        || cookie.name === "alyeska_level" || cookie.name.startsWith("alyeska-consent")) jar.delete(cookie.name);
    }
    jar.set(CHILD_VIEW_COOKIE, token, { ...cookieOptions, maxAge: CHILD_LOCK_SECONDS });
    // Display hint only. Access is decided by the HttpOnly token + server record.
    jar.set("alyeska-child-lock", "1", { ...cookieOptions, httpOnly: false, maxAge: CHILD_LOCK_SECONDS });
    jar.set(SKIN_COOKIE, skinOr(theme?.skin), { ...cookieOptions, httpOnly: false, maxAge: CHILD_LOCK_SECONDS });
    jar.set(TEXT_COOKIE, textSizeOr(theme?.text_size), { ...cookieOptions, httpOnly: false, maxAge: CHILD_LOCK_SECONDS });
    return reply({ ok: true, next: "/child" });
  } catch (error) {
    // Do not echo credential payloads, tokens, or library diagnostic details.
    const safe = error.name === "Error" && !/webauthn|base64|CBOR|signature|RPID|challenge/i.test(error.message)
      ? error.message : "Parent verification did not finish. Please try again.";
    return reply({ error: safe }, 400);
  }
}
