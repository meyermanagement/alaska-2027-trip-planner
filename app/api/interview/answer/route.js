import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import {
  questionFor,
  questionsFor,
  optionLabels,
  multiSentence,
  rankSentence,
} from "@/lib/travelers/interview";
import {
  arrangementForPlan,
  everyAnimalAnswered,
  normalizePetPlans,
  petClause,
  petsSentence,
  travelStyleForPlan,
} from "@/lib/travelers/animals";
import { travelStylesFor } from "@/lib/pets/pets";
import { syncPackingForPet } from "@/lib/pets/packing";
import {
  inferAnswer,
  priorAnswersFrom,
} from "@/lib/travelers/interviewInference";
import { bandSentence, normalizeBand } from "@/lib/travelers/dayBand";
import { topicForSlot } from "@/lib/travelers/interview-topics";
import { tableForSlot } from "@/lib/travelers/slots";
import { homeToday } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 30;

// The note left on an arrangement this answer filed, so a later change to the
// answer can correct its own rows and leave everybody else's alone. It is
// written to be read: somebody opening the trip should be able to tell where the
// line came from without being told about interviews and slots.
const FROM_INTERVIEW = "From your household answer about the animals.";

/**
 * The animals answer, put where the app reads it.
 *
 * The household rule is the record of what was said. This is the consequence of
 * it: the animal's own way of travelling, and one arrangement per trip ahead.
 * Both writes are conservative on purpose.
 *
 *   - The animal's travel style is filled only when it is blank. A family that
 *     already said the dog flies in the cabin has said more than this question
 *     asks, and a general answer must not quietly overwrite a specific one.
 *   - A trip that already has a decision about this animal is left exactly as it
 *     is, unless that decision is one this answer filed itself. The interview
 *     asks how things usually go; a trip's own roster is the family deciding
 *     about that trip, and it wins. Changing the household answer later does
 *     correct the rows it wrote, which is why they are marked.
 *   - Trips already behind them are left alone. Nothing useful comes of filing
 *     an arrangement for a trip that has been and gone.
 *
 * Packing follows each arrangement through the same sync the trip roster and Ask
 * Aly use, so an animal that comes along arrives with its own lines and one that
 * is left behind has its lines set aside rather than deleted.
 */
async function placePetPlans({ supabase, familyId, pets, plans, words }) {
  const byName = new Map(
    (pets || []).map((p) => [
      String(p?.name || "")
        .trim()
        .toLowerCase(),
      p,
    ]),
  );
  const matched = (plans || [])
    .map((row) => ({
      plan: row?.plan,
      pet: byName.get(
        String(row?.name || "")
          .trim()
          .toLowerCase(),
      ),
    }))
    .filter((row) => row.pet?.id);
  if (!matched.length) return;

  // On the animal.
  for (const { pet, plan } of matched) {
    if (pet.travel_style) continue;
    const style = travelStyleForPlan(plan, travelStylesFor(pet.species));
    if (!style) continue;
    const { error } = await supabase
      .from("pets")
      .update({ travel_style: style })
      .eq("id", pet.id)
      .eq("family_id", familyId);
    // Held on the local copy too, because the packing sync below reads the
    // travel style to decide which lines an animal needs.
    if (!error) pet.travel_style = style;
  }

  // On the trips ahead. An arrangement is only worked out for some of the
  // plans -- "it depends on the trip" is the family saying they will answer per
  // trip -- so this can be empty even when the animals themselves were updated.
  const wanted = matched
    .map(({ pet, plan }) => ({
      pet,
      arrangement: arrangementForPlan(plan, words),
    }))
    .filter((row) => row.arrangement);
  if (!wanted.length) return;

  const today = homeToday();
  const { data: tripRows } = await supabase
    .from("trips")
    .select("id, status, start_date, end_date")
    .eq("family_id", familyId);
  const trips = (tripRows || []).filter((t) => {
    if (["complete", "archived"].includes(t?.status)) return false;
    // A draft is an idea rather than a date, so it counts as ahead of them even
    // when the dates it carries have gone by.
    if (t?.status === "draft") return true;
    return (t?.end_date || t?.start_date || "9999-12-31") >= today;
  });
  if (!trips.length) return;

  const { data: already } = await supabase
    .from("trip_pets")
    .select("trip_id, pet_id, arrangement_notes")
    .in(
      "trip_id",
      trips.map((t) => t.id),
    )
    .in(
      "pet_id",
      wanted.map((row) => row.pet.id),
    );
  const taken = new Set(
    (already || [])
      .filter(
        (r) => String(r?.arrangement_notes || "").trim() !== FROM_INTERVIEW,
      )
      .map((r) => `${r.trip_id}:${r.pet_id}`),
  );

  for (const trip of trips) {
    for (const { pet, arrangement } of wanted) {
      if (taken.has(`${trip.id}:${pet.id}`)) continue;
      const { error } = await supabase.from("trip_pets").upsert(
        {
          trip_id: trip.id,
          pet_id: pet.id,
          arrangement,
          arrangement_notes: FROM_INTERVIEW,
        },
        { onConflict: "trip_id,pet_id" },
      );
      if (error) continue;
      await syncPackingForPet({
        supabase,
        tripId: trip.id,
        familyId,
        pet,
        arrangement,
      });
    }
  }
}

// Writes one interview answer, from the interview screen. Kept out of the Ask
// Aly apply route because that one is chat-tool-shaped: it takes an action from
// a model, resolves owners, writes summaries. Here the shape is smaller and
// deterministic -- one slot, one answer, one traveler (the primary who is
// running the interview) -- so it earns its own route.
//
// Only the primary can post here. A secondary who somehow reaches /interview
// gets a 403 rather than writing preferences under somebody else's name.
//
// Three writes per answered slot, and a fourth for the animals question:
//
//   1. traveler_slots. Marks the slot settled or skipped, with the note field
//      carrying the primary's Something-else words when they picked one.
//   2. travel_preferences (for taste slots) or household_facts (for facts). The
//      picked option label goes in body verbatim; the Something-else text goes
//      in reason so the primary can see what they said next to what was saved.
//   3. For the animals question, the same answer again where the app reads it:
//      the animal's own travel style and one arrangement per trip ahead. See
//      placePetPlans below for how careful that is about not overwriting a
//      decision the family already made.
//   4. Nothing at all for a skip -- the slot row alone stands for "asked and
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

  // The ranked order, sent only by the money question. Cleaned here rather
  // than trusted: unknown values dropped, duplicates dropped, order kept, and
  // capped at the number of options the question actually offers so a client
  // cannot post a hundred entries. A SHORT order is valid -- one or two items
  // is a real answer, and the rest are unranked rather than last -- so the
  // only invalid ranked answer is an empty one.
  const isRank = question.kind === "rank";
  const isMulti = question.kind === "multi";
  // The day band's two hours. Normalized here rather than trusted: clamped
  // into the range the question offers, snapped to the half hour, and widened
  // to the question's minimum span, so a hand-posted body cannot file a day
  // that runs backwards or a day three minutes long. Everything stored is
  // derived from the phrase these two numbers make, never from the numbers
  // themselves -- a row holding a pair of integers is a row Aly cannot read
  // out loud.
  const isBand = question.kind === "band";
  const band = isBand ? normalizeBand(body?.band) : null;
  if (action === "answer" && isBand && !band) {
    return NextResponse.json(
      { error: "Set the hours your day runs." },
      { status: 400 },
    );
  }
  // The animals question, one row per animal. The names are checked against
  // the family's own animals rather than trusted, so a hand-posted body cannot
  // file a plan for an animal this household does not have, and every animal
  // has to have a plan: a half-answered list would leave the cat looking
  // settled on the strength of an answer about the dog.
  //
  // The pet list is read here for every request, not only this one, because the
  // next-question calculation at the bottom needs to know whether this family
  // is asked the animals question at all.
  const { data: petRows } = await supabase
    .from("pets")
    .select("id, name, species, travel_style, medications, family_id")
    .eq("family_id", familyId);
  const petNames = (petRows || [])
    .map((r) => String(r?.name || "").trim())
    .filter(Boolean);
  const isPets = question.kind === "pets";
  const petPlans = isPets ? normalizePetPlans(body?.pets, petNames) : [];
  if (
    action === "answer" &&
    isPets &&
    !everyAnimalAnswered(petPlans, petNames)
  ) {
    return NextResponse.json(
      { error: "Say what happens to each of them." },
      { status: 400 },
    );
  }
  // Both list shapes are cleaned the same way, and the cap is the question's
  // own: every option for the ranked question, `max` for a multi one, so a
  // client cannot post a fourth must-have on a question that asks for two.
  const listValues = [];
  if (isRank || isMulti) {
    const offered = new Set((question.options || []).map((o) => o.value));
    const cap = isMulti ? question.max || offered.size : offered.size;
    const sent = isMulti ? body?.picks : body?.order;
    for (const raw of Array.isArray(sent) ? sent : []) {
      const value = String(raw || "").trim();
      if (!offered.has(value)) continue;
      if (listValues.includes(value)) continue;
      listValues.push(value);
      if (listValues.length >= cap) break;
    }
  }
  // The one claim the inference rules and the derived check read. On the ranked
  // question that is first place -- "they protect the room first" is the same
  // claim the single-pick version used to make.
  //
  // On a multi question it is the first tick, and ONLY when it is the only
  // tick. A family that would book a hotel or a rental has told us their
  // lodging habit and told us nothing about which one to price first, so a
  // mixed answer deliberately carries no value forward rather than letting
  // whichever card they happened to tap first stand in for the whole answer.
  const listTopValue =
    isMulti && listValues.length > 1 ? "" : listValues[0] || "";

  // Was this answer worked out from earlier ones and agreed to, rather than
  // said outright?
  //
  // The client says so, but it is not taken at its word and its sentence is
  // never stored. The rules are re-run here against the family's own rows, and
  // the claim only stands if the server independently works out the same option
  // for the same slot. So a client cannot label a freely-given answer as
  // derived, cannot label a derived one as said, and cannot write its own
  // explanation into the travel file.
  //
  // Read before anything is written, because the first write below marks this
  // slot settled and the rules deliberately refuse to work out an answer to a
  // question that is already answered.
  let derivedBecause = null;
  const derivedAgainst = isRank || isMulti ? listTopValue : rawChoice;
  if (action === "answer" && body?.derived === true && derivedAgainst) {
    const [{ data: priorSlots }, { data: priorPreferences }] =
      await Promise.all([
        supabase
          .from("traveler_slots")
          .select("traveler_id, slot, status, note")
          .eq("family_id", familyId),
        supabase
          .from("travel_preferences")
          .select("traveler_id, slot, body")
          .eq("family_id", familyId),
      ]);
    const agreed = inferAnswer(
      slotId,
      priorAnswersFrom({
        slots: priorSlots || [],
        preferences: priorPreferences || [],
      }),
    );
    if (agreed?.value === derivedAgainst) derivedBecause = agreed.because;
  }

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
    // The band's note is the phrase the hours make -- "7:30 am to 9 pm" --
    // which is also what the preference row says and what the inference layer
    // reads back. One representation, in words, in all three places.
    if (isBand) return bandSentence(band);
    // The animals note is the sentence the rows make -- "Cricket comes with
    // us; Moose stays home." -- the same phrase the fact rows and the running
    // summary read, so the ledger row reads as an answer on its own.
    if (isPets) return petsSentence(petPlans);
    // A ranked answer's note is the order in the primary's own labels, so the
    // ledger row reads like an answer on its own -- "The room, then the meals"
    // rather than a bare first place that loses the rest of the order.
    if (isRank) {
      const labels = optionLabels(question, listValues);
      if (!labels.length) return null;
      return labels.length === 1 ? labels[0] : labels.join(", then ");
    }
    // A multi answer's note is the ticked labels, joined with a semicolon
    // rather than a comma because the labels have commas of their own ("A
    // hotel, somebody making the bed") and the reader of this row -- the
    // inference layer included -- has to be able to tell where one ends.
    if (isMulti) {
      const labels = optionLabels(question, listValues);
      if (!labels.length) return null;
      return labels.join("; ");
    }
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

    if (isPets) {
      // One fact row per animal, because that is the unit anybody reads them
      // in: a packing list building around the dog should not have to parse a
      // sentence about the cat out of a shared row. The own-words sentence --
      // how they are looked after -- is one more row, kept whole.
      const rows = petPlans.map((row) => ({
        family_id: familyId,
        traveler_id: null,
        kind: "rule",
        slot: slotId,
        body: petClause(row),
        source: "said",
      }));
      if (rawOwnWords) {
        rows.push({
          family_id: familyId,
          traveler_id: null,
          kind: "rule",
          slot: slotId,
          body: rawOwnWords,
          source: "said",
        });
      }
      const { error } = await supabase.from("household_facts").insert(rows);
      if (error) {
        return NextResponse.json(
          { error: "That answer could not be saved. Try again." },
          { status: 500 },
        );
      }
      // And then the same answer where the app actually reads it: on the animal
      // and on the trips. A rule filed as a sentence changes nothing on its own
      // -- the packing list follows the per-trip arrangement, and whether a
      // flight is even a question follows the animal's own record.
      //
      // Deliberately after the facts insert and deliberately unable to fail the
      // request: the answer is saved by this point, and a family should not be
      // told their answer did not save because a packing list could not be
      // brought up to date.
      await placePetPlans({
        supabase,
        familyId,
        pets: petRows || [],
        plans: petPlans,
        words: rawOwnWords,
      });
    } else if (question.kind === "text") {
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
      // A ranked answer is filed as one prose sentence, because Aly reads the
      // travel file as sentences: an array of option values in `body` is a row
      // nothing downstream can read out loud. The sentence names the order and
      // says which items were left unranked, so a later reader cannot mistake
      // "they stopped tapping" for "they care least about this".
      const opt = (question.options || []).find((o) => o.value === rawChoice);
      const somethingElse = !isRank && !isMulti && rawChoice === "other";
      const answerText = isBand
        ? bandSentence(band) || ""
        : isRank
          ? rankSentence(question, listValues) || ""
          : isMulti
            ? multiSentence(question, listValues) || ""
            : somethingElse
              ? rawText
              : opt
                ? opt.label
                : "";
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
          {
            error: isBand
              ? "Set the hours your day runs."
              : isRank
                ? "Tap at least one of these in the order you would protect it."
                : isMulti
                  ? "Tick at least one of these."
                  : "Pick one of the two, or type what fits better.",
          },
          { status: 400 },
        );
      }
      // Topic and topics only exist on travel_preferences, not on
      // household_facts. Every option question in the current interview
      // writes to travel_preferences, but the guard keeps this correct if
      // an option question is ever added that maps to household_facts.
      const writesToPreferences = table === "travel_preferences";
      const topic = writesToPreferences ? topicForSlot(slotId) : null;
      // A worked-out answer is stored as derived, with the sentence explaining
      // where it came from in the reason column. That column normally holds
      // somebody's own words, and pairing it with source 'derived' is what
      // keeps that honest: a reader of the Preferences page sees both the
      // reasoning and the fact that the reasoning is ours rather than theirs.
      const baseRow = {
        family_id: familyId,
        traveler_id: null,
        slot: slotId,
        body: `${question.label}: ${answerText}`,
        source: derivedBecause ? "derived" : "said",
      };
      if (derivedBecause) baseRow.reason = derivedBecause;
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
  // Walked over the questions this family is actually asked, so a household
  // with no animals is never handed "animals" as its next question and is
  // counted finished when it has answered the ones that apply to it.
  const asked = questionsFor({ hasPets: petNames.length > 0 });
  const answeredIndex = asked.findIndex((q) => q.slot === slotId);
  const nextIndex = answeredIndex + 1;
  const done = nextIndex >= asked.length;

  return NextResponse.json({
    ok: true,
    complete: done,
    nextSlot: done ? null : asked[nextIndex].slot,
  });
}
