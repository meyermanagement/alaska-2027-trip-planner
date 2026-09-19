import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { readView, requestOrigin, keysFor, issueChallenge, consumeChallenge,
  verifyParentKey, privateHeaders, cookieOptions } from "@/lib/childView/server";
import { CHILD_VIEW_COOKIE } from "@/lib/childView/constants";
import { SKIN_COOKIE, SKIN_COOKIE_MAX_AGE, skinOr } from "@/lib/skins";
import { TEXT_COOKIE, TEXT_COOKIE_MAX_AGE, textSizeOr } from "@/lib/textsize";

export const runtime = "nodejs";
export async function POST(request) {
  try {
    const relyingParty = requestOrigin(request);
    const ctx = await readView();
    if (!ctx) return NextResponse.json({ error: "Ask your parent to sign in using their own browser profile." }, { status: 403, headers: privateHeaders });
    const { admin, view, hash } = ctx;
    const body = await request.json();
    const parentId = view.guardian_user_id;
    if (body.action === "options") {
      const keys = await keysFor(admin, parentId);
      if (!keys.length) throw new Error("Parent passkey unavailable.");
      const options = await generateAuthenticationOptions({
        rpID: relyingParty.rpID, userVerification: "required",
        allowCredentials: keys.map(k => ({ id: k.credential_id, transports: k.transports })),
      });
      await issueChallenge(admin, parentId, "return", options.challenge, hash);
      return NextResponse.json({ options }, { headers: privateHeaders });
    }
    if (body.action !== "verify") throw new Error("Unknown action.");
    const challenge = await consumeChallenge(admin, parentId, "return", hash);
    await verifyParentKey(admin, parentId, body.response, challenge, relyingParty);
    const { error } = await admin.from("parent_trip_views").update({ closed_at: new Date().toISOString() }).eq("token_hash", hash);
    if (error) throw new Error("Could not close view.");
    const jar = await cookies();
    jar.delete(CHILD_VIEW_COOKIE);
    jar.delete("alyeska-child-lock");
    jar.set(SKIN_COOKIE, skinOr(view.parent_skin), { ...cookieOptions, httpOnly: false, maxAge: SKIN_COOKIE_MAX_AGE });
    jar.set(TEXT_COOKIE, textSizeOr(view.parent_text_size), { ...cookieOptions, httpOnly: false, maxAge: TEXT_COOKIE_MAX_AGE });
    // No hidden adult session is restored: parent signs in again after verification.
    return NextResponse.json({ next: "/login?next=%2Ffamily" }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Parent verification did not finish. Use the registered parent passkey and try again." },
      { status: 403, headers: privateHeaders });
  }
}
