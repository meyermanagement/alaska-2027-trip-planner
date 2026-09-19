import { NextResponse } from "next/server";
import { readView, requestOrigin, privateHeaders, cookieOptions } from "@/lib/childView/server";
import { validTheme } from "@/lib/childView/interactions";
import { SKIN_COOKIE } from "@/lib/skins";
import { CHILD_LOCK_SECONDS } from "@/lib/childView/constants";

export async function POST(request) {
  try { requestOrigin(request); } catch {
    return NextResponse.json({ error: "Please reopen this view." }, { status: 403, headers: privateHeaders });
  }
  let body;
  try { body = await request.json(); } catch { /* rejected below */ }
  if (!validTheme(body)) return NextResponse.json({ error: "Choose one of the available themes." }, { status: 400, headers: privateHeaders });
  try {
    const ctx = await readView();
    if (!ctx) return NextResponse.json({ error: "A parent needs to reopen this view." }, { status: 403, headers: privateHeaders });
    const { data, error } = await ctx.admin.rpc("set_child_theme", { view_hash: ctx.hash, chosen_skin: body.skin });
    if (error) return NextResponse.json({ error: "Your theme could not be saved. Refresh this view." }, { status: error.code === "42501" ? 403 : 503, headers: privateHeaders });
    const response = NextResponse.json(data, { headers: privateHeaders });
    response.cookies.set(SKIN_COOKIE, data.skin, { ...cookieOptions, httpOnly: false, maxAge: CHILD_LOCK_SECONDS });
    return response;
  } catch {
    return NextResponse.json({ error: "Could not confirm the save. Refresh before trying again." }, { status: 503, headers: privateHeaders });
  }
}
