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
  SLOTS,
  SLOT_BY_ID,
  slotLabel,
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
  { preferences = [], facts = [], slots = [] } = {},
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

  return SLOTS.map((slot) => {
    const found = evidence.get(slot.id) || [];
    const noted = ledger.get(slot.id);
    let status = "open";
    if (found.length) status = "settled";
    else if (noted?.status === "settled")
      status = "open"; // claimed but no row left
    else if (noted?.status) status = noted.status;
    return {
      slot: slot.id,
      label: slot.label,
      kind: slot.kind,
      hard: Boolean(slot.hard),
      why: slot.why,
      status,
      evidence: found,
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
    (e) => e.status === "settled" || e.status === "skipped",
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
    if (e.status === "skipped" && e.note) bits.push(`because ${e.note}`);
    if (e.status === "asking" && e.lastQuestion)
      bits.push(`you asked: “${e.lastQuestion}”`);
    return `- ${bits.join(" · ")}`;
  });

  const head = `\n\nWHAT YOU KNOW ABOUT ${name.toUpperCase()}, AND WHAT YOU DO NOT\n${lines.join("\n")}`;

  if (!next)
    return `${head}\nNothing is open. Do not interview ${name} further; if they tell you something new, save it, but ask nothing.`;

  const hard = HARD_SLOTS.has(next.slot);
  return (
    `${head}\n\nTHE ONE THING TO LEARN IN THIS REPLY: ${next.label.toLowerCase()} (slot id ${next.slot}).\n` +
    `Why it is worth a question: ${next.why}\n` +
    (hard
      ? `This is a rule, not a taste. Ask it plainly and in full — never infer it from a choice — and save it with record_household_fact, kind "rule" or "capability".\n`
      : `Ask it as a concrete choice between two real options rather than as “what do you prefer”, and ask for the reason in their own words. Save what you learn with add_preference, slot "${next.slot}".\n`) +
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
