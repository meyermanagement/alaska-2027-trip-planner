import { coverage, ledgerFor } from "@/lib/travelers/ledger";
import { slotFromWords } from "./slots";

/**
 * An interview run against a copy of the family's record instead of the record.
 *
 * The point is to be able to conduct a whole interview -- real context, real
 * prompt, real toolset, real model -- and read what it would have written
 * without writing any of it. Three bugs in the first interview were only
 * visible in the sequence of turns rather than in any one of them: a reply that
 * saved an answer and asked nothing, a question retired that had never been
 * put, and one answer filed under three blanks. None of those are visible from
 * a single request, and all of them cost real rows if the run is live.
 *
 * So the writes are applied here, to arrays, with the same rules the apply route
 * enforces -- including its refusal to retire a question nobody was asked. The
 * next turn's context is built from the arrays, which is what makes the run a
 * conversation rather than seven unrelated questions.
 */
/** The tools that write the travel file rather than a preference or a fact. */
const FILE_WRITERS = new Set([
  "set_person_details",
  "add_pet",
  "update_pet",
  "set_pet_trip",
  "add_rewards_program",
  "update_rewards_program",
]);

export function rehearsal(
  travelerId,
  { preferences = [], facts = [], slots = [], pets = [] } = {},
) {
  // Copies. The caller's snapshot is what the family actually has, and a
  // rehearsal that mutated it would be the live interview with extra steps.
  const state = {
    preferences: preferences.map((row) => ({ ...row })),
    facts: facts.map((row) => ({ ...row })),
    // The real slot table is deliberately not read: a rehearsal is a rehearsal
    // of this conversation, and starting it mid-way through a real one makes the
    // run unreadable. What the person has already answered still arrives,
    // through the preferences and facts above. What does arrive here is this
    // run's own earlier turns, handed back a turn at a time.
    slots: slots.map((row) => ({ ...row })),
    // Read only so the ledger knows whether the animals question applies. A
    // rehearsal never changes an animal.
    pets: pets.map((row) => ({ ...row })),
    // What would have gone into the travel file: a person's own page, an animal,
    // a rewards program.
    file: [],
  };
  let n = 0;
  // Unique per run of this function, because a live rehearsal builds a new
  // engine every turn and hands the last turn's rows back in: without the stamp,
  // turn five would number its first save the same as turn four's.
  const stamp = Date.now().toString(36);

  /** What the apply route would write, written to the arrays instead. */
  function apply(call) {
    const a = call?.args || {};
    // Same as the live route: a save with no blank named on it has the blank
    // worked out from its words, so a rehearsal shows the coverage a real
    // interview would have produced rather than a flatter one.
    if (
      (call?.name === "add_preference" ||
        call?.name === "record_household_fact") &&
      !a.slot
    ) {
      const guess = slotFromWords(`${a.body || ""} ${a.reason || ""}`);
      if (guess) a.slot = guess;
    }
    if (call?.name === "add_preference") {
      state.preferences.push({
        id: `rehearsal-${stamp}-${++n}`,
        traveler_id: travelerId,
        traveler_ids: [travelerId],
        topic: a.topic || "Who we are",
        topics: [a.topic || "Who we are"],
        body: a.body,
        source: a.source || "said",
        slot: a.slot || null,
        reason: a.reason || null,
      });
      return { saved: true };
    }
    if (call?.name === "record_household_fact") {
      state.facts.push({
        id: `rehearsal-${stamp}-${++n}`,
        traveler_id: travelerId,
        kind: a.kind,
        slot: a.slot || null,
        body: a.body,
        source: a.source || "said",
      });
      return { saved: true };
    }
    if (call?.name === "set_slot_status") {
      const row = state.slots.find(
        (s) => s.slot === a.slot && s.traveler_id === travelerId,
      );
      if (a.status === "skipped" && row?.status !== "asking") {
        return {
          refused:
            "That one had not been asked, so there was nothing to stop asking about.",
        };
      }
      if (row) {
        row.status = a.status;
        if (a.note) row.note = a.note;
      } else {
        state.slots.push({
          traveler_id: travelerId,
          slot: a.slot,
          status: a.status,
          asked_count: 0,
          last_question: null,
          note: a.note || null,
        });
      }
      return { saved: true };
    }
    // Everything that writes the travel file rather than a preference. A
    // rehearsal cannot touch a person, an animal or the Wallet, so the call is
    // reported as what it would have written and nothing changes. Without this
    // the practice page said "nothing would have been written down" on the very
    // turns that were filling the file in.
    if (FILE_WRITERS.has(call?.name)) {
      state.file.push({
        id: `rehearsal-${stamp}-${++n}`,
        tool: call.name,
        args: a,
      });
      return { saved: true, file: true };
    }
    return { ignored: true };
  }

  /**
   * The blank Aly was handed has now been put, in these words.
   *
   * A question mark rather than merely words, for the same reason the chat route
   * wants one: a turn that says "so the afternoon is yours" and stops has not
   * asked anything, and recording it as the question retires a blank nobody was
   * asked about.
   */
  function noteAsked(slot, question) {
    if (!slot || !String(question || "").includes("?")) return false;
    const words = String(question).trim().slice(0, 300);
    const row = state.slots.find(
      (s) => s.slot === slot && s.traveler_id === travelerId,
    );
    // Same rule as the real ledger: a blank this turn settled or waved away is
    // not reopened by the bookkeeping.
    if (row && row.status && row.status !== "asking") return false;
    if (row) {
      row.status = "asking";
      row.asked_count = (row.asked_count || 0) + 1;
      row.last_question = words;
    } else {
      state.slots.push({
        traveler_id: travelerId,
        slot,
        status: "asking",
        asked_count: 1,
        last_question: words,
        note: null,
      });
    }
    return true;
  }

  /** Where the ledger stands, in the shape the page draws. */
  function standing() {
    const entries = ledgerFor(travelerId, state);
    const by = (status) =>
      entries.filter((e) => e.status === status).map((e) => e.slot);
    return {
      known: Math.round(coverage(entries) * 100),
      settled: by("settled"),
      asking: by("asking"),
      skipped: by("skipped"),
      open: by("open"),
    };
  }

  return {
    state,
    apply,
    noteAsked,
    standing,
    /** Only what this run added, so the page is not a dump of the whole file. */
    written: () => ({
      preferences: state.preferences.filter((p) =>
        String(p.id).startsWith("rehearsal-"),
      ),
      facts: state.facts.filter((f) => String(f.id).startsWith("rehearsal-")),
      slots: state.slots,
      file: state.file,
    }),
  };
}
