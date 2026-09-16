import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * The Family tab's "Remove from household" button.
 *
 * Everything that decides whether this is allowed lives in
 * remove_household_member: primary travelers only, never yourself, and the
 * membership row, the seat, the person's push devices and the receipt all move
 * together or not at all. The route's job is to say who is asking and to turn a
 * refusal into a sentence, because row-level security filters rather than
 * raising and a silently empty answer is how a person concludes the button is
 * broken.
 */
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

  const { data, error } = await supabase.rpc("remove_household_member", {
    p_traveler: body.traveler_id,
  });

  if (error) {
    // 42501 is the function's own refusal -- a rule, not a fault -- and its
    // message is written to be read by the person who pressed the button.
    const denied = error.code === "42501";
    const missing = error.code === "P0002";
    return NextResponse.json(
      {
        error: denied || missing ? error.message : "That did not work.",
      },
      { status: denied ? 403 : missing ? 404 : 500 },
    );
  }

  return NextResponse.json(data || { ok: true });
}
