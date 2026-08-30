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
 * ones belonging to the people going. Matched on name, because that is what a
 * packing list is addressed to. Nobody on the roster means nobody has been added
 * yet, not that nobody is going, so nothing is filtered.
 */
function relevantPrefs(preferences, rosterNames) {
  const going = new Set(
    (rosterNames || []).filter((n) => n && n !== "Shared").map(String),
  );
  if (!going.size) return preferences;
  return preferences.filter((p) => {
    const who = p?.travelers?.name;
    return !p?.traveler_id || !who || going.has(who);
  });
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

  const [tplRes, pastRes, prefRes, peopleRes] = await Promise.all([
    supabase
      .from("packing_templates")
      .select("id")
      .eq("family_id", trip.family_id)
      .eq("is_base", true)
      .maybeSingle(),
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
      .select("topic, topics, body, traveler_id, travelers (id, name)")
      .limit(40),
    // Birthdays, so the list is written for the ages they will be on the plane.
    // A twelve-year-old and a two-year-old pack nothing alike, and the number in
    // everybody's head is the number today rather than the number by then.
    supabase
      .from("travelers")
      .select("id, name, is_person, date_of_birth, gender")
      .eq("family_id", trip.family_id),
  ]);

  const templateId = tplRes.data?.id || null;
  const { data: templateItems } = templateId
    ? await supabase
        .from("packing_template_items")
        .select("category, item, assignee, quantity, sort_order")
        .eq("template_id", templateId)
        .order("sort_order", { ascending: true })
    : { data: [] };

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
    templateItems: templateItems || [],
    past,
    pastItems: pastItems || [],
    preferences: relevantPrefs(prefRes.data || [], names),
  });

  // Nothing better than what is already there, so leave it alone.
  if (replace && !generated.length) return { count: 0, source: "kept" };

  const rows = (generated.length ? generated : templateItems || []).map(
    (item, i) => ({
      trip_id: trip.id,
      category: item.category || null,
      item: item.item,
      assignee: item.assignee || "Shared",
      quantity: item.quantity || null,
      sort_order: i + 1,
    }),
  );

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
  };
}

// Returns a clean list of items, or an empty array for every kind of failure.
// A packing list is not worth breaking trip creation over.
async function askModel({
  trip,
  allowed,
  going = [],
  templateItems,
  past,
  pastItems,
  preferences,
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

  if (templateItems.length) {
    lines.push("");
    lines.push(
      "THE FAMILY'S BASE PACKING TEMPLATE (what they take on every trip — keep all of it unless this trip makes an item pointless):",
    );
    for (const i of templateItems.slice(0, 120)) {
      lines.push(
        `- ${i.category ? `[${i.category}] ` : ""}${i.item}${
          i.assignee ? ` — ${i.assignee}` : ""
        }${i.quantity ? ` ×${i.quantity}` : ""}`,
      );
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
    "- Start from the base template, then add what this destination and time of year specifically need, and what they packed on past trips that resemble this one.",
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
