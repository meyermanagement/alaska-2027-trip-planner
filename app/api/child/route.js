import { NextResponse } from "next/server";
import { readView, privateHeaders } from "@/lib/childView/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const ctx = await readView();
    if (!ctx) return NextResponse.json({ enabled: false, trips: [] }, { headers: privateHeaders });
    const { data, error } = await ctx.admin.rpc("parent_trip_view_data", { view_hash: ctx.hash });
    if (error) throw new Error("Trip access could not be checked.");
    return NextResponse.json(data, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Your trips could not be loaded. Please try again." }, { status: 503, headers: privateHeaders });
  }
}
