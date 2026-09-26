// The tools an assistant can call.
//
// Governing rule: return what is already saved, never generate. Nothing here
// calls Aly, Gemini or OpenAI. One trip or one day per call, so no call can dump
// a household. Twenty-eight tools write. Six tick or add lines:
// check_off_packing_item here, and in writeTools.js check_off_day_pack_item,
// complete_reminder, add_packing_item, add_reminder and
// add_bucket_list_place. Eight in planTools.js plan: add and update an
// itinerary item, create and update a trip, add and update a Wallet program,
// add a packing-template item, and put a packing-list line in a day pack.
// Fourteen in moreTools.js cover the rest: start a packing list and choose its
// add-on templates, add and update budget lines, update a packing line or a
// reminder, add a favorite moment, put a fare on a trip or turn it down, save a
// home airport, retire a bucket-list place, set a pet's plan for a trip, and
// add and update travel preferences. Nothing deletes a record; choosing a
// trip's templates removes the link rows for templates dropped from the
// choice. Each runs through the signed-in person's own client, so row-level
// security and the secondary guards decide what it may touch -- the same rules
// the app's own checkboxes and forms run under. Adding and changing
// (everything but a check-off) is for primary travelers only.
//
// Children: a primary traveler (a parent) sees, checks off and adds packing
// and day pack items for their children, because those lines are the
// parent's own list. Nothing else about a child is returned, and a secondary
// traveler never sees a child's items.
//
// Deliberately left out of every answer: anything else about a child,
// health, allergy and accessibility details (including packing lines that read
// as health, such as an inhaler), typed notes, confirmation, ID,
// member, policy and microchip numbers, files, email bodies, Ask Aly
// conversations, and anything from another household. The household-context
// tools (preferences, budget, wallet, expiration dates and the rest) live in
// householdTools.js and are held to the same rules.

import { familyOf, visibleTrips } from "./scope";
import { householdHandlers, householdTools, readsAsHealth, touchesMinor } from "./householdTools";
import { writeHandlers, writeTools } from "./writeTools";
import { planHandlers, planTools } from "./planTools";
import { moreHandlers, moreTools } from "./moreTools";

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const CHECK_OFF = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
// Adding is not idempotent in the protocol sense, though each add tool refuses
// a duplicate of a line already on the list.
const ADD = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
// Changing a saved value replaces what was there, so an assistant should treat
// it as destructive even though nothing is ever deleted.
const UPDATE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

/** The packing lines an assistant may see for this reader: not stashed, not
 * health, a child's only for a primary, and a secondary's own only. */
export function visiblePacking(fam, items) {
  return (items || []).filter(
    (i) =>
      !i.stashed_at &&
      !readsAsHealth(i.item) &&
      (!fam.minorNames.has(i.assignee) || !fam.secondary) &&
      (!fam.secondary || i.assignee === fam.travelerName),
  );
}

const tripArg = {
  type: "string",
  description:
    "The trip's name, id or part of its name, as returned by list_trips. Optional when only one trip is current or upcoming.",
};

export const TOOLS = [
  {
    name: "list_trips",
    title: "List trips",
    description:
      "Lists the household's trips with destinations, dates and status. Use this first to find a trip.",
    inputSchema: {
      type: "object",
      properties: {
        when: {
          type: "string",
          enum: ["upcoming", "past", "all"],
          description: "Which trips to list. Defaults to upcoming, which includes a trip in progress.",
        },
      },
      additionalProperties: false,
    },
    annotations: { title: "List trips", ...READ },
  },
  {
    name: "get_trip",
    title: "Get a trip",
    description:
      "Summary of one trip: destination, dates, status, who is going, and how many days are planned.",
    inputSchema: {
      type: "object",
      properties: { trip: tripArg },
      additionalProperties: false,
    },
    annotations: { title: "Get a trip", ...READ },
  },
  {
    name: "get_itinerary_day",
    title: "Get one itinerary day",
    description:
      "The plans for one day of a trip, in order, with times and places. One day per call.",
    inputSchema: {
      type: "object",
      properties: {
        trip: tripArg,
        date: {
          type: "string",
          description: "The day, as YYYY-MM-DD. Defaults to today.",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
      },
      additionalProperties: false,
    },
    annotations: { title: "Get one itinerary day", ...READ },
  },
  {
    name: "get_packing_status",
    title: "Get packing status",
    description:
      "How much of a trip's packing is done, and what is still unpacked, by category. Optionally for one traveler.",
    inputSchema: {
      type: "object",
      properties: {
        trip: tripArg,
        traveler: {
          type: "string",
          description: "A traveler's first name, to see only their items.",
        },
      },
      additionalProperties: false,
    },
    annotations: { title: "Get packing status", ...READ },
  },
  {
    name: "check_off_packing_item",
    title: "Check off a packing item",
    description:
      "Marks one item on a trip's packing list as packed, or unpacked. Matches the item by name; if more than one line matches, it changes nothing and lists them so you can say which.",
    inputSchema: {
      type: "object",
      properties: {
        trip: tripArg,
        item: { type: "string", description: "The item's name as it appears on the packing list." },
        traveler: { type: "string", description: "Whose item it is, by first name, when more than one person has it." },
        packed: { type: "string", enum: ["yes", "no"], description: "yes to check it off (the default), no to uncheck it." },
      },
      required: ["item"],
      additionalProperties: false,
    },
    annotations: { title: "Check off a packing item", ...CHECK_OFF },
  },
  {
    name: "get_travelers",
    title: "Get travelers",
    description: "The adults going on a trip, by name.",
    inputSchema: {
      type: "object",
      properties: { trip: tripArg },
      additionalProperties: false,
    },
    annotations: { title: "Get travelers", ...READ },
  },
  {
    name: "get_pro_tips",
    title: "Get pro tips",
    description:
      "Saved, still-open pro tips for a trip, optionally only the ones for one day.",
    inputSchema: {
      type: "object",
      properties: {
        trip: tripArg,
        date: {
          type: "string",
          description: "Only tips for this day, as YYYY-MM-DD.",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        },
      },
      additionalProperties: false,
    },
    annotations: { title: "Get pro tips", ...READ },
  },
  {
    name: "get_prior_reviews",
    title: "Get past reviews",
    description:
      "The household's own ratings and reviews of places from past trips, matched by place or destination name.",
    inputSchema: {
      type: "object",
      properties: {
        place: {
          type: "string",
          description: "A place, restaurant, town or destination to look for.",
        },
      },
      required: ["place"],
      additionalProperties: false,
    },
    annotations: { title: "Get past reviews", ...READ },
  },
];

TOOLS.push(...householdTools(READ, tripArg));
TOOLS.push(...writeTools(CHECK_OFF, ADD, tripArg));
TOOLS.push(...planTools(ADD, UPDATE, tripArg));
TOOLS.push(...moreTools(ADD, UPDATE, tripArg));

export class ToolError extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isCurrentOrUpcoming(trip, today) {
  const end = trip.end_date || trip.start_date;
  return !end || end >= today;
}

function sayDates(trip) {
  if (!trip.start_date) return "dates not set";
  if (!trip.end_date || trip.end_date === trip.start_date) return trip.start_date;
  return `${trip.start_date} to ${trip.end_date}`;
}

function tripRef(trip) {
  return {
    id: trip.id,
    name: trip.name,
    destination: trip.destination || null,
    start_date: trip.start_date || null,
    end_date: trip.end_date || null,
    status: trip.status || null,
  };
}

async function pickTrip(client, scope, wanted) {
  const trips = await visibleTrips(client, scope);
  const text = String(wanted || "").trim().toLowerCase();
  if (!text) {
    const live = trips.filter((t) => t.status !== "draft" && isCurrentOrUpcoming(t, scope.today));
    if (live.length === 1) return live[0];
    if (!live.length) throw new ToolError("There is no current or upcoming trip. Name one from list_trips.");
    throw new ToolError(
      `More than one trip is current or upcoming: ${live.map((t) => t.name).join("; ")}. Say which one.`,
    );
  }
  const exact = trips.filter((t) => t.id === wanted || t.name.toLowerCase() === text);
  if (exact.length === 1) return exact[0];
  const partial = trips.filter(
    (t) => t.name.toLowerCase().includes(text) || (t.destination || "").toLowerCase().includes(text),
  );
  if (partial.length === 1) return partial[0];
  if (!partial.length) throw new ToolError(`No trip matches "${wanted}". Use list_trips to see the names.`);
  throw new ToolError(`"${wanted}" matches ${partial.map((t) => t.name).join("; ")}. Say which one.`);
}

async function tripTravelers(client, scope, trip) {
  const links = await client.from("trip_travelers").select("traveler_id").eq("trip_id", trip.id);
  if (links.error) throw new Error("travelers unavailable");
  const ids = new Set((links.data || []).map((l) => l.traveler_id));
  const fam = familyOf(scope, trip.family_id);
  return scope.travelers
    .filter((t) => ids.has(t.id) && t.family_id === trip.family_id && t.is_person)
    .filter((t) => !fam.minorIds.has(t.id));
}

const handlers = {
  ...householdHandlers({
    ToolError,
    pickTrip,
    tripRef,
    tripTravelers,
    visibleTrips,
  }),
  ...writeHandlers({ ToolError, pickTrip, tripRef, tripTravelers }),
  ...planHandlers({ ToolError, pickTrip, tripRef, visiblePacking }),
  ...moreHandlers({ ToolError, pickTrip, tripRef, visiblePacking }),
  async list_trips(client, scope, args) {
    const when = args.when || "upcoming";
    if (!["upcoming", "past", "all"].includes(when)) throw new ToolError("when must be upcoming, past or all.");
    const trips = (await visibleTrips(client, scope)).filter((t) =>
      when === "all" ? true : when === "upcoming" ? isCurrentOrUpcoming(t, scope.today) : !isCurrentOrUpcoming(t, scope.today),
    );
    const out = trips.map(tripRef);
    return {
      summary: out.length
        ? `${out.length} ${when === "all" ? "" : when + " "}trip${out.length === 1 ? "" : "s"}: ${out
            .map((t) => `${t.name} (${sayDates(t)})`)
            .join("; ")}.`.replace("  ", " ")
        : `No ${when === "all" ? "" : when + " "}trips.`.replace("  ", " "),
      trips: out,
    };
  },

  async get_trip(client, scope, args) {
    const trip = await pickTrip(client, scope, args.trip);
    const people = await tripTravelers(client, scope, trip);
    const days = await client.from("itinerary_items").select("item_date").eq("trip_id", trip.id);
    if (days.error) throw new Error("itinerary unavailable");
    const planned = new Set((days.data || []).map((d) => d.item_date).filter(Boolean)).size;
    const names = people.map((p) => p.name);
    return {
      summary: `${trip.name}${trip.destination ? `, ${trip.destination}` : ""}, ${sayDates(trip)}. ${
        names.length ? `Going: ${names.join(", ")}.` : ""
      } ${planned} day${planned === 1 ? "" : "s"} have plans.`.replace(/\s+/g, " ").trim(),
      trip: { ...tripRef(trip), adults_going: names, days_with_plans: planned },
    };
  },

  async get_itinerary_day(client, scope, args) {
    const date = args.date || scope.today;
    if (!ISO.test(date)) throw new ToolError("date must be YYYY-MM-DD.");
    const trip = await pickTrip(client, scope, args.trip);
    const { data, error } = await client
      .from("itinerary_items")
      .select("id, item_date, end_date, start_time, sort_order, title, category, location, status")
      .eq("trip_id", trip.id);
    if (error) throw new Error("itinerary unavailable");
    const fam = familyOf(scope, trip.family_id);
    const advice = await client
      .from("item_insights")
      .select("item_id, trip_id, dress_code, arrive_minutes, arrive_why, heads_up, bring")
      .eq("trip_id", trip.id);
    if (advice.error) throw new Error("itinerary unavailable");
    const adviceFor = new Map(
      (advice.data || [])
        .filter((a) => !touchesMinor(fam, { texts: [a.heads_up, a.bring, a.arrive_why] }))
        .filter((a) => !readsAsHealth(a.heads_up, a.bring, a.arrive_why))
        .map((a) => [a.item_id, a]),
    );
    const items = (data || [])
      .filter((i) => i.item_date === date || (i.item_date && i.end_date && i.item_date < date && i.end_date >= date))
      .sort(
        (a, b) =>
          String(a.start_time || "99").localeCompare(String(b.start_time || "99")) ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0),
      )
      .map((i) => ({
        time: i.start_time ? String(i.start_time).slice(0, 5) : null,
        title: i.title,
        category: i.category || null,
        place: i.location || null,
        status: i.status || null,
        continues_from: i.item_date !== date ? i.item_date : null,
        ...(adviceFor.has(i.id)
          ? {
              advice: {
                arrive_minutes_early: adviceFor.get(i.id).arrive_minutes ?? null,
                arrive_why: adviceFor.get(i.id).arrive_why || null,
                dress_code: adviceFor.get(i.id).dress_code || null,
                bring: adviceFor.get(i.id).bring || null,
                heads_up: adviceFor.get(i.id).heads_up || null,
              },
            }
          : {}),
      }));
    return {
      summary: items.length
        ? `${trip.name}, ${date}: ${items.map((i) => (i.time ? `${i.time} ${i.title}` : i.title)).join("; ")}.`
        : `Nothing is planned on ${trip.name} for ${date}.`,
      trip: tripRef(trip),
      date,
      items,
    };
  },

  async get_packing_status(client, scope, args) {
    const trip = await pickTrip(client, scope, args.trip);
    const fam = familyOf(scope, trip.family_id);
    const { data, error } = await client
      .from("packing_items")
      .select("category, item, assignee, quantity, is_packed, stashed_at, sort_order")
      .eq("trip_id", trip.id);
    if (error) throw new Error("packing unavailable");
    let items = visiblePacking(fam, data);
    const who = String(args.traveler || "").trim();
    if (who) {
      const match = items.filter((i) => String(i.assignee || "").toLowerCase().startsWith(who.toLowerCase()));
      if (!match.length) throw new ToolError(`No packing items for "${who}" on ${trip.name}.`);
      items = match;
    }
    const packed = items.filter((i) => i.is_packed).length;
    const byCategory = {};
    for (const i of items.filter((x) => !x.is_packed).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
      const key = i.category || "Other";
      (byCategory[key] ||= []).push({ item: i.item, for: i.assignee || null, quantity: i.quantity || null });
    }
    const left = items.length - packed;
    return {
      summary: items.length
        ? `${packed} of ${items.length} packed${who ? ` for ${who}` : ""} on ${trip.name}. ${
            left ? `${left} still to pack.` : "Everything is packed."
          }`
        : `No packing list yet for ${trip.name}.`,
      trip: tripRef(trip),
      packed,
      total: items.length,
      unpacked_by_category: byCategory,
    };
  },

  async check_off_packing_item(client, scope, args) {
    const want = String(args.item || "").trim();
    if (!want) throw new ToolError("Say which item to check off.");
    const packed = args.packed == null || args.packed === "" ? true : args.packed === "yes" ? true : args.packed === "no" ? false : null;
    if (packed === null) throw new ToolError('packed must be "yes" or "no".');
    const trip = await pickTrip(client, scope, args.trip);
    const fam = familyOf(scope, trip.family_id);
    const { data, error } = await client
      .from("packing_items")
      .select("id, item, assignee, is_packed, stashed_at")
      .eq("trip_id", trip.id);
    if (error) throw new Error("packing unavailable");
    let items = visiblePacking(fam, data);
    const who = String(args.traveler || "").trim().toLowerCase();
    if (who) items = items.filter((i) => String(i.assignee || "").toLowerCase().startsWith(who));
    const norm = (s) => String(s || "").trim().toLowerCase();
    let match = items.filter((i) => norm(i.item) === norm(want));
    if (!match.length) match = items.filter((i) => norm(i.item).includes(norm(want)));
    const label = (i) => `${i.item}${i.assignee ? ` (${i.assignee})` : ""}`;
    if (!match.length) throw new ToolError(`No packing item matching "${want}"${who ? ` for ${args.traveler}` : ""} on ${trip.name}. Nothing was changed.`);
    if (match.length > 1) {
      const pending = match.filter((i) => !!i.is_packed !== packed);
      if (pending.length === 1) match = pending;
      else
        throw new ToolError(
          `More than one item matches "${want}" on ${trip.name}: ${match.slice(0, 6).map(label).join("; ")}. Nothing was changed; say which one, or whose.`,
        );
    }
    const row = match[0];
    if (!!row.is_packed === packed) {
      return { summary: `${label(row)} was already ${packed ? "checked off" : "unchecked"} on ${trip.name}.`, trip: tripRef(trip), item: row.item, for: row.assignee || null, packed, changed: false };
    }
    const { data: saved, error: saveError } = await client
      .from("packing_items")
      .update({ is_packed: packed, packed_by: packed ? scope.userId : null, packed_at: packed ? new Date().toISOString() : null })
      .eq("id", row.id)
      .select("id");
    if (saveError || !saved?.length) throw new ToolError(`${label(row)} could not be changed. Nothing was saved.`);
    return { summary: `${packed ? "Checked off" : "Unchecked"} ${label(row)} on ${trip.name}.`, trip: tripRef(trip), item: row.item, for: row.assignee || null, packed, changed: true };
  },

  async get_travelers(client, scope, args) {
    const trip = await pickTrip(client, scope, args.trip);
    const people = await tripTravelers(client, scope, trip);
    const names = people.map((p) => p.name);
    return {
      summary: names.length ? `Adults going on ${trip.name}: ${names.join(", ")}.` : `No adults are listed on ${trip.name}.`,
      trip: tripRef(trip),
      travelers: people.map((p) => ({ name: p.name, access: p.access_level || "primary" })),
    };
  },

  async get_pro_tips(client, scope, args) {
    if (args.date && !ISO.test(args.date)) throw new ToolError("date must be YYYY-MM-DD.");
    const trip = await pickTrip(client, scope, args.trip);
    const { data, error } = await client
      .from("pro_tips")
      .select("title, body, urgency, act_by, for_date, status, created_at")
      .eq("family_id", trip.family_id)
      .eq("trip_id", trip.id)
      .eq("status", "active");
    if (error) throw new Error("tips unavailable");
    const tips = (data || [])
      .filter((t) => !args.date || t.for_date === args.date)
      .sort((a, b) => String(a.act_by || a.for_date || "9").localeCompare(String(b.act_by || b.for_date || "9")))
      .map((t) => ({ title: t.title, detail: t.body, urgency: t.urgency || null, act_by: t.act_by || null, for_date: t.for_date || null }));
    return {
      summary: tips.length
        ? `${tips.length} open tip${tips.length === 1 ? "" : "s"} for ${trip.name}${args.date ? ` on ${args.date}` : ""}: ${tips
            .map((t) => t.title)
            .join("; ")}.`
        : `No open tips for ${trip.name}${args.date ? ` on ${args.date}` : ""}.`,
      trip: tripRef(trip),
      tips,
    };
  },

  async get_prior_reviews(client, scope, args) {
    const place = String(args.place || "").trim().toLowerCase();
    if (place.length < 2) throw new ToolError("place must be at least two letters.");
    const trips = await visibleTrips(client, scope);
    if (!trips.length) return { summary: "No past reviews.", reviews: [] };
    const byId = new Map(trips.map((t) => [t.id, t]));
    const { data, error } = await client
      .from("itinerary_items")
      .select("trip_id, item_date, title, location, rating, review")
      .in("trip_id", [...byId.keys()]);
    if (error) throw new Error("reviews unavailable");
    // A review that names a child, or reads as health, is dropped whole: the
    // rating travels with the words, so keeping one without the other would
    // still say something about the child.
    const reviews = (data || [])
      .filter((i) => i.rating != null || (i.review && i.review.trim()))
      .filter((i) => !touchesMinor(familyOf(scope, byId.get(i.trip_id)?.family_id), { texts: [i.review] }))
      .filter((i) => !readsAsHealth(i.review))
      .filter((i) =>
        [i.title, i.location, byId.get(i.trip_id)?.destination, byId.get(i.trip_id)?.name]
          .some((v) => String(v || "").toLowerCase().includes(place)),
      )
      .sort((a, b) => String(b.item_date || "").localeCompare(String(a.item_date || "")))
      .slice(0, 20)
      .map((i) => ({
        place: i.title,
        where: i.location || null,
        trip: byId.get(i.trip_id)?.name || null,
        date: i.item_date || null,
        rating: i.rating ?? null,
        review: i.review || null,
      }));
    return {
      summary: reviews.length
        ? `${reviews.length} past review${reviews.length === 1 ? "" : "s"} matching "${args.place}": ${reviews
            .map((r) => (r.rating != null ? `${r.place} (${r.rating}/5)` : r.place))
            .join("; ")}.`
        : `No past reviews matching "${args.place}".`,
      reviews,
    };
  },
};

export async function callTool(client, scope, name, args = {}) {
  const run = handlers[name];
  if (!run) throw new ToolError(`Unknown tool: ${name}`);
  if (args === null || typeof args !== "object" || Array.isArray(args)) throw new ToolError("arguments must be an object.");
  const allowed = TOOLS.find((t) => t.name === name).inputSchema.properties;
  for (const key of Object.keys(args)) if (!(key in allowed)) throw new ToolError(`Unexpected argument: ${key}`);
  for (const [key, value] of Object.entries(args)) if (value != null && typeof value !== "string") throw new ToolError(`${key} must be text.`);
  return run(client, scope, args);
}
