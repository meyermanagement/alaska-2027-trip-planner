// The read-only tools an assistant can call.
//
// Governing rule: return what is already saved, never generate. Nothing here
// calls Aly, Gemini or OpenAI, and nothing writes. One trip or one day per call,
// so no call can dump a household.
//
// Deliberately left out of every answer: children and their packing items,
// health and accessibility details, typed notes, confirmation numbers, costs,
// documents, wallet data, and anything from another household.

import { familyOf, visibleTrips } from "./scope";

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

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
      .select("item_date, end_date, start_time, sort_order, title, category, location, status")
      .eq("trip_id", trip.id);
    if (error) throw new Error("itinerary unavailable");
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
    let items = (data || []).filter((i) => !i.stashed_at && !fam.minorNames.has(i.assignee));
    if (fam.secondary) items = items.filter((i) => i.assignee === fam.travelerName);
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
    const reviews = (data || [])
      .filter((i) => i.rating != null || (i.review && i.review.trim()))
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
