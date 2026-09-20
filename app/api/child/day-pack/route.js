import { NextResponse } from "next/server";
import { readView, requestOrigin, privateHeaders } from "@/lib/childView/server";
import { validPacking } from "@/lib/childView/interactions";

export async function POST(request) {
  try { requestOrigin(request); } catch {
    return NextResponse.json({ error: "Please reopen this view." }, { status: 403, headers: privateHeaders });
  }
  let body;
  try { body = await request.json(); } catch { /* rejected below */ }
  if (!validPacking(body)) return NextResponse.json({ error: "Invalid day-pack change." }, { status: 400, headers: privateHeaders });
  try {
    const ctx = await readView();
    if (!ctx) return NextResponse.json({ error: "A parent needs to reopen this view." }, { status: 403, headers: privateHeaders });
    const { data, error } = await ctx.admin.rpc("set_child_day_pack", { view_hash: ctx.hash, item_id: body.itemId, packed: body.packed });
    if (error) return NextResponse.json({ error: "This item is no longer available in your view." }, { status: error.code === "42501" ? 403 : 503, headers: privateHeaders });
    return NextResponse.json(data, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: "Could not confirm the save. Refresh before trying again." }, { status: 503, headers: privateHeaders });
  }
}
