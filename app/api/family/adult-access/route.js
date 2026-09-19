import { adultAccessEnabled, adultResponse } from "@/lib/adultAccess/server";
import { parentContext, requestOrigin, randomToken, hashToken } from "@/lib/childView/server";
import { adultInviteEmail } from "@/lib/email/adultInvite";
import { sendEmail } from "@/lib/email/send";

export async function POST(request) {
  if (!adultAccessEnabled()) return adultResponse({ error: "Adult invitations are not available yet." }, 404);
  try {
    const { origin } = requestOrigin(request);
    const { supabase, admin } = await parentContext();
    const body = await request.json();
    if (body.confirmed !== true) throw new Error("Confirm the recipient before sending.");
    const token = randomToken(), hash = hashToken(token);
    const { data, error } = await supabase.rpc("create_adult_access_invitation", {
      p_traveler: body.travelerId, p_hash: hash, p_email: body.email,
    });
    if (error) throw new Error(error.message);
    try {
      const outcome = await sendEmail({ to: data.email, ...adultInviteEmail({
        email: data.email, url: `${origin}/auth/adult-access#${token}`,
      }) });
      if (!outcome.ok) throw new Error("Email could not be sent. Please try again.");
    } catch {
      // Never invalidate a newer invitation after a slow mailer failure.
      await admin.from("adult_access_invitations").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hash);
      throw new Error("Email could not be sent. This invitation cannot be used; please try again.");
    }
    return adultResponse({ ok: true, email: data.email });
  } catch (error) { return adultResponse({ error: error.message }, 400); }
}
export async function DELETE(request) {
  if (!adultAccessEnabled()) return adultResponse({ error: "Adult invitations are not available yet." }, 404);
  try {
    requestOrigin(request);
    const { supabase } = await parentContext();
    const { travelerId } = await request.json();
    const { error } = await supabase.rpc("revoke_adult_access_invitation", { p_traveler: travelerId });
    if (error) throw new Error(error.message);
    return adultResponse({ ok: true });
  } catch (error) { return adultResponse({ error: error.message }, 400); }
}
