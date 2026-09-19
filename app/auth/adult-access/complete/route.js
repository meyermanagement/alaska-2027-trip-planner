import { adultResponse, recipientRequest } from "@/lib/adultAccess/server";
import { cleanAdultConsent, adultEmailMatches } from "@/lib/adultAccess/validation";
import { AGREEMENT_VERSION, PRIVACY_VERSION, APP_BUILD, OPTIONAL_FEATURES } from "@/lib/beta/agreement";

export async function POST(request) {
  try {
    const { body, admin, hash, invite } = await recipientRequest(request);
    if (!adultEmailMatches(body.email, invite.email)) throw new Error("Enter the email address this invitation was sent to.");
    const consent = cleanAdultConsent(body, {
      agreementVersion: AGREEMENT_VERSION, privacyVersion: PRIVACY_VERSION, appBuild: APP_BUILD,
      featureIds: OPTIONAL_FEATURES.map(f => f.id),
    });
    let userId = invite.user_id;
    let provisionedBan = null;
    if (!userId) {
      if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128)
        throw new Error("Choose a password between 12 and 128 characters.");
      // The mailbox capability and explicit POST confirm the email, not the
      // parent. Start banned; only the atomic consent transaction can lift it.
      const { data, error } = await admin.auth.admin.createUser({
        email: invite.email, password: body.password, email_confirm: true,
        ban_duration: "876000h",
      });
      if (error || !data?.user) throw new Error("The account could not be prepared. If it already exists, ask support to review it.");
      userId = data.user.id;
      provisionedBan = data.user.banned_until;
      if (!provisionedBan) throw new Error("The account hold could not be verified. Please contact support.");
    }
    const { error } = await admin.rpc("accept_adult_access_invitation", {
      p_hash: hash, p_user: userId, p_consent: consent, p_provisioned_ban: provisionedBan,
    });
    if (error) throw new Error("Access was not activated. Please contact support before trying again.");
    return adultResponse({ ok: true });
  } catch (error) { return adultResponse({ error: error.message }, 400); }
}
