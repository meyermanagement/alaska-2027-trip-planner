// Tool definitions for the trip assistant, plus the server-side validation and
// write handlers. Everything the model can do to the trip lives here.

export const ITINERARY_CATEGORIES = [
  "flight",
  "lodging",
  "cruise",
  "excursion",
  "dining",
  "transport",
  "activity",
  "note",
];

export const ITINERARY_STATUSES = [
  "confirmed",
  "planned",
  "optional",
  "needs_booking",
  "cancelled",
];

export const TASK_TIMINGS = [
  "now",
  "month_before",
  "week_before",
  "day_before",
  "travel_day",
  "before_trip",
];

export const TRIP_STATUSES = [
  "planning",
  "booked",
  "active",
  "complete",
  "archived",
];

const itineraryFields = {
  title: { type: "string", description: "Short label, e.g. 'Dinner at Steakhouse 71'" },
  item_date: { type: "string", description: "Date in YYYY-MM-DD" },
  start_time: {
    type: "string",
    description: "24-hour time as HH:MM. Omit for all-day items.",
  },
  category: { type: "string", enum: ITINERARY_CATEGORIES },
  status: { type: "string", enum: ITINERARY_STATUSES },
  location: { type: "string" },
  confirmation_number: {
    type: "string",
    description: "Only if the user explicitly provided one.",
  },
  notes: { type: "string" },
};

// Every row that lives inside a trip needs to say which trip, unless a trip is
// open and the user meant that one.
const tripField = {
  trip: {
    type: "string",
    description:
      "Which trip this belongs to — the trip's exact name or id from the context. Leave it out to use the trip that is open. Required when no trip is open.",
  },
};

export const TOOL_DECLARATIONS = [
  {
    name: "add_itinerary_item",
    description:
      "Add a new event to a trip's itinerary: a flight, hotel stay, cruise, excursion, meal, transport leg, activity, or a dated note.",
    parameters: {
      type: "object",
      properties: { ...itineraryFields, ...tripField },
      required: ["title", "item_date"],
    },
  },
  {
    name: "update_itinerary_item",
    description:
      "Change one or more fields on an existing itinerary item. Only include the fields that should change. Use the exact id from the ITINERARY context.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, ...itineraryFields },
      required: ["id"],
    },
  },
  {
    name: "delete_itinerary_item",
    description:
      "Permanently remove an itinerary item. Prefer update_itinerary_item with status 'cancelled' when the plan fell through but is worth remembering.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "add_packing_item",
    description:
      "Add one item to the packing list. Call this once per distinct item, even when the user lists several at once.",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string" },
        assignee: {
          type: "string",
          description: "Who packs it. Use 'Shared' for family items.",
        },
        quantity: { type: "string", description: "Free text, e.g. '3' or '2 pairs'" },
        category: {
          type: "string",
          description: "Grouping such as Clothing, Toiletries, Electronics, Documents",
        },
        bag: { type: "string" },
        notes: { type: "string" },
        ...tripField,
      },
      required: ["item"],
    },
  },
  {
    name: "update_packing_item",
    description:
      "Change or check off an existing packing item. Use the exact id from the PACKING context.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        item: { type: "string" },
        assignee: { type: "string" },
        quantity: { type: "string" },
        category: { type: "string" },
        bag: { type: "string" },
        notes: { type: "string" },
        is_packed: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_packing_item",
    description: "Remove an item from the packing list.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "add_task",
    description: "Add a pre-departure checklist task.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        assignee: { type: "string", description: "Use 'Shared' if unspecified." },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        timing: { type: "string", enum: TASK_TIMINGS },
        detail: { type: "string" },
        ...tripField,
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Change a checklist task or mark it done. Use the exact id from the TASKS context.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        assignee: { type: "string" },
        due_date: { type: "string" },
        timing: { type: "string", enum: TASK_TIMINGS },
        detail: { type: "string" },
        is_done: { type: "boolean" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_task",
    description: "Remove a checklist task.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "add_note",
    description:
      "Save a free-form note on a trip: ideas, reminders, restaurant tips, anything that is not a dated event.",
    parameters: {
      type: "object",
      properties: {
        body: { type: "string" },
        title: { type: "string" },
        pinned: { type: "boolean" },
        ...tripField,
      },
      required: ["body"],
    },
  },
];

// Family-level tools. Neither travel preferences nor the record of places the
// family has been belongs to one trip, so these are offered in BOTH scopes:
// inside a trip and from the trips list.
export const SHARED_TOOL_DECLARATIONS = [
  {
    name: "add_preference",
    description:
      "Save a standing travel preference for the family — how they like to travel, in general, on every trip. Only call this when the user states something durable (\"we always fly out in the morning\", \"Veda will not eat seafood\"), never for a one-off decision about a single trip. Write it in their own words.",
    parameters: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description:
            "The preference itself, one or two sentences, e.g. 'We would rather pay more for a hotel with a pool and a real breakfast.'",
        },
        topic: {
          type: "string",
          description:
            "Short grouping label so it files with similar ones, e.g. 'Hotels', 'Flights', 'Food', 'Pace'. Reuse a topic already in the context when one fits.",
        },
        whose: {
          type: "string",
          description:
            "One traveler's name when the preference is only about that person. Leave this out when it is true of the whole family.",
        },
      },
      required: ["body"],
    },
  },
  {
    name: "update_preference",
    description:
      "Reword or re-file an existing travel preference. Use the exact id from the preferences in the context. Include only what changes.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        body: { type: "string" },
        topic: { type: "string" },
        whose: {
          type: "string",
          description:
            "A traveler's name to make it about one person, or 'Shared' to make it about the whole family.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_preference",
    description:
      "Remove a travel preference the family no longer holds. Use the exact id from the context.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "update_review",
    description:
      "Rate or write the family's review of somewhere they have already been — a hotel, an excursion, an activity or a restaurant that is on a trip's itinerary. Use the exact id of that itinerary item from the context. Give a star rating, review text, or both.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        rating: {
          type: "integer",
          description: "Stars from 1 to 5. Omit to leave the rating as it is.",
        },
        review: {
          type: "string",
          description:
            "What the family thought, in their words. Omit to leave any existing note alone.",
        },
        clear_rating: {
          type: "boolean",
          description: "True to remove the star rating entirely.",
        },
        clear_review: {
          type: "boolean",
          description: "True to remove the written review entirely.",
        },
      },
      required: ["id"],
    },
  },
];

// Trip-level tools. These are offered only when the assistant is opened from
// the trips list, where there is no single trip in scope.
export const TRIP_TOOL_DECLARATIONS = [
  {
    name: "create_trip",
    description:
      "Create a new trip for the family. Only call this when the user clearly wants a new trip. A name is required; ask for one if they have not given anything usable.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Short display name, e.g. 'Italy 2028'",
        },
        destination: {
          type: "string",
          description: "Where they are going, e.g. 'Rome & the Amalfi Coast'",
        },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        cover_emoji: {
          type: "string",
          description: "A single emoji that suits the destination.",
        },
        summary: { type: "string", description: "One or two sentences." },
        status: { type: "string", enum: TRIP_STATUSES },
        copy_base_packing: {
          type: "boolean",
          description:
            "Start the packing list from the family base template. Defaults to true.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "update_trip",
    description:
      "Change details on an existing trip: its name, destination, dates, status or summary. Use the exact id from the TRIPS context.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        destination: { type: "string" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        cover_emoji: { type: "string" },
        summary: { type: "string" },
        status: { type: "string", enum: TRIP_STATUSES },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_trip",
    description:
      "Delete a trip and everything inside it — itinerary, packing list, tasks and notes. Call this whenever the user names one specific trip they want removed; the app shows them a confirmation card before anything is deleted, so do not ask for confirmation yourself. Only hold off and ask a question when you cannot tell which trip they mean.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        confirm_name: {
          type: "string",
          description:
            "Type the trip's exact name as it appears in the TRIPS context. This guards against deleting the wrong trip.",
        },
      },
      required: ["id", "confirm_name"],
    },
  },
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const TABLE_FOR_TOOL = {
  create_trip: "trips",
  update_trip: "trips",
  delete_trip: "trips",
  add_itinerary_item: "itinerary_items",
  update_itinerary_item: "itinerary_items",
  delete_itinerary_item: "itinerary_items",
  add_packing_item: "packing_items",
  update_packing_item: "packing_items",
  delete_packing_item: "packing_items",
  add_task: "predeparture_tasks",
  update_task: "predeparture_tasks",
  delete_task: "predeparture_tasks",
  add_note: "trip_notes",
  add_preference: "travel_preferences",
  update_preference: "travel_preferences",
  delete_preference: "travel_preferences",
  update_review: "itinerary_items",
};

// Tools that write a family-level table and so need no trip in scope.
export const FAMILY_TABLES = new Set(["travel_preferences"]);

// Tables whose rows live inside one trip, so a write has to name that trip.
export const TRIP_SCOPED_TABLES = new Set([
  "itinerary_items",
  "packing_items",
  "predeparture_tasks",
  "trip_notes",
]);

// Everything Aly can do, offered on every screen.
export function allTools() {
  return [
    ...TOOL_DECLARATIONS,
    ...TRIP_TOOL_DECLARATIONS,
    ...SHARED_TOOL_DECLARATIONS,
  ];
}

// Tools that touch an itinerary item's rating and review only. Allowed from
// the trips list too, because the "Preferences & Reviews" tab spans every past trip.
export const REVIEW_TOOLS = new Set(["update_review"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value, max = 2000) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function cleanDate(value) {
  const text = cleanText(value, 10);
  if (!text || !DATE_RE.test(text)) return undefined;
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return text;
}

function cleanTime(value) {
  const text = cleanText(value, 8);
  if (!text) return undefined;
  const m = text.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function cleanEnum(value, allowed) {
  const text = cleanText(value, 40);
  if (!text) return undefined;
  const lower = text.toLowerCase().replace(/[\s-]+/g, "_");
  return allowed.includes(lower) ? lower : undefined;
}

function cleanBool(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function matchAssignee(value, travelerNames) {
  const text = cleanText(value, 60);
  if (!text) return undefined;
  const hit = travelerNames.find(
    (n) => n.toLowerCase() === text.toLowerCase()
  );
  if (hit) return hit;
  const partial = travelerNames.find(
    (n) =>
      n.toLowerCase().startsWith(text.toLowerCase()) ||
      text.toLowerCase().startsWith(n.toLowerCase())
  );
  return partial || "Shared";
}

// A star rating is 1 through 5, or nothing at all.
function cleanRating(value) {
  const n = typeof value === "number" ? value : Number(cleanText(value, 4));
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= 5 ? rounded : undefined;
}

// A preference is either about one person or about the whole family. "Shared"
// and anything unrecognized mean the family, which the column stores as null.
// `args.whose` is what the model sends; `args.traveler_id` is what comes back
// when the apply route revalidates an already-approved action.
function prefTraveler(args, travelerNames, travelerIds) {
  if (args.traveler_id !== undefined) {
    const raw = args.traveler_id;
    if (!raw) return null;
    const text = String(raw);
    const allowed = new Set(travelerIds.values());
    return UUID_RE.test(text) && allowed.has(text) ? text : null;
  }
  if (args.whose === undefined || args.whose === null) return undefined;
  const name = matchAssignee(args.whose, travelerNames);
  if (!name || name === "Shared") return null;
  return travelerIds.get(name) || null;
}

// Which trip a new row belongs to: the one the model named, or the open one.
// `args.trip` is what the model sends; `args.trip_id` comes back when the
// apply route revalidates an already-approved action.
function resolveTrip(args, known, focusTripId) {
  const trips = known.trips || new Map();
  const named = cleanText(args.trip_id, 60) || cleanText(args.trip, 140);

  if (named) {
    if (UUID_RE.test(named)) return trips.has(named) ? named : null;
    const lower = named.toLowerCase();
    for (const [id, tripName] of trips.entries()) {
      if (String(tripName).toLowerCase() === lower) return id;
    }
    for (const [id, tripName] of trips.entries()) {
      const other = String(tripName).toLowerCase();
      if (other.includes(lower) || lower.includes(other)) return id;
    }
    return null;
  }

  return focusTripId && trips.has(focusTripId) ? focusTripId : undefined;
}

function clip(value, max = 60) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// One emoji, nothing else. Falls back to the schema default at the DB.
function cleanEmoji(value) {
  const text = cleanText(value, 12);
  if (!text) return undefined;
  const chars = Array.from(text);
  if (chars.length > 4) return undefined;
  return /\p{Extended_Pictographic}/u.test(text) ? text : undefined;
}

function prune(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Turn a raw model function call into a safe, described action, or an error.
 * `known` holds the ids that actually belong to this trip.
 */
export function validateAction(call, ctx) {
  const {
    travelerNames = ["Shared"],
    known = {},
    travelerIds = new Map(),
    focusTripId = null,
  } = ctx;
  const name = call?.name;
  const args = call?.args && typeof call.args === "object" ? call.args : {};
  const table = TABLE_FOR_TOOL[name];

  if (!table) return { error: `Unknown action "${name}".` };

  // Which trip the row sits in, and whether that needs saying out loud.
  let tripId;
  if (TRIP_SCOPED_TABLES.has(table) && name.startsWith("add_")) {
    tripId = resolveTrip(args, known, focusTripId);
    if (tripId === null) {
      return {
        error: "I could not tell which trip you meant, so I did not add that.",
      };
    }
    if (tripId === undefined) {
      return {
        error:
          "Tell me which trip that is for and I will add it — no trip is open right now.",
      };
    }
  }

  const needsId = name.startsWith("update_") || name.startsWith("delete_");
  let id;
  if (needsId) {
    id = cleanText(args.id, 40);
    if (!id || !UUID_RE.test(id)) {
      return { error: "That action referred to an item I could not identify." };
    }
    const pool = known[table] || new Map();
    if (!pool.has(id)) {
      return {
        error:
          table === "trips"
            ? "I could not find that trip, so I did not change anything."
            : table === "travel_preferences"
              ? "I could not find that saved preference, so I did not change it."
              : "I could not find that on any of your trips, so I did not change it.",
      };
    }
  }

  if (needsId && TRIP_SCOPED_TABLES.has(table)) {
    tripId = known.rowTrip?.get(id);
  }

  // Only worth naming the trip when it is not the one already on screen.
  const elsewhere =
    tripId && tripId !== focusTripId ? known.trips?.get(tripId) : null;
  const on = elsewhere ? ` on ${elsewhere}` : "";

  const label = (fallback) =>
    needsId ? known[table]?.get(id) || fallback : fallback;

  switch (name) {
    case "create_trip":
    case "update_trip": {
      const patch = prune({
        name: cleanText(args.name, 120),
        destination: cleanText(args.destination, 300),
        start_date: cleanDate(args.start_date),
        end_date: cleanDate(args.end_date),
        cover_emoji: cleanEmoji(args.cover_emoji),
        summary: cleanText(args.summary, 2000),
        status: cleanEnum(args.status, TRIP_STATUSES),
      });

      // Both dates present and backwards is a mistake worth catching early.
      if (
        patch.start_date &&
        patch.end_date &&
        patch.end_date < patch.start_date
      ) {
        return { error: "Those dates end before they start." };
      }

      if (name === "create_trip") {
        if (!patch.name) return { error: "A new trip needs a name." };
        // Carried in the patch so it survives revalidation, stripped on write.
        const copy = cleanBool(args.copy_base_packing);
        if (copy !== undefined) patch.copy_base_packing = copy;
        const when =
          patch.start_date && patch.end_date
            ? ` (${patch.start_date} to ${patch.end_date})`
            : patch.start_date
              ? ` starting ${patch.start_date}`
              : "";
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Create the trip "${patch.name}"${when}`,
          },
        };
      }

      if (Object.keys(patch).length === 0)
        return { error: "No valid changes were given for that trip." };
      return {
        action: {
          tool: name,
          table,
          id,
          patch,
          summary: `Update ${label("trip")}: ${describePatch(patch)}`,
        },
      };
    }

    case "delete_trip": {
      const tripName = known.trips?.get(id);
      const echoed = cleanText(args.confirm_name, 120);
      // The model has to name the trip it means. Guards against a stray id.
      if (
        !echoed ||
        !tripName ||
        echoed.toLowerCase() !== String(tripName).toLowerCase()
      ) {
        return {
          error:
            "I could not be certain which trip you meant, so I did not delete anything. Tell me the trip's exact name.",
        };
      }
      const contents = known.tripContents?.get(id);
      return {
        action: {
          tool: name,
          table,
          id,
          patch: { confirm_name: echoed },
          summary: `Delete the trip "${tripName}"${
            contents ? ` and everything in it — ${contents}` : ""
          }. This cannot be undone.`,
          destructive: true,
        },
      };
    }

    case "add_itinerary_item":
    case "update_itinerary_item": {
      const patch = prune({
        title: cleanText(args.title, 200),
        item_date: cleanDate(args.item_date),
        start_time: cleanTime(args.start_time),
        category: cleanEnum(args.category, ITINERARY_CATEGORIES),
        status: cleanEnum(args.status, ITINERARY_STATUSES),
        location: cleanText(args.location, 300),
        confirmation_number: cleanText(args.confirmation_number, 60),
        notes: cleanText(args.notes, 2000),
      });
      if (name === "add_itinerary_item") {
        if (!patch.title) return { error: "An itinerary item needs a title." };
        if (!patch.item_date)
          return { error: `I need a date for "${patch.title}".` };
        patch.trip_id = tripId;
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Add "${patch.title}" to the itinerary on ${patch.item_date}${
              patch.start_time ? ` at ${patch.start_time}` : ""
            }${on}`,
          },
        };
      }
      if (Object.keys(patch).length === 0)
        return { error: "No valid changes were given for that itinerary item." };
      return {
        action: {
          tool: name,
          table,
          id,
          patch,
          summary: `Update ${label(
            "itinerary item"
          )}${on}: ${describePatch(patch)}`,
        },
      };
    }

    case "delete_itinerary_item":
      return {
        action: {
          tool: name,
          table,
          id,
          summary: `Delete ${label("an itinerary item")} from the itinerary${on}`,
        },
      };

    case "add_packing_item":
    case "update_packing_item": {
      const patch = prune({
        item: cleanText(args.item, 200),
        assignee: matchAssignee(args.assignee, travelerNames),
        quantity: cleanText(args.quantity, 40),
        category: cleanText(args.category, 60),
        bag: cleanText(args.bag, 60),
        notes: cleanText(args.notes, 1000),
        is_packed: cleanBool(args.is_packed),
      });
      if (name === "add_packing_item") {
        if (!patch.item) return { error: "A packing item needs a name." };
        delete patch.is_packed;
        // An unassigned item belongs to the whole family.
        if (!patch.assignee) patch.assignee = "Shared";
        patch.trip_id = tripId;
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Pack ${patch.quantity ? `${patch.quantity} ` : ""}${
              patch.item
            } for ${patch.assignee}${on}`,
          },
        };
      }
      if (args.assignee === undefined) delete patch.assignee;
      if (Object.keys(patch).length === 0)
        return { error: "No valid changes were given for that packing item." };
      return {
        action: {
          tool: name,
          table,
          id,
          patch,
          summary:
            patch.is_packed === true && Object.keys(patch).length === 1
              ? `Check off ${label("a packing item")} as packed${on}`
              : `Update ${label("packing item")}${on}: ${describePatch(patch)}`,
        },
      };
    }

    case "delete_packing_item":
      return {
        action: {
          tool: name,
          table,
          id,
          summary: `Remove ${label("an item")} from the packing list${on}`,
        },
      };

    case "add_task":
    case "update_task": {
      const patch = prune({
        title: cleanText(args.title, 200),
        assignee: matchAssignee(args.assignee, travelerNames),
        due_date: cleanDate(args.due_date),
        timing: cleanEnum(args.timing, TASK_TIMINGS),
        detail: cleanText(args.detail, 1000),
        is_done: cleanBool(args.is_done),
      });
      if (name === "add_task") {
        if (!patch.title) return { error: "A task needs a title." };
        delete patch.is_done;
        patch.trip_id = tripId;
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Add task "${patch.title}" for ${patch.assignee}${
              patch.due_date ? ` due ${patch.due_date}` : ""
            }${on}`,
          },
        };
      }
      if (args.assignee === undefined) delete patch.assignee;
      if (Object.keys(patch).length === 0)
        return { error: "No valid changes were given for that task." };
      return {
        action: {
          tool: name,
          table,
          id,
          patch,
          summary:
            patch.is_done === true && Object.keys(patch).length === 1
              ? `Mark ${label("a task")} done${on}`
              : `Update ${label("task")}${on}: ${describePatch(patch)}`,
        },
      };
    }

    case "delete_task":
      return {
        action: {
          tool: name,
          table,
          id,
          summary: `Delete ${label("a task")} from the checklist${on}`,
        },
      };

    case "add_note": {
      const body = cleanText(args.body, 4000);
      if (!body) return { error: "A note needs some text." };
      const patch = prune({
        body,
        title: cleanText(args.title, 150),
        pinned: cleanBool(args.pinned),
        trip_id: tripId,
      });
      return {
        action: {
          tool: name,
          table,
          patch,
          summary: `Save a note${patch.title ? `: "${patch.title}"` : ""}${on}`,
        },
      };
    }

    case "add_preference":
    case "update_preference": {
      const patch = prune({
        body: cleanText(args.body, 1000),
        topic: cleanText(args.topic, 60),
        traveler_id: prefTraveler(args, travelerNames, travelerIds),
      });
      const nameForId = (value) => {
        for (const [n, tid] of travelerIds.entries()) if (tid === value) return n;
        return "one traveler";
      };
      const whoseName =
        patch.traveler_id === undefined
          ? undefined
          : patch.traveler_id === null
            ? "the whole family"
            : nameForId(patch.traveler_id);

      if (name === "add_preference") {
        if (!patch.body)
          return { error: "A travel preference needs something to say." };
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Save a travel preference${
              patch.topic ? ` under ${patch.topic}` : ""
            }${
              whoseName && whoseName !== "the whole family"
                ? ` for ${whoseName}`
                : ""
            }: “${clip(patch.body, 90)}”`,
          },
        };
      }

      if (Object.keys(patch).length === 0)
        return { error: "No valid changes were given for that preference." };
      const bits = [];
      if (patch.body) bits.push(`“${clip(patch.body, 90)}”`);
      if (patch.topic) bits.push(`topic → ${patch.topic}`);
      if (whoseName) bits.push(`about → ${whoseName}`);
      return {
        action: {
          tool: name,
          table,
          id,
          patch,
          summary: `Update the preference “${label(
            "saved preference"
          )}”: ${bits.join(", ")}`,
        },
      };
    }

    case "delete_preference":
      return {
        action: {
          tool: name,
          table,
          id,
          summary: `Remove the travel preference “${label(
            "saved preference"
          )}”`,
        },
      };

    case "update_review": {
      const rating = cleanRating(args.rating);
      const review = cleanText(args.review, 4000);
      const patch = {};
      if (rating !== undefined) patch.rating = rating;
      else if (cleanBool(args.clear_rating) || args.rating === null)
        patch.rating = null;
      if (review !== undefined) patch.review = review;
      else if (cleanBool(args.clear_review) || args.review === null)
        patch.review = null;

      if (Object.keys(patch).length === 0) {
        return {
          error:
            "Tell me the star rating out of five, or what the review should say.",
        };
      }

      const bits = [];
      if (patch.rating) bits.push(`${patch.rating} of 5 stars`);
      if (patch.rating === null) bits.push("clear the rating");
      if (typeof patch.review === "string")
        bits.push(`note “${clip(patch.review, 90)}”`);
      if (patch.review === null) bits.push("clear the note");

      return {
        action: {
          tool: name,
          table,
          id,
          patch,
          summary: `Review ${label(
            "a place from a past trip"
          )}${on}: ${bits.join(", ")}`,
        },
      };
    }

    default:
      return { error: `Unsupported action "${name}".` };
  }
}

const FIELD_LABELS = {
  item_date: "date",
  start_time: "time",
  confirmation_number: "confirmation",
  is_packed: "packed",
  is_done: "done",
  due_date: "due date",
  start_date: "start",
  end_date: "end",
  cover_emoji: "cover",
};

function describePatch(patch) {
  return Object.entries(patch)
    .filter(([k]) => k !== "trip_id")
    .map(([k, v]) => `${FIELD_LABELS[k] || k} → ${v}`)
    .join(", ");
}
