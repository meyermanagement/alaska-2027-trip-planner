import { inviteEmail } from "./invite";
import { sendEmail } from "./send";
import { isDraftTrip, isPastTrip } from "@/lib/format";

/**
 * Emails one person the nudge that their seat is ready.
 *
 * Shared by the Family tab button and by Aly's `invite_person`, so both say the
 * same thing and both fail the same way. Reads go through the caller's own
 * client, which means RLS is the permission check: a traveler that cannot be
 * seen cannot be invited.
 *
 * The email grants nothing on its own. Access comes from the address sitting on
 * their row, which the sign-in claim matches against — so a send that fails is
 * not an invitation that failed.
 *
 * @returns {Promise<{ok: true, to: string} | {ok: false, error: string, status?: number}>}
 */
export async function sendTravelerInvite({
  supabase,
  travelerId,
  inviterId,
  inviterEmail,
  origin,
}) {
  const { data: traveler } = await supabase
    .from("travelers")
    .select("id, name, email, family_id, user_id")
    .eq("id", travelerId)
    .maybeSingle();

  if (!traveler) {
    return { ok: false, error: "Person not found.", status: 404 };
  }
  if (!traveler.email) {
    return {
      ok: false,
      error: `Add an email address for ${traveler.name} first.`,
      status: 400,
    };
  }
  // Sending to your own already-linked row is the only way to prove the mail
  // path works without putting an unwanted email in someone else's inbox.
  const selfTest =
    (!!traveler.user_id && traveler.user_id === inviterId) ||
    (!!inviterEmail &&
      traveler.email.toLowerCase() === inviterEmail.toLowerCase());
  if (traveler.user_id && !selfTest) {
    return {
      ok: false,
      error: `${traveler.name} has already signed in.`,
      status: 400,
    };
  }

  const [{ data: family }, { data: profile }, { data: trips }] =
    await Promise.all([
      supabase
        .from("families")
        .select("name")
        .eq("id", traveler.family_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name, full_name")
        .eq("id", inviterId)
        .maybeSingle(),
      supabase
        .from("trips")
        .select("name, start_date, end_date, status")
        .order("start_date", { ascending: true }),
    ]);

  // Only what is actually ahead of us — a list led by finished trips would sell
  // the thing short.
  const tripNames = (trips || [])
    .filter((t) => !isPastTrip(t) && !isDraftTrip(t))
    .map((t) => t.name)
    .filter(Boolean);

  const message = inviteEmail({
    name: traveler.name,
    email: traveler.email,
    familyName: family?.name || "family",
    inviterName:
      profile?.display_name || profile?.full_name || inviterEmail || "Someone",
    siteUrl: origin,
    tripNames,
  });

  const sent = await sendEmail({
    to: traveler.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: inviterEmail || undefined,
  });

  if (!sent.ok) return { ok: false, error: sent.error, status: 502 };

  // A test to yourself is not an invitation, so it must not claim to be one on
  // the Family tab afterwards.
  if (!selfTest) {
    await supabase
      .from("travelers")
      .update({ invited_at: new Date().toISOString() })
      .eq("id", traveler.id);
  }

  return { ok: true, to: traveler.email, test: selfTest };
}

/** Where the sign-in link should point, in production and in a preview alike. */
export function siteOrigin(request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}
