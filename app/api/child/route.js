import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";

export const dynamic = "force-dynamic";
export async function GET() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401, headers });
  const { data, error } = await supabase.rpc("minor_trip_review");
  if (error) return NextResponse.json({ error: "We couldn’t load your trips. Please try again." }, { status: 503, headers });
  return NextResponse.json(data, { headers });
}
