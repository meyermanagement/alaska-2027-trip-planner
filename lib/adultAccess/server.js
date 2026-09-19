import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient, hashToken, requestOrigin, privateHeaders } from "@/lib/childView/server";
import { validAdultToken } from "./validation";

export const adultAccessEnabled = () => process.env.ADULT_ACCESS_INVITES_ENABLED === "true";
export const adultResponse = (body, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
export async function recipientRequest(request) {
  if (!adultAccessEnabled()) throw new Error("Adult invitations are not available yet.");
  requestOrigin(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) throw new Error("Open this invitation in a signed-out browser. Only the invited adult may accept it.");
  const body = await request.json();
  if (!validAdultToken(body.token)) throw new Error("Open the complete invitation from your email.");
  const admin = adminClient();
  const hash = hashToken(body.token);
  const { data: invite, error } = await admin.rpc("check_adult_access_invitation", { p_hash: hash });
  if (error || !invite) throw new Error(error?.message || "This invitation is unavailable.");
  return { body, admin, hash, invite };
}
