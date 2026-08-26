import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendTravelerInvite, siteOrigin } from "@/lib/email/sendInvite";

export const maxDuration = 30;

/** The People tab's "Send sign-in email" button. */
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body?.traveler_id) {
    return NextResponse.json({ error: "No person given." }, { status: 400 });
  }

  const outcome = await sendTravelerInvite({
    supabase,
    travelerId: body.traveler_id,
    inviterId: user.id,
    inviterEmail: user.email,
    origin: siteOrigin(request),
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error },
      { status: outcome.status || 502 },
    );
  }
  return NextResponse.json({ ok: true, to: outcome.to });
}
