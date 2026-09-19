import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId || access.can.isSecondary)
    return NextResponse.json({ error: "You cannot change fares." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
  if (!ids.length || ids.length > 200 || ids.some((id) => typeof id !== "string"))
    return NextResponse.json({ error: "Choose a fare group." }, { status: 400 });
  // One atomic statement, scoped to visible IDs and the caller's household.
  // A fare already taken in another tab is left alone.
  const { data, error } = await supabase.from("flight_deals")
    .update({ status: "dismissed", dismissed_reason: "Cleared with email group", updated_by: user.id })
    .eq("family_id", access.familyId).eq("status", "open")
    .in("id", ids).select("id");
  if (error) return NextResponse.json({ error: "The group did not clear. Try again." }, { status: 500 });
  return NextResponse.json({ cleared: data?.length || 0 });
}
