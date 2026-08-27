// Clearing a tip, ignoring a tip, or changing your mind about one.
//
// The two words mean different things and the difference is the whole point of
// keeping a log. Clearing is "read it, done with it". Ignoring is "not for us" —
// and an ignored tip is the more interesting of the two, because six months later
// the reason it was wrong may have stopped being true. So neither is a delete:
// both are a status, both are reversible, and the ignored ones are listable.
//
// Nothing is ever deleted from here, which also means a tip cannot come back: the
// fingerprint stays in the table, and the next run finds it already there.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED = new Set(["active", "cleared", "ignored"]);

export async function PATCH(request, { params }) {
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a status." }, { status: 400 });
  }
  const status = String(body?.status || "");
  if (!ALLOWED.has(status)) {
    return NextResponse.json(
      { error: "That is not a status." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Bringing a tip back means it was never resolved, so the record of who put it
  // away goes with it rather than lingering as a half-truth.
  const patch =
    status === "active"
      ? { status, resolved_by: null, resolved_at: null }
      : { status, resolved_by: user.id, resolved_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from("pro_tips")
    .update(patch)
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Could not save that." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "That tip is not there." },
      { status: 404 },
    );
  }
  return NextResponse.json(data);
}
