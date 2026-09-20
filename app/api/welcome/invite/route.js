import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import { welcomeAge } from "@/lib/welcome/access";
import { sendTravelerInvite, siteOrigin } from "@/lib/email/sendInvite";
import { requestOrigin } from "@/lib/childView/server";

export const maxDuration = 30;

// Explicit invitation review only. First-run profile saving never calls this.
export async function POST(request) {
  try { requestOrigin(request); }
  catch { return NextResponse.json({ error: "Please reopen this page and try again." }, { status: 403 }); }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data: sessionAllowed, error: sessionError } = await supabase.rpc("account_session_allowed");
  if (sessionError || sessionAllowed !== true) return NextResponse.json({ error: "Please sign in again." }, { status: 403 });
  const access = await resolveAccess(supabase, user);
  if (!access?.can?.invitePeople || !access?.can?.setAccessLevels) {
    return NextResponse.json({ error: "Only a primary traveler can invite people." }, { status: 403 });
  }
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "That request could not be read." }, { status: 400 }); }
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (body?.confirmed !== true || typeof body?.travelerId !== "string" ||
      !["primary", "secondary"].includes(body?.accessLevel) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Review their own email and confirm the invitation." }, { status: 400 });
  }
  if (email === user.email?.toLowerCase()) {
    return NextResponse.json({ error: "Use their own email, not your sign-in address." }, { status: 400 });
  }
  const { data: person, error } = await supabase.from("travelers")
    .select("id, name, date_of_birth, access_level, user_id")
    .eq("id", body.travelerId).eq("family_id", access.familyId).eq("is_person", true).maybeSingle();
  if (error || !person) return NextResponse.json({ error: "This traveler could not be checked. Refresh and try again." }, { status: 404 });
  if (person.user_id || welcomeAge(person.date_of_birth) !== "adult") {
    return NextResponse.json({ error: "Only an adult without a linked login can be invited here. Manage their access in Family." }, { status: 403 });
  }
  if (person.access_level !== body.accessLevel) {
    return NextResponse.json({ error: "Their access changed since you reviewed it. Open their profile in Family before inviting them." }, { status: 409 });
  }
  // Bind the write to the reviewed age, role, family and still-unclaimed row.
  const { data: saved, error: saveError } = await supabase.from("travelers")
    .update({ email }).eq("id", person.id).eq("family_id", access.familyId)
    .eq("date_of_birth", person.date_of_birth).eq("access_level", person.access_level)
    .is("user_id", null).select("id").maybeSingle();
  if (saveError || !saved) return NextResponse.json({ error: "Their email could not be saved. Refresh their profile before retrying." }, { status: 409 });
  const outcome = await sendTravelerInvite({
    supabase, travelerId: person.id, inviterId: user.id, inviterEmail: user.email, origin: siteOrigin(request),
  });
  if (!outcome.ok) return NextResponse.json({
    error: `Their email is saved, but delivery did not complete. ${outcome.error || "Try sending again from Family."}`,
  }, { status: outcome.status || 502 });
  return NextResponse.json({ ok: true, to: outcome.to });
}
