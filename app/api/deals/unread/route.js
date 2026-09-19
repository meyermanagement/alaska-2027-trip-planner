import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import { unreadFares } from "@/lib/deals/unread";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const access = await resolveAccess(supabase, user);
  const rows = !access?.familyId || access.can.isSecondary ? []
    : await unreadFares(supabase, user.id, access.familyId);
  return NextResponse.json({ count: rows.length }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId || access.can.isSecondary)
    return NextResponse.json({ error: "You cannot read fares." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
  if (!ids.length || ids.length > 200 || ids.some((id) => typeof id !== "string"))
    return NextResponse.json({ error: "Choose a fare group." }, { status: 400 });
  const { data: deals, error: lookupError } = await supabase.from("flight_deals")
    .select("id").eq("family_id", access.familyId).in("id", ids);
  if (lookupError) return NextResponse.json({ error: "Could not mark fares read." }, { status: 500 });
  if (!deals?.length) return NextResponse.json({ error: "Fares not found." }, { status: 404 });
  const { error } = await supabase.from("flight_deal_reads").upsert(
    deals.map((deal) => ({ deal_id: deal.id, user_id: user.id })),
    { onConflict: "deal_id,user_id", ignoreDuplicates: true },
  );
  return error
    ? NextResponse.json({ error: "Could not mark fares read." }, { status: 500 })
    : NextResponse.json({ ok: true });
}
