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

export const TOOL_DECLARATIONS = [
  {
    name: "add_itinerary_item",
    description:
      "Add a new event to the trip itinerary: a flight, hotel stay, cruise, excursion, meal, transport leg, activity, or a dated note.",
    parameters: {
      type: "object",
      properties: itineraryFields,
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
      "Save a free-form note on the trip: ideas, reminders, restaurant tips, anything that is not a dated event.",
    parameters: {
      type: "object",
      properties: {
        body: { type: "string" },
        title: { type: "string" },
        pinned: { type: "boolean" },
      },
      required: ["body"],
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
};

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
  const { travelerNames = ["Shared"], known = {} } = ctx;
  const name = call?.name;
  const args = call?.args && typeof call.args === "object" ? call.args : {};
  const table = TABLE_FOR_TOOL[name];

  if (!table) return { error: `Unknown action "${name}".` };

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
            : "That item is not part of this trip, so I did not change it.",
      };
    }
  }

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
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Add "${patch.title}" to the itinerary on ${patch.item_date}${
              patch.start_time ? ` at ${patch.start_time}` : ""
            }`,
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
          summary: `Update ${label("itinerary item")}: ${describePatch(patch)}`,
        },
      };
    }

    case "delete_itinerary_item":
      return {
        action: {
          tool: name,
          table,
          id,
          summary: `Delete ${label("an itinerary item")} from the itinerary`,
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
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Pack ${patch.quantity ? `${patch.quantity} ` : ""}${
              patch.item
            } for ${patch.assignee}`,
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
              ? `Check off ${label("a packing item")} as packed`
              : `Update ${label("packing item")}: ${describePatch(patch)}`,
        },
      };
    }

    case "delete_packing_item":
      return {
        action: {
          tool: name,
          table,
          id,
          summary: `Remove ${label("an item")} from the packing list`,
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
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Add task "${patch.title}" for ${patch.assignee}${
              patch.due_date ? ` due ${patch.due_date}` : ""
            }`,
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
              ? `Mark ${label("a task")} done`
              : `Update ${label("task")}: ${describePatch(patch)}`,
        },
      };
    }

    case "delete_task":
      return {
        action: {
          tool: name,
          table,
          id,
          summary: `Delete ${label("a task")} from the checklist`,
        },
      };

    case "add_note": {
      const body = cleanText(args.body, 4000);
      if (!body) return { error: "A note needs some text." };
      const patch = prune({
        body,
        title: cleanText(args.title, 150),
        pinned: cleanBool(args.pinned),
      });
      return {
        action: {
          tool: name,
          table,
          patch,
          summary: `Save a note${patch.title ? `: "${patch.title}"` : ""}`,
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
    .map(([k, v]) => `${FIELD_LABELS[k] || k} → ${v}`)
    .join(", ");
}
