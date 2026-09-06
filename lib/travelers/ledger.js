// The ledger: what has been asked of whom, what is settled, what is still blank.
//
// The point of this file is that the model does not keep score. A conversation
// with no memory of its own coverage circles the same ground, forgets the boring
// slots, and never knows when to stop; so the app works out the state, hands Aly
// exactly one slot to pursue, and decides when there is enough. Aly chooses the
// wording and the follow-up, which is the part she is good at.
//
// A slot is settled by evidence, not by assertion. If a preference row or a
// household fact carries the slot, it is settled whatever the ledger says --
// which means a row typed by hand on Veda's page counts, and a ledger row can
// never claim an answer that no longer exists.

import {
  HARD_SLOTS,
  SLOT_BY_ID,
  slotsFor,
  slotLabel,
  slotsInWords,
  tableForSlot,
} from "./slots";

/**
 * Work out the state of every slot for one person.
 *
 * @param travelerId  the person, or null for the household's own slots
 * @param rows        { preferences, facts, slots } as read from the database
 * @returns [{ slot, label, kind, hard, status, why, evidence, askedCount,
 *            lastQuestion, note }] in the order the slots are defined
 */
export function ledgerFor(
  travelerId,
  { preferences = [], facts = [], slots = [], pets = [], people = [] } = {},
) {
  const mine = (row) =>
    travelerId
      ? row.traveler_id === travelerId ||
        (Array.isArray(row.traveler_ids) &&
          row.traveler_ids.includes(travelerId))
      : !row.traveler_id &&
        (!Array.isArray(row.traveler_ids) || row.traveler_ids.length === 0);

  const evidence = new Map();
  for (const row of [...preferences, ...facts]) {
    if (!row?.slot || !mine(row)) continue;
    const list = evidence.get(row.slot) || [];
    list.push(row);
    evidence.set(row.slot, list);
  }

  const ledger = new Map();
  for (const row of slots) {
    if (!row?.slot) continue;
    if (travelerId ? row.traveler_id === travelerId : !row.traveler_id)
      ledger.set(row.slot, row);
  }

  // What they have written about themselves in their own words. A blank that a
  // paragraph on their own page already answers is not a blank, and asking it
  // anyway says plainly that nothing they wrote was read. Any free writing counts
  // and more of it is coming -- a favorite day recounted in their own words
  // answers three of these at once -- so this reads a list of writings rather
  // than one field.
  const writings = [];
  const person = people.find((p) => p?.id === travelerId);
  if (person?.about_me)
    writings.push({ text: person.about_me, source: "their own page" });
  for (const extra of person?.writings || [])
    if (extra?.text) writings.push(extra);
  const told = new Map();
  for (const writing of writings)
    for (const hit of slotsInWords(writing.text))
      if (!told.has(hit.slot))
        told.set(hit.slot, { ...hit, source: writing.source || null });

  // The applicable slots, not all of them: a household with no animals is never
  // asked what happens to the animals, and is not marked down for it either.
  return slotsFor({ pets }).map((slot) => {
    const found = evidence.get(slot.id) || [];
    const noted = ledger.get(slot.id);
    const wrote = told.get(slot.id);
    let status = "open";
    if (found.length) status = "settled";
    else if (noted?.status === "settled")
      status = "open"; // claimed but no row left
    else if (noted?.status) status = noted.status;
    // Their own words are weaker evidence than a saved row and stronger than
    // nothing: it stops the question being asked, and it is never allowed to
    // overrule a row they typed or a question they waved away.
    // Only a taste can be retired this way. "Loves horses" is not an answer to
    // what happens to the animals while the family is away, and a rule -- an
    // allergy, a knee, seasickness -- is never inferred from a sentence that
    // happens to mention it. Those get asked plainly whatever the paragraph says.
    if (status === "open" && wrote && slot.kind === "taste" && !slot.hard)
      status = "told";
    return {
      slot: slot.id,
      label: slot.label,
      kind: slot.kind,
      hard: Boolean(slot.hard),
      why: slot.why,
      fills: slot.fills || null,
      status,
      evidence: found,
      wrote: wrote ? { sentence: wrote.sentence, source: wrote.source } : null,
      askedCount: noted?.asked_count || 0,
      lastQuestion: noted?.last_question || null,
      note: noted?.note || null,
    };
  });
}

/** How much of a person's ledger is answered, 0 to 1. */
export function coverage(entries) {
  if (!entries.length) return 0;
  const done = entries.filter(
    (e) =>
      e.status === "settled" || e.status === "skipped" || e.status === "told",
  ).length;
  return done / entries.length;
}

/**
 * The one slot Aly should pursue next for this person, or null when there is
 * nothing left worth asking.
 *
 * Order is the order the slots are declared, with two exceptions. A slot already
 * out as a question is finished before a new one is started, and a slot that has
 * been asked twice without settling is put behind the untouched ones -- somebody
 * who has dodged the same question twice is telling you something, and asking a
 * third time in a row is how a helpful assistant becomes a pest.
 */
export function nextSlot(entries) {
  const open = entries.filter(
    (e) => e.status === "open" || e.status === "asking",
  );
  if (!open.length) return null;
  const asking = open.find((e) => e.status === "asking" && e.askedCount < 2);
  if (asking) return asking;
  const fresh = open.find((e) => e.askedCount === 0);
  return fresh || open[0];
}

const STATUS_WORDS = {
  settled: "settled",
  asking: "asked, still waiting",
  skipped: "waved off",
  told: "answered in their own words",
  open: "never asked",
};

/**
 * The ledger as Aly reads it: one line per slot, the settled ones quoting what
 * was learned so she cannot ask again, and exactly one slot named as the thing to
 * pursue in this reply.
 */
export function ledgerSection(name, entries, { limit = 240 } = {}) {
  if (!entries?.length) return "";
  const next = nextSlot(entries);
  const lines = entries.map((e) => {
    const bits = [`${e.label} — ${STATUS_WORDS[e.status]}`];
    if (e.status === "settled")
      bits.push(
        e.evidence
          .map((row) => `“${String(row.body || "").slice(0, limit)}”`)
          .join("; "),
      );
    if (e.status === "told" && e.wrote)
      bits.push(
        `they wrote: “${String(e.wrote.sentence).slice(0, limit)}” — do not ask this; build on it if it comes up`,
      );
    if (e.status === "skipped" && e.note) bits.push(`because ${e.note}`);
    if (e.status === "asking" && e.lastQuestion)
      bits.push(`you asked: “${e.lastQuestion}”`);
    return `- ${bits.join(" · ")}`;
  });

  let head = `\n\nWHAT YOU KNOW ABOUT ${name.toUpperCase()}, AND WHAT YOU DO NOT\n${lines.join("\n")}`;
  // A blank answered by a paragraph they wrote is answered. It is not yet a saved
  // preference, though, and the rest of the app reads rows rather than paragraphs
  // -- so if one of them comes up in the conversation on its own, it is worth
  // writing down properly, with their own sentence as the reason.
  if (entries.some((e) => e.status === "told"))
    head += `\nThe lines marked “answered in their own words” came from what ${name} wrote about themselves. Never put those questions to them. If one comes up anyway, save it with add_preference against its slot, quoting their own sentence as the reason.`;

  if (!next)
    return `${head}\nNothing is open. Do not interview ${name} further; if they tell you something new, save it, but ask nothing.`;

  const hard = HARD_SLOTS.has(next.slot);
  return (
    `${head}\n\nTHE ONE THING TO LEARN IN THIS REPLY: ${next.label.toLowerCase()} (slot id ${next.slot}).\n` +
    `Why it is worth a question: ${next.why}\n` +
    // The interview used to end at a preference row, which left the travel file
    // exactly as empty as it found it. What they say here is often a record: a
    // language, a program, a piece of equipment, an animal that stays home.
    (next.fills
      ? `WRITE IT INTO THE FILE, NOT ONLY INTO A PREFERENCE: ${next.fills} Do both in the same turn when the answer carries both.\n`
      : "") +
    `NEVER ASK WHAT THE FILE ALREADY HOLDS. Who is in the family, how many of them, their ages, what animals they have, whose passport expires when: all of that is above, and asking for it tells them nothing is being read.\n` +
    (hard
      ? `This is a rule, not a taste. Ask it plainly and in full — never infer it from a choice — and save it with record_household_fact, kind "rule" or "capability".\n`
      : `Ask it as a concrete choice between two real options rather than as “what do you prefer”, and ask for the reason in their own words. Save what you learn with add_preference, slot "${next.slot}".\n`) +
    `EVERY REPLY ENDS IN A QUESTION, IN WORDS. Saving what they just told you is not a reply: a turn whose words are empty because everything went into tool arguments shows them a card to approve and asks them nothing, and the interview stops there. Say what you took from their answer in a line, then put the next question.\n` +
    `SAVE AN ANSWER AGAINST THE ONE QUESTION IT ANSWERS. Filing the same sentence under a second and third slot makes the ledger look fuller while telling you nothing new, and it puts words in their mouth about questions nobody put to them. A slot they were never asked stays open.\n` +
    `THE QUESTION GOES IN YOUR REPLY, IN WORDS. set_slot_status only records that you asked it \u2014 a turn whose reply is empty because the question went into a tool argument asks them nothing, and they see a card instead of a question. Write the question out, then record it.\n` +
    `Ask about this one thing and nothing else. One question, then stop and wait. If they answer something you did not ask, save that too. ` +
    `If they wave the question away, call set_slot_status with status "skipped" and their reason, and do not raise it again.` +
    (next.askedCount
      ? ` You have already asked this ${next.askedCount === 1 ? "once" : `${next.askedCount} times`}; ask it differently or let it go.`
      : "")
  );
}

/** A one-line summary of every person, for the screens that are not about one. */
export function rosterLines(people, data) {
  return people
    .map((p) => {
      const entries = ledgerFor(p.id, data);
      const pct = Math.round(coverage(entries) * 100);
      const blank = entries
        .filter((e) => e.status === "open")
        .map((e) => e.slot);
      return `- ${p.name}: ${pct}% of what is worth knowing${
        blank.length ? `, still blank on ${blank.join(", ")}` : ", nothing open"
      }`;
    })
    .join("\n");
}

export { slotLabel, tableForSlot, SLOT_BY_ID };

/**
 * Write down that a question was put, and in what words.
 *
 * The app's job rather than Aly's. She is handed one blank per interview turn;
 * if she comes back with words, those words were the question, and this records
 * it so tomorrow's conversation neither raises it again nor phrases it the same
 * way. Upserted by hand because uniqueness here is two partial indexes -- a
 * household question has no person -- which a plain upsert cannot infer.
 */
export async function noteAsked(
  supabase,
  { familyId, travelerId, slot, question, userId },
) {
  if (!familyId || !slot) return null;
  const finder = supabase
    .from("traveler_slots")
    .select("id, asked_count, status")
    .eq("family_id", familyId)
    .eq("slot", slot);
  const { data: existing } = await (
    travelerId
      ? finder.eq("traveler_id", travelerId)
      : finder.is("traveler_id", null)
  ).maybeSingle();
  const last_question = String(question || "")
    .trim()
    .slice(0, 300);
  // A blank the same turn just settled or waved away is not a blank that was
  // asked about. The app records the question against whichever blank was handed
  // over at the top of the turn, and a model that skips that blank and asks about
  // another one had its skip undone here one line later: mornings went to
  // "skipped" and came straight back to "asking", so the next turn aimed at it
  // again and the interview asked the same thing three times.
  if (existing && existing.status && existing.status !== "asking") return null;
  if (existing) {
    return supabase
      .from("traveler_slots")
      .update({
        status: "asking",
        last_question,
        asked_count: (existing.asked_count || 0) + 1,
        updated_at: new Date().toISOString(),
        updated_by: userId || null,
      })
      .eq("id", existing.id);
  }
  return supabase.from("traveler_slots").insert({
    family_id: familyId,
    traveler_id: travelerId || null,
    slot,
    status: "asking",
    last_question,
    asked_count: 1,
    updated_by: userId || null,
  });
}

/**
 * Write down that a blank is answered, when the answer went somewhere the ledger
 * does not look.
 *
 * The ledger settles a blank on the evidence of a preference or a fact carrying
 * its id. That is right for taste and wrong for the blanks whose answers belong in
 * the file: "Storm stays home with our neighbor Kim" is properly written onto the
 * horse with update_pet, and the ledger then reads the blank as never asked and
 * Aly asks about the horse again on the next turn.
 */
export async function markSettled(
  supabase,
  { familyId, travelerId, slot, userId },
) {
  if (!familyId || !slot) return null;
  const finder = supabase
    .from("traveler_slots")
    .select("id, status")
    .eq("family_id", familyId)
    .eq("slot", slot);
  const { data: existing } = await (
    travelerId
      ? finder.eq("traveler_id", travelerId)
      : finder.is("traveler_id", null)
  ).maybeSingle();
  // A blank they waved away stays waved away: an answer that arrives later is
  // welcome, but nothing here should quietly reopen or overwrite their "no".
  if (existing?.status === "skipped") return null;
  if (existing) {
    return supabase
      .from("traveler_slots")
      .update({
        status: "settled",
        updated_at: new Date().toISOString(),
        updated_by: userId || null,
      })
      .eq("id", existing.id);
  }
  return supabase.from("traveler_slots").insert({
    family_id: familyId,
    traveler_id: travelerId || null,
    slot,
    status: "settled",
    asked_count: 0,
    updated_by: userId || null,
  });
}
