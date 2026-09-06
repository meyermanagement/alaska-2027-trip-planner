import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";

export const runtime = "nodejs";
export const maxDuration = 30;

// Writes the moments panel of the interview -- the closing question that asks
// for two or three favorite moments from past trips in the primary's own
// words. Each moment lands in favorite_moments on the primary's own row, and
// the moments slot itself gets a traveler_slots row marking it settled or
// skipped so the interview ledger reads finished.
//
// Kept out of /api/interview/answer because that route is single-answer,
// single-table shaped (one slot, one preference or fact). Moments are a list
// of arbitrary length written to a per-person memory table -- a different
// shape, a different owner, and a different validation contract.
//
// Only the primary can post here. A secondary who somehow reaches /interview
// gets a 403 rather than saving moments under somebody else's name.
//
// Two writes per submission:
//
//   1. favorite_moments. One row per non-empty moment, sorted by the order the
//      primary listed them. Each row carries family_id, traveler_id (the
//      primary's own row), body (verbatim), sort_order (increment from the
//      current maximum for this person), and created_by (the auth user).
//
//   2. traveler_slots. The `moments` slot row is upserted the same way the
//      answer route upserts other slot rows -- one per family, no traveler
//      scope -- with status settled and a short note. Even a skip writes this,
//      so the interview ledger stops asking.
//
// A blank submission (no moments, no skip) is treated as skip: the primary
// pressed the save button without typing, and closing the panel then coming
// back should not land them on the same empty screen.

const MAX_MOMENTS = 12;
const MAX_MOMENT_LENGTH = 1200;

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const access = await resolveAccess(supabase, user);
  const familyId = access?.familyId;
  const travelerId = access?.travelerId;
  if (!familyId) {
    return NextResponse.json(
      { error: "No family group found." },
      { status: 403 },
    );
  }
  if (access.level !== PRIMARY) {
    return NextResponse.json(
      {
        error:
          "Only the person who set up the family runs the interview. Ask them to finish it.",
      },
      { status: 403 },
    );
  }
  if (!travelerId) {
    // The primary should always have a traveler row -- claim_traveler_seat
    // creates one on first login. If it is missing, saving moments to a
    // fabricated id would be worse than refusing. Ask them to reload so
    // resolveAccess can try again against the current session.
    return NextResponse.json(
      { error: "Your traveler record is missing. Reload and try again." },
      { status: 500 },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That request could not be read." },
      { status: 400 },
    );
  }

  const action = payload?.action === "skip" ? "skip" : "answer";
  const rawList = Array.isArray(payload?.moments) ? payload.moments : [];

  // Clean, dedupe, and cap. Empty strings are dropped rather than saved as
  // rows with a blank body, and duplicate moments (case-insensitive) collapse
  // to one so an accidental double-tap does not leave two identical rows on
  // the person's file.
  const seen = new Set();
  const moments = [];
  for (const raw of rawList) {
    const trimmed = String(raw || "")
      .trim()
      .slice(0, MAX_MOMENT_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    moments.push(trimmed);
    if (moments.length >= MAX_MOMENTS) break;
  }

  // An answer submission with nothing in the list is treated as a skip. The
  // primary pressed the save button on an empty panel; the ledger still needs
  // to record that the question was asked.
  const settled = action === "answer" && moments.length > 0;
  const skipped = !settled;

  const nowIso = new Date().toISOString();

  // 1. Write the moments themselves, in order. Sort_order picks up where the
  //    person's existing rows left off so a re-run of the interview does not
  //    interleave old and new rows.
  if (settled) {
    const { data: lastRow } = await supabase
      .from("favorite_moments")
      .select("sort_order")
      .eq("family_id", familyId)
      .eq("traveler_id", travelerId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    let sort = Number.isFinite(lastRow?.sort_order) ? lastRow.sort_order : 0;

    const rows = moments.map((body) => {
      sort += 1;
      return {
        family_id: familyId,
        traveler_id: travelerId,
        body,
        sort_order: sort,
        created_by: user.id,
      };
    });

    const { error } = await supabase.from("favorite_moments").insert(rows);
    if (error) {
      return NextResponse.json(
        { error: "Those moments could not be saved. Try again." },
        { status: 500 },
      );
    }
  }

  // 2. Upsert the moments slot row. Family-scoped (traveler_id null) so it
  //    matches the interview's other slot rows and interviewProgress can
  //    count it as answered.
  const noteForSlot = settled
    ? moments.length === 1
      ? "One favorite moment saved."
      : `${moments.length} favorite moments saved.`
    : "The primary skipped this question.";

  const { data: existing } = await supabase
    .from("traveler_slots")
    .select("id, asked_count")
    .eq("family_id", familyId)
    .eq("slot", "moments")
    .is("traveler_id", null)
    .maybeSingle();

  const slotPatch = {
    slot: "moments",
    status: skipped ? "skipped" : "settled",
    traveler_id: null,
    note: noteForSlot,
    updated_at: nowIso,
    updated_by: user.id,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("traveler_slots")
      .update(slotPatch)
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json(
        { error: "That answer could not be saved. Try again." },
        { status: 500 },
      );
    }
  } else {
    const { error } = await supabase.from("traveler_slots").insert({
      ...slotPatch,
      family_id: familyId,
      asked_count: 1,
    });
    if (error) {
      return NextResponse.json(
        { error: "That answer could not be saved. Try again." },
        { status: 500 },
      );
    }
  }

  // Moments is the last question in the interview. Whatever the primary did
  // here -- saved a few, skipped -- the panel is done and the client should
  // land on the trip builder.
  return NextResponse.json({
    ok: true,
    complete: true,
    saved: settled ? moments.length : 0,
    skipped,
  });
}
