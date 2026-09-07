import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { INTERVIEW_QUESTIONS, questionFor } from "@/lib/travelers/interview";
import { topicForSlot } from "@/lib/travelers/interview-topics";
import { tableForSlot } from "@/lib/travelers/slots";

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
  // The moments panel is a different shape -- a list of favorite moments, not
  // a single answer -- and has its own route. If it ever posts here by
  // mistake, refuse rather than mis-file the words as a preference.
  if (question.kind === "moments") {
    return NextResponse.json(
      { error: "That question is saved somewhere else." },
      { status: 400 },
    );
  }

  const action = body?.action === "skip" ? "skip" : "answer";
  const rawChoice = String(body?.choice || "").trim();
  const rawText = String(body?.text || "").trim();
  // Whys and own-words are only sent by option questions. Chips is an array of
  // strings (each becomes its own preference row); ownWords is a single string
  // (becomes one more preference row, verbatim, when non-empty). Both are
  // optional -- an option question with a plain pick and nothing else still
  // saves fine.
  const rawWhys = Array.isArray(body?.whys) ? body.whys : [];
  const rawOwnWords = String(body?.ownWords || "").trim();

  // Where the answer will land -- household_facts for the limits slot,
  // travel_preferences for every option question.
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
  //
  //    A re-answer must not double-stack. The interview writes several rows
  //    per option answer (base + one per chip + own-words), so replacing the
  //    previous set has to be done as a group: delete every family-wide row
  //    for this slot on the target table, then insert the new set.
  //
  //    The delete is scoped by (family_id, slot, traveler_id IS NULL). It is
  //    safe against Mark's hand-added preferences because those rows carry
  //    slot=NULL, and against per-person rows because those carry a
  //    traveler_id. Only interview-authored, family-wide rows for the same
  //    slot are cleared.
  if (action === "answer") {
    const targetTable =
      table === "household_facts" ? "household_facts" : "travel_preferences";
    const { error: clearError } = await supabase
      .from(targetTable)
      .delete()
      .eq("family_id", familyId)
      .eq("slot", slotId)
      .is("traveler_id", null);
    if (clearError) {
      return NextResponse.json(
        { error: "That answer could not be saved. Try again." },
        { status: 500 },
      );
    }

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
      // Multi-option question. The choice label is the body, and their own
      // words (if they picked Something else) become the base row's body. The
      // question label is prepended to the option label so the row on
      // Preferences reads as a full sentence -- "Where money is worth
      // spending: The room" instead of a bare "The room" that a reader has
      // to guess the context of. Something-else answers get the same prefix.
      //
      // Whys and own-words are separate preference rows, not concatenated
      // into the base row's reason column. Each tapped chip is one row; the
      // typed sentence (if any) is one more row. That way Aly and the
      // Preferences page read them as first-class preferences, without
      // anything needing to know they came from the interview.
      //
      // Every row written here shares the same topic, drawn from the
      // slot->topic map so Preferences groups "the money whys" with "the
      // money answer" -- and so the topics are Mark's already-used
      // vocabulary rather than new ones for every question.
      //
      // Some slots offer two options; others offer three, four, or five.
      // The renderer and this handler both treat the option array as
      // open-ended, so adding a middle choice on a spectrum question is a
      // data change with no code impact.
      const opt = (question.options || []).find((o) => o.value === rawChoice);
      const somethingElse = rawChoice === "other";
      const answerText = somethingElse ? rawText : opt ? opt.label : "";
      if (!answerText) {
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
      // Topic and topics only exist on travel_preferences, not on
      // household_facts. Every option question in the current interview
      // writes to travel_preferences, but the guard keeps this correct if
      // an option question is ever added that maps to household_facts.
      const writesToPreferences = table === "travel_preferences";
      const topic = writesToPreferences ? topicForSlot(slotId) : null;
      const baseRow = {
        family_id: familyId,
        traveler_id: null,
        slot: slotId,
        body: `${question.label}: ${answerText}`,
        source: "said",
      };
      if (topic) {
        baseRow.topic = topic;
        baseRow.topics = [topic];
      }

      // The whys array often carries chips the panel silently included from
      // the current answer's suggestion pool. Trim, drop blanks, and cap
      // length so a runaway client cannot flood the table. A hard cap of 20
      // is generous -- most questions have 5-8 primary chips plus a few
      // more in the "More" pool.
      const whyRows = [];
      const seenBodies = new Set([baseRow.body.toLowerCase().trim()]);
      for (const raw of rawWhys) {
        const clean = String(raw || "").trim();
        if (!clean) continue;
        if (clean.length > 500) continue;
        const key = clean.toLowerCase();
        if (seenBodies.has(key)) continue;
        seenBodies.add(key);
        const row = {
          family_id: familyId,
          traveler_id: null,
          slot: slotId,
          body: clean,
          source: "said",
        };
        if (topic) {
          row.topic = topic;
          row.topics = [topic];
        }
        whyRows.push(row);
        if (whyRows.length >= 20) break;
      }

      // Own-words is one more preference row, verbatim. Kept separate from
      // the picked option (whose text sits in the base row) and from the
      // chips (each in its own row already). A blank own-words field is a
      // fine answer -- the chips and the pick may be all somebody wanted
      // to say.
      const rowsToInsert = [baseRow, ...whyRows];
      if (rawOwnWords && !somethingElse) {
        const key = rawOwnWords.toLowerCase();
        if (!seenBodies.has(key)) {
          const row = {
            family_id: familyId,
            traveler_id: null,
            slot: slotId,
            body: rawOwnWords,
            source: "said",
          };
          if (topic) {
            row.topic = topic;
            row.topics = [topic];
          }
          rowsToInsert.push(row);
        }
      }

      const { error } = await supabase.from(targetTable).insert(rowsToInsert);
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
