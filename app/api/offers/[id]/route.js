// Turning a card offer down, and asking to be asked again.
//
// A refusal is worth more than a cleared tip. Clearing says "I have read this";
// turning an offer down says "not on these terms", and that is a fact about the
// family that should still be true in November. So it is recorded against the
// terms rather than against the sentence: the bonus, the spending and the fee
// that were on the table when they said no. The next look sees it and leaves the
// card alone unless the offer has genuinely improved.
//
// The other direction matters as much. A refusal that could never be undone
// would be a trap -- somebody dismisses a card in a hurry in March and the app
// silently never mentions it again. Ask again puts the row back to open, and the
// next look treats it as a live question.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED = new Set(["declined", "open", "taken"]);

export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const status = typeof body?.status === "string" ? body.status : "";
  if (!ALLOWED.has(status)) {
    return NextResponse.json(
      { error: "That is not something an offer can become." },
      { status: 400 },
    );
  }
  const note =
    typeof body?.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 300)
      : null;

  const today = new Date().toISOString().slice(0, 10);
  // Row-level security does the ownership check: the update matches nothing at
  // all for a family this person is not in, and a secondary traveler is refused
  // outright, so there is no need to read the row first to decide.
  const { data: offer, error } = await supabase
    .from("card_offers")
    .update(
      status === "open"
        ? { status, decided_on: null, decided_note: null }
        : { status, decided_on: today, decided_note: note },
    )
    .eq("id", id)
    .select("id, card_name, status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "That did not save." }, { status: 500 });
  }
  if (!offer) {
    return NextResponse.json({ error: "That offer is gone." }, { status: 404 });
  }

  return NextResponse.json({ offer });
}
