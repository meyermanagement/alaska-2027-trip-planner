// The items a packing list is not allowed to be missing.
//
// Everything else about a packing list is judgment, and judgment is what the
// model in generate.js is for: how many layers Alaska wants in August, whether a
// nine-year-old needs a rash guard, how many pairs of socks is honest. Getting
// those slightly wrong costs nothing — you buy socks there.
//
// A handful of items are not like that. Forget the passport and the trip ends at
// a check-in desk. Those items are all decided by things the app already knows as
// data rather than as prose: trip_facts.leaves_country says whether a border is
// involved, and the itinerary's own categories say whether anybody is flying or
// boarding a ship. So they should not be a request in a prompt, which is a hope,
// but a pass over the finished list, which is a guarantee — and one that can be
// tested, which prompt behavior really cannot be.
//
// Two things this deliberately does NOT do:
//
//   - It never guesses. leaves_country is a boolean OR null, and null means
//     nobody has researched this trip yet — four of the family's trips are in
//     that state today. A null trip gets no passport line, because inventing one
//     for a domestic weekend teaches the family to ignore the list. The question
//     is asked out loud instead, as a pre-departure task, by lib/tasks/floor.js.
//   - It never duplicates. Every rule carries the pattern that means "the list
//     already covers this", matched across the whole list rather than within one
//     category, so a list that already says "Passports" is left exactly as it is.
//     Matching on meaning rather than on string equality is the point: the model
//     writes "Passports", a template writes "Passport", and both are the item.

const HOME_PLUG_TYPES = ["A", "B"];

/** "Type C" and "C" and "type c" are one plug. */
function plugKey(value) {
  return String(value || "")
    .replace(/type/i, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

function plugLabel(value) {
  const key = plugKey(value);
  return key ? `Type ${key}` : "";
}

function list(values) {
  const rows = (values || [])
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (rows.length <= 1) return rows[0] || "";
  if (rows.length === 2) return `${rows[0]} and ${rows[1]}`;
  return `${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]}`;
}

/**
 * Currencies come off the fact sheet as objects, but a model that has been asked
 * for a list of currencies will sometimes hand back plain strings, and the column
 * is jsonb so both arrive intact. Read both shapes.
 */
export function currencyList(facts) {
  const raw = facts?.currencies;
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const row of raw) {
    if (typeof row === "string") {
      const name = row.trim().slice(0, 60);
      if (name) out.push({ code: "", name });
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const code = String(row.code || "")
      .trim()
      .toUpperCase()
      .slice(0, 6);
    const name = String(row.name || "")
      .trim()
      .slice(0, 60);
    if (code || name) out.push({ code, name: name || code });
  }
  return out;
}

/** Currencies that are not the dollar the family already carries. */
export function foreignCurrencies(facts) {
  const rows = currencyList(facts);
  if (!rows) return null;
  return rows.filter(
    (c) => c.code !== "USD" && !/^(us )?dollars?$/i.test(c.name),
  );
}

/**
 * What the app knows structurally about a trip, as opposed to what it could
 * infer from the destination text. Both floors read this, so they can never
 * disagree with each other about whether somebody is flying.
 *
 * @returns {{
 *   international: boolean|null,  null when trip_facts has never been researched
 *   flying: boolean,
 *   cruising: boolean,
 *   foreignPlugs: string[],
 *   currencies: {code:string,name:string}[]|null
 * }}
 */
export function tripSignals({ facts = null, itinerary = [] } = {}) {
  const categories = new Set(
    (itinerary || []).map((i) => String(i?.category || "").toLowerCase()),
  );
  const foreignPlugs = (facts?.plug_types || [])
    .map(plugKey)
    .filter((key) => key && !HOME_PLUG_TYPES.includes(key))
    .map((key) => plugLabel(key));
  return {
    international:
      typeof facts?.leaves_country === "boolean" ? facts.leaves_country : null,
    flying: categories.has("flight"),
    cruising: categories.has("cruise"),
    foreignPlugs: [...new Set(foreignPlugs)],
    currencies: foreignCurrencies(facts),
  };
}

/**
 * The rules themselves. Each one says when it applies, what it would add, and
 * how to recognize that the list already has it.
 *
 * Order matters only in that it is the order the additions appear in, so
 * documents come before equipment.
 */
const RULES = [
  {
    id: "passport",
    applies: (s) => s.international === true,
    already: (text) => /passport/.test(text),
    rows: ({ going }) => {
      const names = (going || [])
        .map((p) => String(p?.name || "").trim())
        .filter((n) => n && n !== "Shared");
      if (!names.length) {
        return [
          {
            item: "Passports for everybody going",
            category: "Documents",
            assignee: "Shared",
            quantity: null,
          },
        ];
      }
      return names.map((name) => ({
        item: "Passport",
        category: "Documents",
        assignee: name,
        quantity: null,
      }));
    },
  },
  {
    id: "boarding",
    applies: (s) => s.flying,
    already: (text) => /boarding pass/.test(text),
    rows: () => [
      {
        item: "Boarding passes, on a phone and printed",
        category: "Travel Day & Carry-On",
        assignee: "Shared",
        quantity: null,
      },
    ],
  },
  {
    id: "photo_id",
    applies: (s) => s.flying,
    already: (text) =>
      /photo id|photo identification|driver'?s licen|real ?id/.test(text),
    rows: () => [
      {
        item: "Photo ID for each adult flying",
        category: "Documents",
        assignee: "Shared",
        quantity: null,
      },
    ],
  },
  {
    id: "cruise_docs",
    applies: (s) => s.cruising,
    already: (text) =>
      /cruise (check-?in|document|boarding)|boarding document|luggage tag|set ?sail/.test(
        text,
      ),
    rows: () => [
      {
        item: "Cruise boarding documents and luggage tags",
        category: "Documents",
        assignee: "Shared",
        quantity: null,
      },
    ],
  },
  {
    id: "adapter",
    applies: (s) => s.foreignPlugs.length > 0,
    already: (text) =>
      /(plug|travel|power|universal|outlet) adapter/.test(text),
    rows: ({ signals }) => [
      {
        item: `Plug adapter for ${list(signals.foreignPlugs)} outlets`,
        category: "Electronics",
        assignee: "Shared",
        quantity: null,
      },
    ],
  },
];

/** The haystack a rule is matched against: every item on the list, lowercased. */
function haystack(items) {
  return (items || [])
    .map((row) => String(row?.item || "").toLowerCase())
    .join(" | ");
}

/**
 * What this trip must contain, minus whatever the list already covers.
 *
 * @param items  the list as it stands — the model's answer, or the base template
 *               when the model was unavailable. The floor applies to both,
 *               because a template copied on a Tuesday knows nothing about the
 *               trip it was copied onto.
 * @returns rows in packing_items shape, ready to append, plus the rule ids that
 *          fired so the caller can say what it did rather than adding lines
 *          silently.
 */
export function packingFloor({
  facts = null,
  itinerary = [],
  going = [],
  items = [],
} = {}) {
  const signals = tripSignals({ facts, itinerary });
  const text = haystack(items);
  const rows = [];
  const fired = [];
  for (const rule of RULES) {
    if (!rule.applies(signals)) continue;
    if (rule.already(text)) continue;
    const produced = rule.rows({ signals, going }).filter(Boolean);
    if (!produced.length) continue;
    fired.push(rule.id);
    rows.push(...produced);
  }
  return { rows, fired, signals };
}

/**
 * The finished list, with the floor in it and the categories still grouped.
 *
 * Appending would leave a lone "Documents" row at the bottom under the
 * electronics, so the categories are regrouped afterwards in the order they
 * first appeared — the same rule generate.js already uses on the model's answer.
 */
export function applyPackingFloor({
  items = [],
  facts = null,
  itinerary = [],
  going = [],
} = {}) {
  const { rows, fired, signals } = packingFloor({
    facts,
    itinerary,
    going,
    items,
  });
  if (!rows.length) return { items, added: [], fired, signals };

  const merged = [...items, ...rows];
  const order = [];
  for (const row of merged) {
    const category = row?.category || "Other";
    if (!order.includes(category)) order.push(category);
  }
  merged.sort(
    (a, b) =>
      order.indexOf(a?.category || "Other") -
      order.indexOf(b?.category || "Other"),
  );
  return { items: merged, added: rows, fired, signals };
}

/**
 * The block the model sees, so its own answer arrives already knowing these
 * things. The floor still runs afterwards — telling a model a passport is
 * required is a request, and this is the belt to the floor's braces — but a model
 * that has been told the trip crosses a border also writes better lines about
 * everything else, which no post-pass can do for it.
 */
export function factsLines(facts, itinerary = []) {
  const signals = tripSignals({ facts, itinerary });
  const lines = [];
  if (signals.international === true) {
    const countries = (facts?.countries || []).filter(
      (c) => !/^united states$/i.test(String(c || "")),
    );
    lines.push(
      `- This trip leaves the United States${countries.length ? ` (${list(countries)})` : ""}. Everybody going needs a passport.`,
    );
  } else if (signals.international === false) {
    lines.push("- This trip stays inside the United States.");
  }
  if (signals.flying) lines.push("- At least one flight is booked.");
  if (signals.cruising) lines.push("- Part of this trip is on a ship.");
  if (signals.foreignPlugs.length) {
    lines.push(
      `- The outlets there are ${list(signals.foreignPlugs)}${facts?.mains_voltage ? `, ${facts.mains_voltage}` : ""}.`,
    );
  }
  if (signals.currencies?.length) {
    lines.push(
      `- The money there is ${list(signals.currencies.map((c) => c.name))}.`,
    );
  }
  if (facts?.entry_note) {
    lines.push(`- Entry: ${String(facts.entry_note).slice(0, 300)}`);
  }
  return lines.length ? ["WHAT THE APP KNOWS ABOUT THIS TRIP:", ...lines] : [];
}
