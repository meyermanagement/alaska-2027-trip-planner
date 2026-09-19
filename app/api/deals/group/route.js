import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import { homeToday } from "@/lib/format";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId || access.can.isSecondary)
    return NextResponse.json({ error: "You cannot change fares." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) || {};
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
  if (!ids.length || ids.length > 200 || ids.some((id) => typeof id !== "string"))
    return NextResponse.json({ error: "Choose a fare group." }, { status: 400 });
  const action = body.action ?? "dismiss";
  if (!["dismiss", "restore"].includes(action))
    return NextResponse.json({ error: "Choose restore or dismiss." }, { status: 400 });
  if (action === "restore") {
    // One atomic write rechecks household, status and deadline. A fare saved in
    // another tab or expired since the group was displayed cannot be reopened.
    const { data, error } = await supabase.from("flight_deals")
      .update({ status: "open", dismissed_reason: null, trip_id: null, someday_id: null, updated_by: user.id })
      .eq("family_id", access.familyId).eq("status", "dismissed").in("id", ids)
      .or(`book_by.is.null,book_by.gte.${homeToday()},book_by_inferred.eq.true`)
      .select("id");
    if (error) return NextResponse.json({ error: "The group did not restore. Try again." }, { status: 500 });
    const restored = data?.length || 0;
    return NextResponse.json({ restored, skipped: ids.length - restored });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  // One atomic statement, scoped to visible IDs and the caller's household.
  // A fare already taken in another tab is left alone.
  const { data, error } = await supabase.from("flight_deals")
    .update({ status: "dismissed", dismissed_reason: reason || "Cleared with email group", trip_id: null, someday_id: null, updated_by: user.id })
    .eq("family_id", access.familyId).eq("status", "open")
    .in("id", ids).select("id");
  if (error) return NextResponse.json({ error: "The group did not clear. Try again." }, { status: 500 });
  return NextResponse.json({ cleared: data?.length || 0 });
}
