import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import { isMinorTraveler } from "@/lib/beta/accountAge";
import { AGREEMENT_VERSION, PRIVACY_VERSION } from "@/lib/beta/agreement";
import { MINOR_REVIEW_NOTICE_VERSION, validateMinorReview } from "@/lib/beta/minorReview";

async function parentContext() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) return { response: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  const access = await resolveAccess(supabase, user);
  if (!access || access.can.isSecondary) return {
    response: NextResponse.json({ error: "A parent or guardian with primary access must manage this." }, { status: 403 }),
  };
  const { data: own, error } = await supabase.from("travelers")
    .select("date_of_birth").eq("id", access.travelerId).maybeSingle();
  if (error || !own?.date_of_birth || isMinorTraveler(own)
      || new Date(own.date_of_birth) > new Date()) return {
    response: NextResponse.json({ error: "Add your adult birthday to your own Family profile before managing child access." }, { status: 403 }),
  };
  return { supabase, user, access };
}

export async function GET() {
  const ctx = await parentContext();
  if (ctx.response) return ctx.response;
  const { supabase, access } = ctx;
  const [people, grants, legacy] = await Promise.all([
    supabase.from("travelers").select("id,name,date_of_birth,access_level,user_id")
      .eq("family_id", access.familyId).eq("is_person", true).order("sort_order"),
    supabase.from("minor_review_grants")
      .select("traveler_id,enabled,notice_version,updated_at")
      .eq("family_id", access.familyId),
    supabase.from("child_access_requests").select("traveler_id")
      .eq("family_id", access.familyId),
  ]);
  if (people.error || grants.error || legacy.error) return NextResponse.json({
    error: "Child access setup is not available yet. Nothing has been enabled. Please try again later.",
  }, { status: 503 });
  return NextResponse.json({
    children: (people.data || []).filter(row => isMinorTraveler(row)),
    grants: grants.data || [],
    legacy: legacy.data || [],
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  const ctx = await parentContext();
  if (ctx.response) return ctx.response;
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Please check the request." }, { status: 400 });
  }
  const problem = validateMinorReview(body);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const { data, error } = await ctx.supabase.rpc("set_minor_review_access", {
    child_id: body.travelerId,
    allow_review: true,
    guardian_confirmed: body.guardian === true,
    notice: MINOR_REVIEW_NOTICE_VERSION,
    agreement: AGREEMENT_VERSION,
    privacy: PRIVACY_VERSION,
  });
  if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message
    : "The request could not be saved. Your choices are still here; nothing was enabled." }, { status: 409 });
  return NextResponse.json({ grant: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request) {
  // Withdrawal needs only the original parent's authenticated identity and
  // household membership, not current consent or a current primary role.
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Please check the request." }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("set_minor_review_access", {
    child_id: body.travelerId, allow_review: false, guardian_confirmed: false,
    notice: MINOR_REVIEW_NOTICE_VERSION, agreement: AGREEMENT_VERSION, privacy: PRIVACY_VERSION,
  });
  if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message
    : "The request could not be withdrawn. Please try again." }, { status: 409 });
  return NextResponse.json({ grant: data }, { headers: { "Cache-Control": "no-store" } });
}
