import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import { isMinorTraveler } from "@/lib/beta/accountAge";
import { CHILD_VIEW_COOKIE, CHILD_LOCK_SECONDS } from "./constants";

export const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export const challengeCookie = "alyeska-parent-challenge";
export const cookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/",
};
export function hashToken(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function randomToken() { return randomBytes(32).toString("base64url"); }
export function requestOrigin(request) {
  const url = new URL(request.url);
  // Never trust a caller-selected Origin or forwarded host as the RP identity.
  const configured = process.env.NEXT_PUBLIC_SITE_URL || "https://www.alyeska.app";
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
  const allowed = new Set([new URL(configured).origin, "https://alyeska.app", "https://www.alyeska.app"]);
  const origin = request.headers.get("origin");
  if (local ? origin !== url.origin : !allowed.has(origin)) throw new Error("Please reopen this page and try again.");
  const hostname = new URL(origin).hostname;
  return { origin, rpID: ["alyeska.app", "www.alyeska.app"].includes(hostname) ? "alyeska.app" : hostname };
}
export function adminClient() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Parent-managed trip views are not available right now.");
  return admin;
}
export async function parentContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Please sign in to your adult account.");
  const { data: allowed, error: accessError } = await supabase.rpc("account_session_allowed");
  if (accessError || !allowed) throw new Error("Please sign in again.");
  const access = await resolveAccess(supabase, user);
  if (!access || access.can.isSecondary) throw new Error("A parent or guardian with primary access must open this view.");
  const { data: own, error: ownError } = await supabase.from("travelers")
    .select("date_of_birth").eq("id", access.travelerId).maybeSingle();
  if (ownError || !own?.date_of_birth || isMinorTraveler(own) || new Date(own.date_of_birth) > new Date()) {
    throw new Error("Add your adult birthday to your Family profile first.");
  }
  const { data: claimData } = await supabase.auth.getClaims();
  const sessionId = claimData?.claims?.session_id;
  if (!sessionId) throw new Error("Please sign in again.");
  return { supabase, user, access, sessionId, claims: claimData.claims, admin: adminClient() };
}
export async function readView() {
  const jar = await cookies();
  const token = jar.get(CHILD_VIEW_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const admin = adminClient();
  const hash = hashToken(token);
  const { data, error } = await admin.from("parent_trip_views").select("*")
    .eq("token_hash", hash).gt("created_at", new Date(Date.now() - CHILD_LOCK_SECONDS * 1000).toISOString()).maybeSingle();
  if (error) throw new Error("Trip access could not be checked. Please try again.");
  return data ? { admin, view: data, hash } : null;
}
export async function issueChallenge(admin, parentId, purpose, challenge, binding) {
  const id = randomToken();
  const { count, error: countError } = await admin.from("parent_view_challenges").select("id", { count: "exact", head: true })
    .eq("guardian_user_id", parentId).gt("created_at", new Date(Date.now() - 300000).toISOString());
  if (countError || count >= 20) throw new Error("Too many attempts. Please wait five minutes.");
  const { error } = await admin.from("parent_view_challenges").insert({
    id: hashToken(id), guardian_user_id: parentId, purpose, challenge, binding,
  });
  if (error) throw new Error("The parent verification could not start.");
  (await cookies()).set(challengeCookie, id, { ...cookieOptions, maxAge: 300 });
}
export async function consumeChallenge(admin, parentId, purpose, binding) {
  const jar = await cookies();
  const id = jar.get(challengeCookie)?.value;
  if (!id) throw new Error("Verification expired. Please try again.");
  jar.delete(challengeCookie);
  // DELETE RETURNING makes every challenge single-use, including failed attempts.
  const { data, error } = await admin.from("parent_view_challenges").delete()
    .eq("id", hashToken(id)).eq("guardian_user_id", parentId).eq("purpose", purpose).eq("binding", binding)
    .gt("expires_at", new Date().toISOString()).select("challenge").maybeSingle();
  if (error || !data) throw new Error("Verification expired. Please try again.");
  return data.challenge;
}
export async function keysFor(admin, parentId) {
  const { data, error } = await admin.from("parent_view_keys").select("*").eq("guardian_user_id", parentId);
  if (error) throw new Error("Parent verification is not available right now.");
  return data || [];
}
export async function verifyParentKey(admin, parentId, body, challenge, relyingParty) {
  const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
  const keys = await keysFor(admin, parentId);
  const key = keys.find(row => row.credential_id === body?.id);
  if (!key) throw new Error("Use the parent’s registered passkey.");
  const result = await verifyAuthenticationResponse({
    response: body, expectedChallenge: challenge, expectedOrigin: relyingParty.origin,
    expectedRPID: relyingParty.rpID, requireUserVerification: true,
    credential: { id: key.credential_id, publicKey: Buffer.from(key.public_key, "base64url"),
      counter: Number(key.counter), transports: key.transports },
  });
  if (!result.verified || !result.authenticationInfo.userVerified) throw new Error("Parent verification was not completed.");
  const { data, error } = await admin.from("parent_view_keys")
    .update({ counter: result.authenticationInfo.newCounter }).eq("credential_id", key.credential_id)
    .eq("counter", key.counter).select("credential_id").maybeSingle();
  if (error || !data) throw new Error("Parent verification changed. Please try again.");
  return key.credential_id;
}
