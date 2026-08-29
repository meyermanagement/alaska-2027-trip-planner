// The list of tips you have put away, fetched only when somebody asks for it.
//
// Its own route rather than part of the Reminders page load, because the list is
// shut by default and most days nobody opens it. Making every visit to Reminders
// pay for a query nobody reads would be the wrong trade.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data, error } = await supabase
    .from("pro_tips")
    .select(
      "id, title, body, because, urgency, act_by, scope, about, sources, resolved_at, trips (name, slug)",
    )
    // Ignore was retired, but rows that were ignored while it existed are the same
    // kind of thing as a cleared one and belong in the same list rather than
    // disappearing along with the button.
    .in("status", ["cleared", "ignored"])
    .order("resolved_at", { ascending: false })
    .limit(60);

  if (error) {
    return NextResponse.json(
      { error: "Could not fetch those." },
      { status: 500 },
    );
  }
  return NextResponse.json({ tips: data || [] });
}
