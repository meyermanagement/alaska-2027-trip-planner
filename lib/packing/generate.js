// Building a packing list for a new trip out of what the family already has.
//
// The honest version of "auto-generate from previous trips, location, and time
// of year": the base template is the floor, the packing lists of trips they have
// actually taken are the evidence, and the destination and month are the reason
// anything gets added or left out. A model does the last step, but it is only
// ever allowed to return items — no free text reaches the app, and nothing is
// written unless it parses.
//
// If the model is unavailable, over quota, or returns something unusable, this
// falls back to copying the base template, which is exactly what the app did
// before. A new trip never ends up with an empty packing list because a model
// was having a bad day.

import { generate } from "@/lib/agent/llm";
import { topicsOf } from "../preferences/topics";
import { ageLines } from "@/lib/travelers/ages";
import { genderLines } from "@/lib/travelers/profile";
import { applyPackingFloor, factsLines } from "./floor";
import { looksLastMinute } from "./lastMinute";
import { itemKey, owner } from "./propagate";
import { idsOf, prefsForTrip } from "../preferences/scope";

const MAX_ITEMS = 90;
const MAX_PAST_TRIPS = 6;
const MAX_ITEMS_PER_PAST_TRIP = 40;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthName(date) {
  if (!date) return null;
  const n = Number(String(date).slice(5, 7));
  return MONTHS[n - 1] || null;
}

function nights(start, end) {
  if (!start || !end) return null;
  const ms = new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`);
  const n = Math.round(ms / 86400000);
  return n > 0 ? n : null;
}

function text(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * @param replace  When true the trip already has a list — the base template,
 *                 copied the moment the trip was created — and this is the
 *                 upgrade pass. The old rows are only removed once a better
 *                 list exists to put in their place, so the trip is never left
 *                 without one.
 * @returns {{ count: number, source: "generated" | "template" | "kept" | "none" }}
 */
/**
 * The preferences that should shape this trip's list: the family's own, plus the
 * ones belonging to anybody going. Matched on id rather than name, because a
 * preference can belong to two people now and an embedded join only ever
 * returned one of them. Nobody on the roster means nobody has been added yet,
 * not that nobody is going, so nothing is filtered.
 */
function relevantPrefs(preferences, goingRows) {
  return prefsForTrip(preferences || [], idsOf(goingRows || []));
}

/**
 * Whether a row being written cannot be packed ahead.
 *
 * A template row carries a person's answer, including a deliberate "no", so it is
 * taken as given. A row the model wrote or the floor filed has no answer at all,
 * and its name is the only evidence there is -- which is enough for medication,
 * a toothbrush or a boarding pass, and is one tap to fix when it is wrong.
 */
function lastMinuteFor(item) {
  if (typeof item?.last_minute === "boolean") return item.last_minute;
  return looksLastMinute(item?.item);
}

export async function buildPackingList({
  supabase,
  trip,
  travelerNames,
  replace = false,
}) {
  const names = travelerNames?.length ? travelerNames : ["Shared"];
  const allowed = Array.from(new Set([...names, "Shared"]));

  const today = new Date().toISOString().slice(0, 10);

  const [
    tplRes,
    linkRes,
    pastRes,
    prefRes,
    peopleRes,
    factsRes,
    itinRes,
    heldRes,
  ] = await Promise.all([
    // Every template the family has, not just the base one. A trip can be a
    // cruise and a Disney trip at once, and until trip_templates existed there
    // was no way to say so -- the generator asked for is_base and nothing
    // else, so an add-on had no route onto a new trip at all. Pet templates are
    // left out here: whether the dog's things are packed follows from whether
    // the dog is coming, which trip_pets already answers.
    supabase
      .from("packing_templates")
      .select("id, name, is_base")
      .eq("family_id", trip.family_id)
      .is("pet_id", null),
    supabase
      .from("trip_templates")
      .select("template_id")
      .eq("trip_id", trip.id),
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, status")
      .lt("end_date", today)
      .neq("id", trip.id)
      .order("end_date", { ascending: false })
      .limit(MAX_PAST_TRIPS),
    // Whose each one is, so a preference about somebody staying home does not
    // put anything in this trip's suitcase.
    supabase
      .from("travel_preferences")
      .select(
        "topic, topics, body, traveler_id, traveler_ids, travelers (id, name)",
      )
      .limit(40),
    // Birthdays, so the list is written for the ages they will be on the plane.
    // A twelve-year-old and a two-year-old pack nothing alike, and the number in
    // everybody's head is the number today rather than the number by then.
    supabase
      .from("travelers")
      .select("id, name, is_person, date_of_birth, gender")
      .eq("family_id", trip.family_id),
    // The fact sheet, which knows whether this trip crosses a border. Until now
    // the packing prompt never saw it, so a passport arrived only if the model
    // recognized the destination — which it usually does, and usually is not
    // good enough for the one item that ends a trip. See lib/packing/floor.js.
    supabase
      .from("trip_facts")
      .select("*")
      .eq("trip_id", trip.id)
      .maybeSingle(),
    // Categories only. "Is anybody flying" is a query, not a guess.
    supabase.from("itinerary_items").select("category").eq("trip_id", trip.id),
    // What the trip already has, so the floor can be applied to a list it did
    // not build — including the one it leaves alone when the model is down.
    supabase
      .from("packing_items")
      .select("item")
      .eq("trip_id", trip.id)
      .is("stashed_at", null),
  ]);

  const facts = factsRes.data || null;
  const itinerary = itinRes.data || [];
  const held = heldRes.data || [];

  // The base list, and the add-ons this trip says it uses. The base is always in;
  // the add-ons are the choice, which is why the link table records only those.
  const allTemplates = tplRes.data || [];
  const chosenIds = new Set(
    (linkRes.data || []).map((r) => r.template_id).filter(Boolean),
  );
  const baseTemplate = allTemplates.find((t) => t.is_base) || null;
  const addOns = allTemplates.filter((t) => !t.is_base && chosenIds.has(t.id));
  const wanted = [baseTemplate, ...addOns].filter(Boolean);

  const { data: allTemplateRows } = wanted.length
    ? await supabase
        .from("packing_template_items")
        .select(
          "template_id, category, item, assignee, quantity, sort_order, last_minute",
        )
        .in(
          "template_id",
          wanted.map((t) => t.id),
        )
        .order("sort_order", { ascending: true })
    : { data: [] };

  const rowsFor = (id) =>
    (allTemplateRows || []).filter((r) => r.template_id === id);
  const templateItems = baseTemplate ? rowsFor(baseTemplate.id) : [];
  // Each add-on kept under its own name, because "this is also a cruise" is worth
  // saying to the model rather than pouring every list into one heap.
  const addOnLists = addOns
    .map((t) => ({ name: t.name, items: rowsFor(t.id) }))
    .filter((t) => t.items.length);

  const past = pastRes.data || [];
  const { data: pastItems } = past.length
    ? await supabase
        .from("packing_items")
        .select("trip_id, category, item")
        .is("stashed_at", null)
        .in(
          "trip_id",
          past.map((t) => t.id),
        )
    : { data: [] };

  const going = (peopleRes.data || []).filter((p) => allowed.includes(p?.name));

  const generated = await askModel({
    trip,
    allowed,
    going,
    facts,
    itinerary,
    templateItems: templateItems || [],
    addOnLists,
    past,
    pastItems: pastItems || [],
    preferences: relevantPrefs(prefRes.data || [], going),
  });

  // Nothing better than what is already there, so leave the list alone -- but
  // the mandatory items are not part of that bargain. A list kept because the
  // model was over quota is still a list that has to contain the passport, so the
  // floor is checked against what is on the trip now and only the gaps are added.
  if (replace && !generated.length) {
    const floorOnly = applyPackingFloor({
      items: held,
      facts,
      itinerary,
      going,
    }).added;
    if (!floorOnly.length) return { count: 0, source: "kept" };
    const start = held.length;
    const { error: floorError } = await supabase.from("packing_items").insert(
      floorOnly.map((item, i) => ({
        trip_id: trip.id,
        category: item.category || null,
        item: item.item,
        assignee: item.assignee || "Shared",
        quantity: item.quantity || null,
        last_minute: lastMinuteFor(item),
        from_template: false,
        sort_order: start + i + 1,
      })),
    );
    return {
      count: 0,
      source: "kept",
      floored: floorError ? 0 : floorOnly.length,
    };
  }

  // Which of the lines about to be written are template lines. Worked out by
  // matching rather than by which branch we came down, because the model
  // reproducing a template line verbatim IS that template line as far as
  // "propagate my template changes" is concerned -- and a floor item or an
  // invention is not.
  // Add-on lines count too: an item is a template line because a template holds
  // it, not because of which list it came off.
  const templateKeys = new Set(
    (allTemplateRows || []).map((row) => itemKey(row)).filter(Boolean),
  );

  // Whose a template line is, indexed by the item's name alone. Ownership on a
  // standing list is a decision somebody made once and expects to hold; the model
  // is writing the list, not re-deciding who packs the power strip. Without this
  // the model's guess wins, and because the key above includes the owner, its
  // guess is not even recognized as the template line it plainly is -- so the
  // line loses its template standing, a later push adds the correctly-owned copy
  // beside it, and the list carries the same object twice under two names.
  //
  // Only unambiguous names are corrected. "Waterproof rain shell" is on the list
  // three times, once per person, and a name that maps to several owners is one
  // the model is right to split; the same name owned differently on two different
  // templates is a disagreement between two standing lists, which is not the
  // generator's to settle either.
  const named = (value) =>
    String(value ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const ownerByName = new Map();
  for (const row of allTemplateRows || []) {
    const name = named(row?.item);
    if (!name) continue;
    const who = owner(row);
    if (!ownerByName.has(name)) ownerByName.set(name, who);
    else if (ownerByName.get(name) !== who) ownerByName.set(name, null);
  }
  const goingNames = new Set(allowed.map((n) => named(n)));
  const templateOwner = (item) => {
    const name = named(item?.item);
    if (!name) return null;
    const who = ownerByName.get(name) || null;
    // A standing list outranks the model on who owns a line, but not on who is
    // on the trip. If the list gives an item to somebody staying home, the
    // roster is the authority and the model's answer stands.
    if (!who || !goingNames.has(named(who))) return null;
    return who;
  };

  // What to write when the model is unavailable. It used to be the base list; it
  // is now the base list plus the add-ons this trip chose, deduplicated, because a
  // cruise with no model available is still a cruise.
  const fallback = [];
  const seenFallback = new Set();
  for (const row of [
    ...(templateItems || []),
    ...addOnLists.flatMap((t) => t.items),
  ]) {
    const k = itemKey(row);
    if (!k || seenFallback.has(k)) continue;
    seenFallback.add(k);
    fallback.push(row);
  }

  const chosen = applyPackingFloor({
    items: generated.length ? generated : fallback,
    facts,
    itinerary,
    going,
  });

  const rows = chosen.items.map((item, i) => {
    const settled = {
      ...item,
      assignee: templateOwner(item) || item.assignee || "Shared",
    };
    return {
      trip_id: trip.id,
      category: settled.category || null,
      item: settled.item,
      assignee: settled.assignee,
      quantity: settled.quantity || null,
      last_minute: lastMinuteFor(settled),
      // Computed after the owner is settled, so a line the template owns is
      // recognized as a template line even when the model handed it to somebody
      // else.
      from_template: templateKeys.has(itemKey(settled)),
      sort_order: i + 1,
    };
  });

  if (!rows.length) return { count: 0, source: "none" };

  if (replace) {
    const { error: clearError } = await supabase
      .from("packing_items")
      .delete()
      .eq("trip_id", trip.id)
      .eq("is_packed", false)
      // Somebody's set-aside lines are waiting to come back with them; a rebuild
      // of the live list is not a reason to destroy them.
      .is("stashed_at", null);
    if (clearError) return { count: 0, source: "kept" };
  }

  const { error } = await supabase.from("packing_items").insert(rows);
  if (error) return { count: 0, source: "none" };

  return {
    count: rows.length,
    source: generated.length ? "generated" : "template",
    floored: chosen.added.length,
  };
}

// Returns a clean list of items, or an empty array for every kind of failure.
// A packing list is not worth breaking trip creation over.
async function askModel({
  trip,
  allowed,
  going = [],
  templateItems,
  addOnLists = [],
  past,
  pastItems,
  preferences,
  facts = null,
  itinerary = [],
}) {
  const lines = [];

  lines.push(`TRIP: ${trip.name}`);
  lines.push(`WHERE: ${trip.destination || "not recorded yet"}`);
  const month = monthName(trip.start_date);
  const nightCount = nights(trip.start_date, trip.end_date);
  lines.push(
    trip.start_date
      ? `WHEN: ${month} ${String(trip.start_date).slice(0, 4)}${
          nightCount ? `, ${nightCount} nights` : ""
        }`
      : "WHEN: no dates set yet — assume nothing about the season",
  );
  if (trip.summary) lines.push(`ABOUT: ${text(trip.summary, 300)}`);
  lines.push(`WHO IS PACKING: ${allowed.join(", ")}`);
  lines.push(...ageLines(going, trip.start_date));
  // What somebody recorded about themselves, where it changes an item rather than
  // where it is merely known. Razors, swimwear, what a formal night means in
  // practice -- and nothing at all for the people who left it blank.
  lines.push(...genderLines(going));
  // Whether a border is involved, whether anybody is flying, what the outlets
  // are. Structured answers rather than an inference off the destination string --
  // the Disney trip is international because the ship calls at Nassau, which no
  // amount of reading "Walt Disney World" will tell you.
  const line = (i) =>
    `- ${i.category ? `[${i.category}] ` : ""}${i.item}${
      i.assignee ? ` — ${i.assignee}` : ""
    }${i.quantity ? ` ×${i.quantity}` : ""}`;

  const factsBlock = factsLines(facts, itinerary);
  if (factsBlock.length) {
    lines.push("");
    lines.push(...factsBlock);
  }

  if (templateItems.length) {
    lines.push("");
    lines.push(
      "THE FAMILY'S BASE PACKING TEMPLATE (what they take on every trip — keep all of it unless this trip makes an item pointless):",
    );
    for (const i of templateItems.slice(0, 120)) {
      lines.push(line(i));
    }
  }

  // The add-on lists this trip says it uses, each under its own name. A trip that
  // is a cruise and a Disney trip gets both, which is the whole point of the link
  // table -- and naming them matters, because "Cruise Add-ons" tells the model
  // what kind of trip this is in a way a loose pile of items does not.
  for (const t of addOnLists) {
    if (!t.items.length) continue;
    lines.push("");
    lines.push(
      `ALSO A ${t.name.toUpperCase()} TRIP — the family keeps this add-on list for trips like this one, and chose it for this trip (keep all of it unless this trip makes an item pointless):`,
    );
    for (const i of t.items.slice(0, 120)) {
      lines.push(line(i));
    }
  }

  const byTrip = new Map();
  for (const i of pastItems) {
    const list = byTrip.get(i.trip_id) || [];
    if (list.length < MAX_ITEMS_PER_PAST_TRIP) {
      list.push(i.category ? `${i.item} [${i.category}]` : i.item);
      byTrip.set(i.trip_id, list);
    }
  }
  const withItems = past.filter((t) => byTrip.get(t.id)?.length);
  if (withItems.length) {
    lines.push("");
    lines.push(
      "WHAT THEY ACTUALLY PACKED ON PAST TRIPS (evidence, not a rule — note which trips resemble this one):",
    );
    for (const t of withItems) {
      const when = monthName(t.start_date);
      lines.push(
        `- ${t.name}${t.destination ? `, ${t.destination}` : ""}${
          when ? `, ${when}` : ""
        }: ${byTrip.get(t.id).join("; ")}`,
      );
    }
  }

  if (preferences.length) {
    lines.push("");
    lines.push(
      "THEIR TRAVEL PREFERENCES (a name means it is that person\u2019s own; the rest are the family\u2019s):",
    );
    for (const p of preferences.slice(0, 40)) {
      const who = p.travelers?.name ? `${p.travelers.name} \u2014 ` : "";
      lines.push(
        `- ${who}${topicsOf(p).length ? `${topicsOf(p).join(", ")}: ` : ""}${text(p.body, 220)}`,
      );
    }
  }

  const system = [
    "You build packing lists for one family's private trip planner.",
    "",
    "Return ONLY a JSON array. No prose, no markdown, no code fence. Each element:",
    '{"item": string, "category": string, "assignee": string, "quantity": string}',
    "",
    "Rules:",
    `- assignee must be exactly one of: ${allowed.join(", ")}. Use "Shared" for anything the family shares.`,
    '- quantity is short free text ("3", "2 pairs") or an empty string when it does not matter.',
    "- category groups the list on screen. Reuse the categories already in their template and past lists rather than inventing parallel ones.",
    `- Between 25 and ${MAX_ITEMS} items. Never repeat an item within a category.`,
    "- Start from the base template AND every add-on list above — a trip that is both a cruise and a theme-park trip needs both — then add what this destination and time of year specifically need, and what they packed on past trips that resemble this one.",
    "- Leave out anything the destination or season makes pointless.",
    "- Be concrete. 'Rain shell' not 'appropriate outerwear'. No advice, no reminders, no bookings, no tasks — physical things that go in a bag.",
  ].join("\n");

  let result;
  try {
    result = await generate({
      system,
      messages: [{ role: "user", text: lines.join("\n") }],
      temperature: 0.3,
    });
  } catch {
    return [];
  }

  return clean(result?.text, allowed);
}

function clean(raw, allowed) {
  if (typeof raw !== "string") return [];
  // Models sometimes fence the JSON despite being told not to.
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const lower = new Map(allowed.map((n) => [n.toLowerCase(), n]));
  const seen = new Set();
  const out = [];

  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const item = text(row.item, 120);
    if (!item) continue;
    const category = text(row.category, 60) || "Other";
    const key = `${category.toLowerCase()}|${item.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      item,
      category,
      assignee: lower.get(text(row.assignee, 60).toLowerCase()) || "Shared",
      quantity: text(row.quantity, 20) || null,
    });
    if (out.length >= MAX_ITEMS) break;
  }

  // Keep categories together in the order they first appeared.
  const order = [];
  for (const row of out) {
    if (!order.includes(row.category)) order.push(row.category);
  }
  out.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));

  return out.length >= 5 ? out : [];
}
