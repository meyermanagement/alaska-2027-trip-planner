// Clearing a tip, or changing your mind about one.
//
// Clearing is not a delete. It is a status, it is reversible, and the cleared ones
// stay listable at the bottom of Reminders — because six months later the reason a
// tip did not apply may have stopped being true, and because a family should be
// able to see what the app stopped mentioning.
//
// Nothing is ever deleted from here, which also means a tip cannot come back: the
// fingerprint stays in the table, and the next run finds it already there.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Ignore was retired: one dismiss, and it is reversible. "ignored" is still read
// from rows written while the button existed, but nothing writes it any more.
const ALLOWED = new Set(["active", "cleared"]);

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
