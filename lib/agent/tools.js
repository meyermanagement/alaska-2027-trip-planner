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

// How urgent a task is. "normal" is what a task is unless somebody says
// otherwise, so Aly only ever has to set this when the user is explicit.
export const TASK_PRIORITIES = ["high", "normal", "low"];

export const TRIP_STATUSES = [
  // An idea being worked out. Sits in Drafts on the Trips page, is never the
  // next trip, and leaves only when someone moves it to Upcoming.
  "draft",
  "planning",
  "booked",
  "active",
  "complete",
  "archived",
];

const itineraryFields = {
  title: {
    type: "string",
    description: "Short label, e.g. 'Dinner at Steakhouse 71'",
  },
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
      "Which trip this belongs to — the trip's exact name or id from the context, or the exact name of a trip you are creating with create_trip in this same reply. Leave it out to use the trip that is open. Required when no trip is open.",
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
        quantity: {
          type: "string",
          description: "Free text, e.g. '3' or '2 pairs'",
        },
        category: {
          type: "string",
          description:
            "Grouping such as Clothing, Toiletries, Electronics, Documents",
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
    name: "clear_packing_list",
    description:
      "Empty a trip's packing list in one step. Use this whenever the user wants to replace the whole list rather than edit it — call this once, then add_packing_item for each item on the new list. Never call delete_packing_item dozens of times to clear a list.",
    parameters: {
      type: "object",
      properties: { ...tripField },
      required: [],
    },
  },
  {
    name: "add_task",
    description: "Add a pre-departure checklist task.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        assignee: {
          type: "string",
          description: "Use 'Shared' if unspecified.",
        },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        timing: { type: "string", enum: TASK_TIMINGS },
        priority: {
          type: "string",
          enum: TASK_PRIORITIES,
          description:
            "Only set this when the user says how urgent it is. Leave it out otherwise and it will be normal.",
        },
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
        priority: { type: "string", enum: TASK_PRIORITIES },
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
      'Save a standing travel preference for the family — how they like to travel, in general, on every trip. Only call this when the user states something durable ("we always fly out in the morning", "Veda will not eat seafood"), never for a one-off decision about a single trip. Write it in their own words.',
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
    name: "add_rewards_program",
    description:
      'Put a travel rewards program on the Rewards tab: an airline, a hotel chain, a cruise line past-guest club, a car rental club, or a credit card the family carries. Call this when the user says they belong to something or carry a card ("we have Marriott Bonvoy", "I put everything on the Sapphire Reserve"). For a credit card, always fill in earn_rules and program_name so the app can work out which card a booking should go on, and add any statement credits it carries. Never invent a points balance or a membership number.',
    parameters: {
      type: "object",
      properties: {
        brand: {
          type: "string",
          description:
            "What it is called, as the family would say it: 'Marriott Bonvoy', 'Alaska Mileage Plan', 'Chase Sapphire Reserve'.",
        },
        kind: {
          type: "string",
          description:
            "One of: credit_card, airline, hotel, cruise, car, rail, dining, other. Work it out from the brand.",
        },
        whose: {
          type: "string",
          description:
            "One traveler's name when the account is in their name. Leave this out when it belongs to the whole family.",
        },
        program_name: {
          type: "string",
          description:
            "For a credit card, the currency its points land in: 'Chase Ultimate Rewards', 'Delta SkyMiles', 'Marriott Bonvoy points'. Leave out for a program that is its own currency.",
        },
        currency_label: {
          type: "string",
          description:
            "What the program calls its points, for reading back: 'points', 'miles', 'Rapid Rewards points'.",
        },
        points_balance: {
          type: "integer",
          description:
            "Only when the user tells you a number. Never estimate one.",
        },
        point_value_cents: {
          type: "number",
          description:
            "Roughly what one point is worth in cents, for the estimate the app shows, e.g. 1.2 for Hilton Honors or 2 for Chase Ultimate Rewards. Leave out if you are not reasonably sure.",
        },
        status_tier: {
          type: "string",
          description:
            "Their elite tier if they mention one, in the program's own words: 'Gold Elite', 'Explorist', '4-Star Mariner'.",
        },
        member_number: {
          type: "string",
          description: "Only if the user gives it. Never guess.",
        },
        annual_fee: {
          type: "number",
          description: "For a credit card, the annual fee in dollars.",
        },
        earn_rules: {
          type: "array",
          description:
            "What it earns, one entry per rule, biggest multiplier first. For a credit card this is the whole point of adding it: include the everyday 1x line as well as the bonus categories.",
          items: {
            type: "object",
            properties: {
              rate: {
                type: "number",
                description: "Points per dollar, e.g. 3 for 3x.",
              },
              on: {
                type: "string",
                description:
                  "What it applies to, in a short phrase and in the issuer's own words: 'travel booked through Chase Travel', 'dining', 'everything else'.",
              },
              note: {
                type: "string",
                description:
                  "Any cap or condition in a few words: 'first $6,000 a year'.",
              },
            },
            required: ["rate", "on"],
          },
        },
        credits: {
          type: "array",
          description:
            "Statement credits the card gives back each year — money off, not points: a $300 travel credit, a $200 airline fee credit, a Global Entry fee credit. Only add one you are confident the card carries, and prefer the issuer's own wording for what it covers.",
          items: {
            type: "object",
            properties: {
              amount: {
                type: "number",
                description:
                  "Dollars per reset period, so $10 a month is 10 with resets 'monthly'.",
              },
              on: {
                type: "string",
                description:
                  "What it covers, short and in the issuer's words: 'travel purchases', 'airline incidental fees', 'hotel bookings through the portal'.",
              },
              resets: {
                type: "string",
                description:
                  "One of: monthly, quarterly, semiannual, annual, multiyear. Global Entry style credits are multiyear.",
              },
              note: {
                type: "string",
                description:
                  "Any condition in a few words: 'enrollment required', 'select merchants'.",
              },
            },
            required: ["amount", "on"],
          },
        },
        perks: {
          type: "string",
          description:
            "Benefits worth remembering at booking time: a free night certificate, a companion fare, lounge access.",
        },
        notes: {
          type: "string",
          description:
            "Anything else, including when points expire and where the earning rules came from.",
        },
      },
      required: ["brand", "kind"],
    },
  },
  {
    name: "update_rewards_program",
    description:
      "Change a saved rewards program — most often a new points balance the user just told you. Use the exact id from the Rewards section of the context, and include only what changes. When you set a balance, also set points_checked_on to today so the app can say how fresh it is.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        brand: { type: "string" },
        kind: { type: "string" },
        whose: {
          type: "string",
          description:
            "A traveler's name to make it their account, or 'Shared' to make it the family's.",
        },
        program_name: { type: "string" },
        currency_label: { type: "string" },
        points_balance: { type: "integer" },
        points_checked_on: {
          type: "string",
          description:
            "YYYY-MM-DD, normally today, whenever you set a balance.",
        },
        point_value_cents: { type: "number" },
        status_tier: { type: "string" },
        member_number: { type: "string" },
        annual_fee: { type: "number" },
        earn_rules: {
          type: "array",
          description:
            "Replaces the whole list of earning rules, so pass every rule that should remain.",
          items: {
            type: "object",
            properties: {
              rate: { type: "number" },
              on: { type: "string" },
              note: { type: "string" },
            },
            required: ["rate", "on"],
          },
        },
        credits: {
          type: "array",
          description:
            "Replaces the whole list of statement credits, so pass every credit that should remain.",
          items: {
            type: "object",
            properties: {
              amount: { type: "number" },
              on: { type: "string" },
              resets: { type: "string" },
              note: { type: "string" },
            },
            required: ["amount", "on"],
          },
        },
        perks: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_rewards_program",
    description:
      "Take a rewards program off the list — a card they closed or an account they no longer use. Use the exact id from the context.",
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
        status: {
          type: "string",
          enum: TRIP_STATUSES,
          description:
            "Use 'draft' for a trip the family is still working out; it lands in Drafts on the Trips page instead of on their calendar. 'planning' once they have decided to go.",
        },
        copy_base_packing: {
          type: "boolean",
          description:
            "Give the new trip a packing list, worked out from the family's base template, what they packed on past trips, the destination and the time of year. Defaults to true. The app builds the list itself once the trip is saved, so do not also add packing items for a trip you are creating.",
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
  clear_packing_list: "packing_items",
  add_task: "predeparture_tasks",
  update_task: "predeparture_tasks",
  delete_task: "predeparture_tasks",
  add_note: "trip_notes",
  add_preference: "travel_preferences",
  update_preference: "travel_preferences",
  delete_preference: "travel_preferences",
  add_rewards_program: "rewards_programs",
  update_rewards_program: "rewards_programs",
  delete_rewards_program: "rewards_programs",
  update_review: "itinerary_items",
};

// Tools that write a family-level table and so need no trip in scope.
export const FAMILY_TABLES = new Set([
  "travel_preferences",
  "rewards_programs",
]);

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
  const hit = travelerNames.find((n) => n.toLowerCase() === text.toLowerCase());
  if (hit) return hit;
  const partial = travelerNames.find(
    (n) =>
      n.toLowerCase().startsWith(text.toLowerCase()) ||
      text.toLowerCase().startsWith(n.toLowerCase()),
  );
  return partial || "Shared";
}

// A star rating is 1 through 5, or nothing at all.
export const REWARD_KIND_KEYS = [
  "credit_card",
  "airline",
  "hotel",
  "cruise",
  "car",
  "rail",
  "dining",
  "other",
];

// A whole number the user actually stated: a points balance. Nonsense and
// negatives are dropped rather than clamped, so a bad value is simply not saved.
function cleanCount(value, max) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return n;
}

// Money and cents-per-point, kept to two decimals.
function cleanDecimal(value, max) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined;
  return Math.round(n * 100) / 100;
}

/**
 * What a card earns, as the app stores it: `{ rate, on, note }` per rule. A rule
 * without both a multiplier and something to apply it to says nothing useful, so
 * it is dropped; an empty list is dropped entirely rather than wiping the rules
 * that are already saved.
 */
function cleanEarnRules(value) {
  if (!Array.isArray(value)) return undefined;
  const rules = [];
  for (const raw of value.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const rate = Number(raw.rate);
    const on = cleanText(raw.on, 80);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100 || !on) continue;
    const note = cleanText(raw.note, 80);
    rules.push(prune({ rate: Math.round(rate * 100) / 100, on, note }));
  }
  return rules.length ? rules : undefined;
}

// A statement credit is money the card gives back: { amount, on, resets, note }.
const CREDIT_PERIOD_KEYS = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "multiyear",
];

function cleanCredits(value) {
  if (!Array.isArray(value)) return undefined;
  const credits = [];
  for (const raw of value.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const amount = Number(raw.amount);
    const on = cleanText(raw.on, 80);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000 || !on)
      continue;
    credits.push(
      prune({
        amount: Math.round(amount * 100) / 100,
        on,
        resets: cleanEnum(raw.resets, CREDIT_PERIOD_KEYS) || "annual",
        note: cleanText(raw.note, 80),
      }),
    );
  }
  return credits.length ? credits : undefined;
}

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

/**
 * Which trip a new row belongs to. Returns the trip's id, or `{ pending: name }`
 * when it belongs to a trip being created in this same batch — pasting "start an
 * Italy trip" together with its whole itinerary is the normal way to do this, and
 * that trip has no id yet. Returns null when the reference matches nothing, and
 * undefined when nothing was said and no trip is open.
 */
function resolveTrip(args, known, focusTripId, pendingTrips) {
  const trips = known.trips || new Map();
  const coming = Array.isArray(pendingTrips) ? pendingTrips : [];
  const named = cleanText(args.trip_id, 60) || cleanText(args.trip, 140);

  if (named) {
    if (UUID_RE.test(named)) return trips.has(named) ? named : null;
    const lower = named.toLowerCase();
    for (const [id, tripName] of trips.entries()) {
      if (String(tripName).toLowerCase() === lower) return id;
    }
    for (const name of coming) {
      if (name.toLowerCase() === lower) return { pending: name };
    }
    for (const [id, tripName] of trips.entries()) {
      const other = String(tripName).toLowerCase();
      if (other.includes(lower) || lower.includes(other)) return id;
    }
    for (const name of coming) {
      const other = name.toLowerCase();
      if (other.includes(lower) || lower.includes(other)) {
        return { pending: name };
      }
    }
    return null;
  }

  if (focusTripId && trips.has(focusTripId)) return focusTripId;
  // Nothing named and no trip open: one new trip in the batch is unambiguous.
  if (coming.length === 1) return { pending: coming[0] };
  return undefined;
}

/**
 * The names of trips a batch of model calls is about to create, so everything
 * else in the same batch can be filed against one of them.
 */
export function pendingTripNames(calls) {
  const out = [];
  for (const call of calls || []) {
    const tool = call?.name || call?.tool;
    if (tool !== "create_trip") continue;
    const name = cleanText(call?.args?.name ?? call?.patch?.name, 120);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

// How many rows of one kind sit on a trip, so a whole-list action can say what
// it is about to take away.
function countRowsOnTrip(known, table, tripId) {
  const pool = known[table];
  const rowTrip = known.rowTrip;
  if (!pool || !rowTrip) return 0;
  let n = 0;
  for (const id of pool.keys()) if (rowTrip.get(id) === tripId) n += 1;
  return n;
}

// A new row's trip: its id when the trip exists, otherwise the name of the trip
// being created alongside it, which the apply step turns into an id.
function tripRef(tripId, newTripName) {
  return tripId ? { trip_id: tripId } : { trip: newTripName };
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
    pendingTrips = [],
    // True when the user started this from "Create with Aly" on the Trips page.
    newTripDraft = false,
  } = ctx;
  const name = call?.name;
  const args = call?.args && typeof call.args === "object" ? call.args : {};
  const table = TABLE_FOR_TOOL[name];

  if (!table) return { error: `Unknown action "${name}".` };

  // Which trip the row sits in, and whether that needs saying out loud.
  let tripId;
  let newTripName = null;
  const needsTripScope =
    name.startsWith("add_") || name === "clear_packing_list";
  if (TRIP_SCOPED_TABLES.has(table) && needsTripScope) {
    const resolved = resolveTrip(args, known, focusTripId, pendingTrips);
    if (resolved && typeof resolved === "object")
      newTripName = resolved.pending;
    else tripId = resolved;
    if (resolved === null) {
      return {
        error: "I could not tell which trip you meant, so I did not add that.",
      };
    }
    if (resolved === undefined) {
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

  // Only worth naming the trip when it is not the one already on screen. A trip
  // being created in the same breath is always worth naming.
  const elsewhere =
    tripId && tripId !== focusTripId ? known.trips?.get(tripId) : null;
  const on = newTripName
    ? ` on ${newTripName}`
    : elsewhere
      ? ` on ${elsewhere}`
      : "";
  // Carried on the action so the apply step can refuse politely, and the panel
  // can keep this chunk locked until the trip itself is approved.
  const pendingOn = newTripName ? { needsTrip: newTripName } : {};

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
        // Anything started from "Create with Aly" is an idea until the family
        // moves it across themselves, whatever status the model asked for.
        if (newTripDraft) patch.status = "draft";
        // Carried in the patch so it survives revalidation, stripped on write.
        const copy = cleanBool(args.copy_base_packing);
        if (copy !== undefined) patch.copy_base_packing = copy;
        else if (newTripDraft) patch.copy_base_packing = true;
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
            createsTrip: patch.name,
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
        Object.assign(patch, tripRef(tripId, newTripName));
        return {
          action: {
            tool: name,
            table,
            patch,
            ...pendingOn,
            summary: `Add "${patch.title}" to the itinerary on ${patch.item_date}${
              patch.start_time ? ` at ${patch.start_time}` : ""
            }${on}`,
          },
        };
      }
      if (Object.keys(patch).length === 0)
        return {
          error: "No valid changes were given for that itinerary item.",
        };
      return {
        action: {
          tool: name,
          table,
          id,
          patch,
          summary: `Update ${label(
            "itinerary item",
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
          destructive: true,
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
        Object.assign(patch, tripRef(tripId, newTripName));
        return {
          action: {
            tool: name,
            table,
            patch,
            ...pendingOn,
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
          destructive: true,
          summary: `Remove ${label("an item")} from the packing list${on}`,
        },
      };

    // One action instead of one per row, so replacing a forty-item list is a
    // single decision the family can see, and a single write.
    case "clear_packing_list": {
      const patch = tripRef(tripId, newTripName);
      const count = tripId
        ? countRowsOnTrip(known, "packing_items", tripId)
        : 0;
      if (tripId && count === 0) {
        return { error: "That packing list is already empty." };
      }
      const where = newTripName ? ` on ${newTripName}` : on;
      return {
        action: {
          tool: name,
          table,
          patch,
          ...pendingOn,
          destructive: true,
          summary: count
            ? `Empty the packing list${where} — all ${count} item${count === 1 ? "" : "s"}. This cannot be undone.`
            : `Empty the packing list${where}. This cannot be undone.`,
        },
      };
    }

    case "add_task":
    case "update_task": {
      const patch = prune({
        title: cleanText(args.title, 200),
        assignee: matchAssignee(args.assignee, travelerNames),
        due_date: cleanDate(args.due_date),
        timing: cleanEnum(args.timing, TASK_TIMINGS),
        priority: cleanEnum(args.priority, TASK_PRIORITIES),
        detail: cleanText(args.detail, 1000),
        is_done: cleanBool(args.is_done),
      });
      if (name === "add_task") {
        if (!patch.title) return { error: "A task needs a title." };
        delete patch.is_done;
        // Nobody named means the whole family, same as the packing list.
        if (!patch.assignee) patch.assignee = "Shared";
        Object.assign(patch, tripRef(tripId, newTripName));
        return {
          action: {
            tool: name,
            table,
            patch,
            ...pendingOn,
            summary: `Add task "${patch.title}" for ${patch.assignee}${
              patch.due_date ? ` due ${patch.due_date}` : ""
            }${
              patch.priority && patch.priority !== "normal"
                ? `, ${patch.priority} priority`
                : ""
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
          destructive: true,
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
        ...tripRef(tripId, newTripName),
      });
      return {
        action: {
          tool: name,
          table,
          patch,
          ...pendingOn,
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
        for (const [n, tid] of travelerIds.entries())
          if (tid === value) return n;
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
            "saved preference",
          )}”: ${bits.join(", ")}`,
        },
      };
    }

    case "add_rewards_program":
    case "update_rewards_program": {
      const patch = prune({
        brand: cleanText(args.brand, 120),
        kind: cleanEnum(args.kind, REWARD_KIND_KEYS),
        traveler_id: prefTraveler(args, travelerNames, travelerIds),
        program_name: cleanText(args.program_name, 120),
        currency_label: cleanText(args.currency_label, 40),
        points_balance: cleanCount(args.points_balance, 1000000000),
        points_checked_on: cleanDate(args.points_checked_on),
        point_value_cents: cleanDecimal(args.point_value_cents, 500),
        status_tier: cleanText(args.status_tier, 60),
        member_number: cleanText(args.member_number, 60),
        annual_fee: cleanDecimal(args.annual_fee, 10000),
        earn_rules: cleanEarnRules(args.earn_rules),
        credits: cleanCredits(args.credits),
        perks: cleanText(args.perks, 600),
        notes: cleanText(args.notes, 1000),
      });

      const rules = patch.earn_rules;
      const earnBit =
        rules && rules.length
          ? `, earning ${rules
              .slice(0, 3)
              .map((r) => `${r.rate}x on ${clip(r.on, 28)}`)
              .join(", ")}${rules.length > 3 ? " and more" : ""}`
          : "";
      const creditBit =
        patch.credits && patch.credits.length
          ? `, ${patch.credits
              .slice(0, 2)
              .map((c) => `$${c.amount} on ${clip(c.on, 24)}`)
              .join(
                ", ",
              )}${patch.credits.length > 2 ? " and more credits" : ""}`
          : "";
      const balanceBit =
        patch.points_balance !== undefined
          ? `, ${Number(patch.points_balance).toLocaleString("en-US")} ${
              patch.currency_label || "points"
            }`
          : "";

      if (name === "add_rewards_program") {
        if (!patch.brand) return { error: "A rewards program needs a name." };
        if (!patch.kind)
          return {
            error: `I could not tell what kind of program ${patch.brand} is, so I did not add it.`,
          };
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Add ${patch.brand} to Rewards${balanceBit}${earnBit}${creditBit}`,
          },
        };
      }

      if (Object.keys(patch).length === 0)
        return {
          error: "No valid changes were given for that rewards program.",
        };
      const bits = [];
      if (patch.brand) bits.push(`name → ${clip(patch.brand, 40)}`);
      if (patch.points_balance !== undefined)
        bits.push(
          `balance → ${Number(patch.points_balance).toLocaleString("en-US")}`,
        );
      if (patch.status_tier) bits.push(`status → ${patch.status_tier}`);
      if (patch.member_number) bits.push("membership number");
      if (rules && rules.length) bits.push(`${rules.length} earning rules`);
      if (patch.credits && patch.credits.length)
        bits.push(
          `${patch.credits.length} statement ${
            patch.credits.length === 1 ? "credit" : "credits"
          }`,
        );
      if (patch.annual_fee !== undefined)
        bits.push(`annual fee → $${patch.annual_fee}`);
      if (patch.perks) bits.push("perks");
      if (patch.notes) bits.push("notes");
      if (!bits.length) bits.push("details");
      return {
        action: {
          tool: name,
          table,
          id,
          patch,
          summary: `Update ${label("that rewards program")}: ${bits.join(", ")}`,
        },
      };
    }

    case "delete_rewards_program":
      return {
        action: {
          tool: name,
          table,
          id,
          destructive: true,
          summary: `Remove ${label("that rewards program")} from Rewards`,
        },
      };

    case "delete_preference":
      return {
        action: {
          tool: name,
          table,
          id,
          destructive: true,
          summary: `Remove the travel preference “${label(
            "saved preference",
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
            "a place from a past trip",
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
  priority: "priority",
};

function describePatch(patch) {
  return Object.entries(patch)
    .filter(([k]) => k !== "trip_id" && k !== "trip")
    .map(([k, v]) => `${FIELD_LABELS[k] || k} → ${v}`)
    .join(", ");
}
