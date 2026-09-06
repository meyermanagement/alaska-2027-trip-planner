import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { INTERVIEW_QUESTIONS, questionFor } from "@/lib/travelers/interview";
import { HARD_SLOTS, tableForSlot } from "@/lib/travelers/slots";

export const runtime = "nodejs";
export const maxDuration = 30;

// Writes one interview answer, from the interview screen. Kept out of the Ask
// Aly apply route because that one is chat-tool-shaped: it takes an action from
// a model, resolves owners, writes summaries. Here the shape is smaller and
// deterministic -- one slot, one answer, one traveler (the primary who is
// running the interview) -- so it earns its own route.
//
// Only the primary can post here. A secondary who somehow reaches /interview
// gets a 403 rather than writing preferences under somebody else's name.
//
// Three writes per answered slot:
//
//   1. traveler_slots. Marks the slot settled or skipped, with the note field
//      carrying the primary's Something-else words when they picked one.
//   2. travel_preferences (for taste slots) or household_facts (for facts). The
//      picked option label goes in body verbatim; the Something-else text goes
//      in reason so the primary can see what they said next to what was saved.
//   3. Nothing at all for a skip -- the slot row alone stands for "asked and
//      passed".
//
// Family-wide, not per person: the interview asks the primary once on behalf of
// the household, and the answer applies to everybody. The whose-is-it question
// belongs on each trip's roster and each person's page, not here.
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That request could not be read." },
      { status: 400 },
    );
  }

  const slotId = String(body?.slot || "").trim();
  const question = questionFor(slotId);
  if (!question) {
    return NextResponse.json(
      { error: "That question is not one this interview asks." },
      { status: 400 },
    );
  }

  const action = body?.action === "skip" ? "skip" : "answer";
  const rawChoice = String(body?.choice || "").trim();
  const rawText = String(body?.text || "").trim();

  // Where the answer will land.
  const isFact = HARD_SLOTS.has(slotId);
  const table = tableForSlot(slotId);
  const nowIso = new Date().toISOString();

  // 1. The slot row. Upserted by hand because the uniqueness that keeps this
  //    to one row per family per slot is a partial index and Postgres cannot
  //    infer one from a plain upsert.
  const slotFinder = supabase
    .from("traveler_slots")
    .select("id, asked_count")
    .eq("family_id", familyId)
    .eq("slot", slotId)
    .is("traveler_id", null);
  const { data: existing } = await slotFinder.maybeSingle();

  const noteForSlot = (() => {
    if (action === "skip") return "The primary skipped this question.";
    if (question.kind === "text") return rawText || null;
    if (rawChoice === "other") return rawText || null;
    // For an option pick, the note carries the option label so the row on its
    // own reads like an answer -- somebody looking at the ledger later should
    // see what was chosen without having to look up the question.
    const opt = (question.options || []).find((o) => o.value === rawChoice);
    return opt ? opt.label : null;
  })();

  const slotPatch = {
    slot: slotId,
    status: action === "skip" ? "skipped" : "settled",
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

  // 2. The preference or fact row. Skips write nothing here; the slot row alone
  //    records that the primary passed.
  if (action === "answer") {
    if (question.kind === "text") {
      if (rawText) {
        const { error } = await supabase.from("household_facts").insert({
          family_id: familyId,
          traveler_id: null,
          kind: "rule",
          slot: slotId,
          body: rawText,
          source: "said",
        });
        if (error) {
          return NextResponse.json(
            { error: "That answer could not be saved. Try again." },
            { status: 500 },
          );
        }
      }
      // Blank text plus a settled slot means "asked, nothing to say" -- the
      // whole family is unrestricted. The slot row alone is the record; no
      // fact row is written, because a fact row with an empty body is a lie.
    } else {
      // Two-option question. The choice label is the body, and their own words
      // (if they picked Something else) go in reason.
      const opt = (question.options || []).find((o) => o.value === rawChoice);
      const somethingElse = rawChoice === "other";
      const bodyText = somethingElse ? rawText : opt ? opt.label : "";
      if (!bodyText) {
        // No option picked and no words typed. The slot got saved as settled
        // above, which is wrong; roll it back to asking so the interview can
        // put the question again rather than skipping over it.
        await supabase
          .from("traveler_slots")
          .update({ status: "asking", note: null })
          .eq("family_id", familyId)
          .eq("slot", slotId)
          .is("traveler_id", null);
        return NextResponse.json(
          { error: "Pick one of the two, or type what fits better." },
          { status: 400 },
        );
      }
      const insertRow = {
        family_id: familyId,
        traveler_id: null,
        slot: slotId,
        body: bodyText,
        source: "said",
      };
      // Reason is the primary's own words when they said them. When they chose
      // one of the two, there is no separate reason -- the option is the
      // answer.
      if (somethingElse === false && rawText) {
        insertRow.reason = rawText;
      }
      const { error } = await supabase
        .from(
          table === "household_facts"
            ? "household_facts"
            : "travel_preferences",
        )
        .insert(insertRow);
      if (error) {
        return NextResponse.json(
          { error: "That answer could not be saved. Try again." },
          { status: 500 },
        );
      }
    }
  }

  // The next slot. Computed on the server so the screen does not have to reload
  // and re-derive the ledger just to know what to ask next.
  const answeredIndex = INTERVIEW_QUESTIONS.findIndex((q) => q.slot === slotId);
  const nextIndex = answeredIndex + 1;
  const done = nextIndex >= INTERVIEW_QUESTIONS.length;

  return NextResponse.json({
    ok: true,
    complete: done,
    nextSlot: done ? null : INTERVIEW_QUESTIONS[nextIndex].slot,
  });
}
