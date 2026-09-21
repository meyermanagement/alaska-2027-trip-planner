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
//
// The tip that carried the terms moves with the offer, and it moves here rather
// than in the browser. It used to be cleared by the same press, which filed one
// decision in two places -- the offer under the refusals with its terms and its
// date, the sentence under the cleared tips as though somebody had merely read
// it. A tip whose offer is refused becomes 'declined': gone from the live list,
// absent from the cleared record, still in the table so the next look does not
// say the same thing again. Ask again puts it back to active alongside the offer,
// and taking the card clears it, because then it really has been read and acted
// on. Doing all of it in one route is what stops the two rows disagreeing when a
// browser is closed between the two writes.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { homeToday } from "@/lib/format";

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

  const today = homeToday();
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
    // An offer that ran out cannot be put back on the table: the terms are gone,
    // and quietly reopening it would have Aly weighing a bonus nobody can claim.
    // The History row has no button for it, so this is the belt to that braces.
    .neq("status", "expired")
    .select("id, card_name, status, tip_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "That did not save." }, { status: 500 });
  }
  if (!offer) {
    return NextResponse.json(
      {
        error:
          "That offer is no longer on the table — it has either ended or been removed.",
      },
      { status: 404 },
    );
  }

  // Not fatal if it fails. The refusal is the fact worth keeping, and a tip left
  // on the live list is a sentence read twice rather than a decision lost.
  if (offer.tip_id) {
    const { error: tipError } = await supabase
      .from("pro_tips")
      .update(
        status === "open"
          ? { status: "active", resolved_at: null }
          : {
              status: status === "taken" ? "cleared" : "declined",
              resolved_at: new Date().toISOString(),
            },
      )
      .eq("id", offer.tip_id);
    if (tipError)
      console.error("[offers] tip status", offer.tip_id, tipError.message);
  }

  return NextResponse.json({ offer });
}
