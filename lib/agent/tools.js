// Tool definitions for the trip assistant, plus the server-side validation and
// write handlers. Everything the model can do to the trip lives here.

import { ARRANGEMENTS, SPECIES, TRAVEL_STYLES } from "@/lib/pets/pets";
import { addDays, SPANNING_CATEGORIES } from "../format";
import { LESSON_KINDS } from "./lessons";
import { oneOrShared } from "../people";
import {
  MOBILITY_AID_VALUES,
  aidPhrase,
  cleanAids,
  parseLanguages,
} from "../travelers/profile";

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

// An itinerary row lands as "planned" when no status is given, so a suggestion
// that forgot to say "optional" is indistinguishable on the card from something
// the family actually decided on. Naming it on the card is what makes that
// visible before they agree to it.
function statusNote(status) {
  if (status === "optional") return " as an option";
  if (status === "needs_booking") return " — needs booking";
  if (status === "confirmed") return " — confirmed";
  return " as planned";
}

// "Mark and Veda" rather than "Mark, Veda" — these strings are read by a person.
function listPeople(names) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

const itineraryFields = {
  title: {
    type: "string",
    description: "Short label, e.g. 'Dinner at Steakhouse 71'",
  },
  item_date: {
    type: "string",
    description:
      "Date in YYYY-MM-DD. For a lodging stay or a cruise this is the check-in or sailing day.",
  },
  end_date: {
    type: "string",
    description:
      "Only for lodging and cruise items: the check-out date, or the last day of the cruise, in YYYY-MM-DD. A stay always covers at least one night, so this must be at least the day after item_date. Set it whenever the check-out day is known, and prefer one item with a date range over a separate 'check out' item. Never set this on a flight, meal, tour or note.",
  },
  start_time: {
    type: "string",
    description:
      "24-hour time as HH:MM. Omit for all-day items. For a stay this is the check-in time.",
  },
  category: { type: "string", enum: ITINERARY_CATEGORIES },
  status: {
    type: "string",
    enum: ITINERARY_STATUSES,
    description:
      "Use 'optional' for anything you thought of rather than the family deciding on it — it shows as an 'Option' they can drop. 'needs_booking' for something they have chosen that still needs arranging, 'confirmed' once they say it is booked, 'planned' for something settled that needs no booking.",
  },
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
    name: "tidy_packing_list",
    description:
      "Set aside every item on a trip's packing list that belongs to somebody who is not on that trip, in one step. Use this when the user says somebody came off the trip but their things are still on the list, or when the list is out of step with who is going. Nothing is destroyed: the items are held to one side, packed state and notes intact, and they all come back if that person is added to the trip again. Never call delete_packing_item once per row to do this.",
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
        due_date: {
          type: "string",
          description:
            "YYYY-MM-DD, when it is due on a particular day. A task answers 'when' either with a due date or with a timing stage, never both — set the date when the user names a day, and everyone responsible is emailed that morning.",
        },
        timing: {
          type: "string",
          enum: TASK_TIMINGS,
          description:
            "The stage it belongs to when no particular day was named. Leave it out if you are setting due_date.",
        },
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
        due_date: {
          type: "string",
          description:
            'YYYY-MM-DD to put it on a day, or "none" to take the date away and leave it at a stage.',
        },
        timing: {
          type: "string",
          enum: TASK_TIMINGS,
          description:
            'The stage instead of a day. Setting this clears nothing on its own — send due_date: "none" if the user wants the day dropped.',
        },
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
    name: "record_lesson",
    description:
      "Keep something you have worked out, so the next conversation starts from it instead of working it out again. For knowledge behind the plan: how an operator's booking window really works, that a level the family holds moves a date, that a kind of place turns out not to suit them, a habit that keeps repeating. NOT for anything the app already holds — a preference, a date, a task, a balance — and never for a guess. One or two concrete sentences.",
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description:
            "A short heading, so it can be found again later, e.g. 'Castaway Club excursion windows' or 'Veda and long drives'.",
        },
        body: {
          type: "string",
          description:
            "The lesson itself, one or two sentences, concrete, including why it matters. Write what is true rather than what happened in the chat.",
        },
        kind: {
          type: "string",
          enum: [
            "operator",
            "place",
            "family",
            "logistics",
            "money",
            "health",
            "packing",
            "other",
          ],
          description:
            "operator for a company's own rules, place for somewhere they went, family for how these people are, logistics for getting about, money, health, packing, or other.",
        },
        trip: {
          type: "string",
          description:
            "The exact name of the trip this belongs to. Leave it out when the lesson is true of this family on every trip.",
        },
        told_by_family: {
          type: "boolean",
          description:
            "True when the family stated it in this conversation, false or omitted when you worked it out yourself.",
        },
      },
      required: ["subject", "body"],
    },
  },
  {
    name: "recall_lessons",
    description:
      "Look through everything you have recorded, beyond the notes already listed in your context. Use it when the answer probably rests on something you noted earlier — 'what did we decide about', 'last time', an operator's rules on a trip that is not open. This saves and changes nothing; you get the matching notes back and then answer. Call it at most once in a reply, and never twice about the same thing.",
    parameters: {
      type: "object",
      properties: {
        about: {
          type: "string",
          description:
            "What you are trying to remember, in the words most likely to appear in the note, e.g. 'Holland America shore excursion booking' rather than 'that thing about the cruise'.",
        },
        subject: {
          type: "string",
          description:
            "The heading of a particular note, when you already know it from the context.",
        },
      },
      required: ["about"],
    },
  },
  {
    name: "retire_lesson",
    description:
      "Put aside a note of yours that has turned out to be wrong or out of date, so it stops being read back to you. Use the exact id from the notes in your context. The note is kept but no longer used.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        why: {
          type: "string",
          description: "One short phrase on what was wrong with it.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "show_places",
    description:
      "Show a shortlist of real places as cards the family can look at: restaurants, hotels, or things to do. Call this whenever you recommend somewhere, INSTEAD OF listing the places in your reply - the card carries a photo, the address, a link to the place, a link to the map, and a button to put it on the itinerary. Then keep your reply to a sentence or two saying how you chose. This saves nothing and changes nothing; the family taps a card to add it. Only real places you are confident exist.",
    parameters: {
      type: "object",
      properties: {
        places: {
          type: "array",
          description: "Between two and six places, best first.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description:
                  "The place's name exactly as it is written on its own sign, with no area or description appended.",
              },
              kind: {
                type: "string",
                enum: ["eat", "stay", "do"],
                description:
                  "eat for a restaurant, bar or cafe; stay for a hotel or resort; do for an activity, tour, museum or sight.",
              },
              area: {
                type: "string",
                description:
                  "Town, district or island, plus the country if it is not obvious. Used to find the right place on the map, so it must be accurate.",
              },
              why: {
                type: "string",
                description:
                  "One or two sentences: why this one suits this family, on this trip. Mention a saved preference or a review of theirs when it is the reason.",
              },
              price: {
                type: "string",
                description:
                  "A rough price band in the local currency, or a $ to $$$$ band. Leave out if unsure.",
              },
              website: {
                type: "string",
                description:
                  "The place's own website, only if you actually read it. Never a search result link.",
              },
            },
            required: ["name", "kind", "area", "why"],
          },
        },
      },
      required: ["places"],
    },
  },
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
            "One traveler's name when the preference is only about that person \u2014 it will then be used on the trips they are on, and left out of the ones they are not. Use 'Shared', or leave this out, when it is true of the whole family.",
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
    name: "add_pet",
    description:
      'Add a pet to the family. Call this when the user mentions an animal of theirs for the first time ("our dog Biscuit", "we have two cats"). The weight in pounds and the rabies certificate date are the two that decide things later, so ask for them if the user has not said them — but add the pet with just a name rather than refusing. Set is_service_animal only when the user says the animal is a trained service animal; an emotional support animal is not one.',
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The pet's name." },
        species: {
          type: "string",
          description:
            "One of: " +
            SPECIES.map((x) => x.id).join(", ") +
            ". Work it out from what the user said; default to dog only if they clearly mean a dog.",
        },
        breed: { type: "string", description: "Breed, if the user says one." },
        date_of_birth: {
          type: "string",
          description:
            "YYYY-MM-DD if known. Airlines will not fly a puppy or kitten under eight weeks, so this matters for a young animal.",
        },
        weight_lb: {
          type: "number",
          description:
            "Weight in pounds. Never estimate one from the breed — a guess here is what puts a family at a counter with a dog that cannot board.",
        },
        travel_style: {
          type: "string",
          description:
            "One of: " +
            TRAVEL_STYLES.map((x) => x.id).join(", ") +
            ". Only when the user has said how the animal travels.",
        },
        carrier_size: {
          type: "string",
          description: "The carrier they have, in the user's words.",
        },
        is_service_animal: {
          type: "boolean",
          description:
            "True only for a trained service animal. Not for an emotional support animal, a therapy animal or a much-loved pet.",
        },
        microchip_number: { type: "string" },
        rabies_expiration: {
          type: "string",
          description:
            "YYYY-MM-DD the rabies certificate runs to. Never guess this date.",
        },
        health_certificate_expiration: {
          type: "string",
          description: "YYYY-MM-DD, if they already hold one.",
        },
        vet_name: { type: "string" },
        vet_phone: { type: "string" },
        medications: { type: "string" },
        dietary_notes: { type: "string", description: "What the pet eats." },
        temperament_notes: {
          type: "string",
          description:
            "How the animal copes: crate trained, nervous in cars, fine around other dogs. This decides whether a long drive or a busy patio is a good idea.",
        },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_pet",
    description:
      "Change something already recorded about a pet. Use the exact id from the context. Only send the fields that change.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        species: { type: "string" },
        breed: { type: "string" },
        date_of_birth: { type: "string" },
        weight_lb: { type: "number" },
        travel_style: { type: "string" },
        carrier_size: { type: "string" },
        is_service_animal: { type: "boolean" },
        microchip_number: { type: "string" },
        rabies_expiration: { type: "string" },
        health_certificate_expiration: { type: "string" },
        vet_name: { type: "string" },
        vet_phone: { type: "string" },
        medications: { type: "string" },
        dietary_notes: { type: "string" },
        temperament_notes: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_pet",
    description:
      "Remove a pet from the family. Use the exact id from the context. This is for a record added by mistake — do not reach for it because a pet is staying home from one trip; use set_pet_trip for that.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "set_pet_trip",
    description:
      'Say what happens to a pet for one trip: coming along, boarding, staying with a sitter, staying with family, or not decided. Call this whenever the user settles it ("Biscuit is coming to Alaska", "the cats will board over Thanksgiving"). Use arrangement "none" to take a pet off a trip entirely.',
    parameters: {
      type: "object",
      properties: {
        pet: {
          type: "string",
          description: "The pet, by name as it appears in the context.",
        },
        trip: {
          type: "string",
          description:
            "The trip, by name as it appears in the context. Leave out to use the trip on screen.",
        },
        arrangement: {
          type: "string",
          description:
            "One of: " +
            ARRANGEMENTS.map((x) => x.id).join(", ") +
            ", or none to take the pet off the trip.",
        },
        arrangement_notes: {
          type: "string",
          description:
            "Anything worth keeping: the kennel's name, the sitter's phone number, dates that differ from the trip's.",
        },
      },
      required: ["pet", "arrangement"],
    },
  },
  {
    name: "add_rewards_program",
    description:
      'Put a travel program in the Wallet: an airline, a hotel chain, a cruise line past-guest club, a car rental club, or a credit card the family carries. Call this when the user says they belong to something or carry a card ("we have Marriott Bonvoy", "I put everything on the Sapphire Reserve"). For a credit card, always fill in earn_rules and program_name so the app can work out which card a booking should go on, and add any statement credits it carries. Never invent a points balance or a membership number.',
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
      "Change a saved rewards program — most often a new points balance the user just told you. Use the exact id from the travel programs section of the context, and include only what changes. When you set a balance, also set points_checked_on to today so the app can say how fresh it is.",
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
    name: "create_template",
    description:
      'Start a new PACKING TEMPLATE — one of the lists every future trip is built from. Use this when the user wants a list for a kind of trip they take more than once ("a Disney list", "a horse show list", "a cruise list"), and especially when they ask for one BASED ON a list they already have. Copy the contents from a trip\'s packing list with copy_from_trip, or from another packing template with copy_from_list, and narrow it to particular categories with only_categories. This is the only way to make a new list: never try to add items to a list that does not exist yet. Creating a list changes nothing on any trip, and copying from somewhere leaves the source untouched.',
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "What to call the list, e.g. 'Disney Parks'",
        },
        description: {
          type: "string",
          description:
            "One line on when this list applies, e.g. 'Add on for Walt Disney World and Disney Cruise Line trips'.",
        },
        copy_from_trip: {
          type: "string",
          description:
            "Fill the new list from this trip's packing list. Use the trip's name from the context, or the word 'this' for the trip that is open. Leave out if the contents come from somewhere else.",
        },
        copy_from_list: {
          type: "string",
          description:
            "Fill the new list from another packing template, by its exact name. Use this when the user wants part of an existing list split out into its own.",
        },
        only_categories: {
          type: "string",
          description:
            "Take only these categories and nothing else, comma separated, e.g. 'Disney Specific'. Use the category names exactly as they appear in the context. Leave out to take everything.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "add_template_item",
    description:
      "Add one item to a PACKING TEMPLATE — the lists every future trip is built from, not any one trip's list. Use this when the user is talking about what the family always takes, or is on the Packing templates screen. Call once per distinct item. This changes nothing on trips that already exist.",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string" },
        assignee: {
          type: "string",
          description:
            "Who always packs it. Use 'Shared' for things the family shares.",
        },
        quantity: {
          type: "string",
          description: "Free text, e.g. '3' or '2 pairs'",
        },
        category: {
          type: "string",
          description:
            "Grouping such as Clothing & Shoes, Toiletries, Electronics",
        },
        list: {
          type: "string",
          description:
            "Which packing template, by its exact name from the PACKING TEMPLATES context. Leave it out for the base list that every trip starts from. Put gear specific to one kind of trip on the matching add-on list instead of the base.",
        },
      },
      required: ["item"],
    },
  },
  {
    name: "update_template_item",
    description:
      "Change an item on a packing template: rename it, move it to another person, or change its category or quantity. Use the exact id from the PACKING TEMPLATES context.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        item: { type: "string" },
        assignee: { type: "string" },
        quantity: { type: "string" },
        category: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_template_item",
    description:
      "Take an item off a packing template so it stops appearing on future trips. Use the exact id from the PACKING TEMPLATES context.",
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
        start_date: {
          type: "string",
          description: "The first day of the trip, YYYY-MM-DD",
        },
        end_date: {
          type: "string",
          description:
            "The last day of the trip, YYYY-MM-DD, counted as part of it. Unlike a hotel stay, a trip may begin and end on the same day, so use the same date for both on a day trip.",
        },
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
        travelers: {
          type: "array",
          items: { type: "string" },
          description:
            "Who is actually going, by name, when it is not the whole family. Leave it out when everyone is going. This sets who is on the trip, which the app shows on the trip and uses to keep the packing list to those people and whatever is shared, so nobody packs for someone who stayed home.",
        },
        pets: {
          type: "array",
          items: { type: "string" },
          description:
            "Which of the family's animals are coming, by name. Only on create_trip, and only when the family has said. Each one is put on the trip and gets its own packing lines added from its template. An animal that is staying home, boarding or with a sitter is simply left out; use set_pet_trip afterwards if they want that recorded. Leave it out entirely when no animal is coming or when they have not said.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "start_packing_list",
    description:
      "Offer to fill in a trip's packing list. Always suggest this for a trip you are creating, and suggest it as its OWN separate call so the family can take the packing list or leave it without that changing anything about the trip. The app works out what goes on the list itself once it is approved — from the family's base list, what they packed on past trips, and where and when this trip is — so do not list the items yourself and never add packing items one at a time for a trip you are creating. Only for a trip whose packing list is still empty.",
    parameters: {
      type: "object",
      properties: {
        trip: {
          type: "string",
          description:
            "Which trip, by its exact name. Use the name of a trip you are creating in the same reply.",
        },
      },
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
        start_date: {
          type: "string",
          description: "The first day of the trip, YYYY-MM-DD",
        },
        end_date: {
          type: "string",
          description:
            "The last day of the trip, YYYY-MM-DD, counted as part of it. May be the same day as start_date on a day trip.",
        },
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
  {
    name: "set_person_email",
    description:
      "Give one person in the family an email address so they can sign in and edit the trips themselves. Whoever owns that address can then use Continue with Google and gets recorded as the author of their own changes. Only call this when the user gives you an actual address for a named person. Use it to correct a wrong address too.",
    parameters: {
      type: "object",
      properties: {
        whose: {
          type: "string",
          description:
            "The person's name, exactly as it appears in the family's people list.",
        },
        email: {
          type: "string",
          description:
            "Their email address. A Gmail address is what lets them use Continue with Google.",
        },
      },
      required: ["whose", "email"],
    },
  },
  {
    name: "set_person_details",
    description:
      "Record what is true of one person rather than of a trip: their date of birth, their cell phone provider and device, the equipment they travel with, anything else about getting around, and the languages they speak. Call this whenever the user tells you any of it — 'Veda was born on February 2nd 2014', 'Steph is on AT&T', 'Veda still needs the stroller', 'I speak some Spanish'. These are what let advice be specific, so it is worth recording the moment it is said. Send only the parts you were actually told; anything left out keeps the value it already has. Passports, licenses and Known Traveler numbers are NOT here — those live on the Family tab and only the user can edit them.",
    parameters: {
      type: "object",
      properties: {
        whose: {
          type: "string",
          description:
            "The person's name, exactly as it appears in the family's people list.",
        },
        date_of_birth: {
          type: "string",
          description:
            "Their date of birth as YYYY-MM-DD. Record it whenever the user tells you a birthday or an age — an age is only useful if you turn it into a birth date, so ask for the day rather than storing 'about 12'. This is the fact that rules out adults-only places and settles age minimums, fares and tickets. An empty string clears it.",
        },
        phone_carrier: {
          type: "string",
          description:
            "Their cell phone provider, as people say it: 'Verizon', 'AT&T', 'T-Mobile', 'Mint Mobile'. An empty string clears it.",
        },
        phone_device: {
          type: "string",
          description:
            "The phone or tablet they carry, e.g. 'iPhone 15 Pro', 'Pixel 8'. An empty string clears it.",
        },
        mobility_aids: {
          type: "array",
          description:
            "Everything they travel with, as a complete replacement list — send the whole list every time, including what was already there, because an omitted item is treated as removed. Send an empty array to say they travel with none of these.",
          items: {
            type: "string",
            enum: MOBILITY_AID_VALUES,
          },
        },
        accessibility_notes: {
          type: "string",
          description:
            "Anything else about getting around that does not fit the list, in the family's own words, e.g. 'cannot manage long stairs'. An empty string clears it.",
        },
        languages: {
          type: "array",
          description:
            "Every language this person speaks, as a complete replacement list, in English: ['English','Spanish']. Send an empty array to clear it.",
          items: { type: "string" },
        },
      },
      required: ["whose"],
    },
  },
  {
    name: "invite_person",
    description:
      "Email one person the branded sign-in message telling them the planner is waiting for them. They must already have an email address saved — call set_person_email first if they do not. This is only a nudge: the saved address is what actually lets them in, so never call this hoping to grant access.",
    parameters: {
      type: "object",
      properties: {
        whose: {
          type: "string",
          description: "The person to email, by name.",
        },
      },
      required: ["whose"],
    },
  },
  {
    name: "find_tips",
    // Not a change and not an answer either: a request to go and research. The
    // route cannot do it inside this turn — a grounded look takes most of the
    // sixty seconds the chat route gets, and walking a trip takes several — so
    // this call comes back as an instruction the screen carries out, the same
    // loop the "Look for tips" button drives.
    description:
      "Go and research this trip for pro tips: rules, timing, booking windows and local realities that this family would want to know about the exact places and dates on their itinerary. Call this when they ask what they should know, what to watch out for, whether anything needs booking, or ask you to look for tips — and also when you find yourself about to guess at that sort of thing, because this searches the web and your own recollection does not. It saves nothing they have to undo: what it finds appears as tips they can act on or clear. It takes up to a minute, so say you are looking and let it run. Do not call it twice in one reply.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["trip", "packing", "item"],
          description:
            "trip to walk the whole trip, which also covers the packing list and the next few dated bookings — the right choice for a general question. packing for what they are taking and nothing else. item for one booking or activity, which needs the name below.",
        },
        item: {
          type: "string",
          description:
            "Only with scope item: the itinerary item to advise on, by its title as it appears in the context. Leave out otherwise.",
        },
      },
      required: ["scope"],
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
  tidy_packing_list: "packing_items",
  start_packing_list: "packing_items",
  add_task: "predeparture_tasks",
  update_task: "predeparture_tasks",
  delete_task: "predeparture_tasks",
  add_note: "trip_notes",
  add_preference: "travel_preferences",
  record_lesson: "lessons",
  retire_lesson: "lessons",
  update_preference: "travel_preferences",
  delete_preference: "travel_preferences",
  add_pet: "pets",
  update_pet: "pets",
  delete_pet: "pets",
  set_pet_trip: "trip_pets",
  add_rewards_program: "rewards_programs",
  update_rewards_program: "rewards_programs",
  delete_rewards_program: "rewards_programs",
  update_review: "itinerary_items",
  create_template: "packing_templates",
  add_template_item: "packing_template_items",
  update_template_item: "packing_template_items",
  delete_template_item: "packing_template_items",
  set_person_email: "travelers",
  set_person_details: "travelers",
  invite_person: "travelers",
};

// Tools that write a family-level table and so need no trip in scope.
// Tools that change a row that already exists although their name does not begin
// with "update_". Reading the shape of a write off the front of its name is a
// small trick that holds for nearly all of them; this is where the exceptions are
// written down rather than guessed at twice.
export const EDIT_TOOLS = new Set(["retire_lesson"]);

export const FAMILY_TABLES = new Set([
  "travel_preferences",
  "rewards_programs",
  "lessons",
  "pets",
]);

// Rows that belong to a packing template rather than to a trip. A write
// names the list instead, and defaults to the base one.
export const TEMPLATE_TABLES = new Set(["packing_template_items"]);

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

/**
 * A task's due date, which is also the one date the user can take away.
 *
 * "Actually no fixed day, just before we go" is a real instruction, and with the
 * ordinary cleaner it was unsayable: an empty value looked identical to a value
 * nobody mentioned, so it was dropped and the old date survived. A few plain
 * words, and null itself, mean remove it. Null is deliberate — the patch is fed
 * back through here when the change is applied, so a cleared date has to survive
 * the round trip.
 */
const NO_DATE = new Set([
  "none",
  "no date",
  "nothing",
  "clear",
  "remove",
  "no",
]);

function cleanDueDate(value) {
  if (value === null) return null;
  const text = cleanText(value, 12);
  if (text && NO_DATE.has(text.toLowerCase())) return null;
  return cleanDate(value);
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

// Deliberately loose: the point is to catch a name typed into the wrong field or
// a mangled paste, not to adjudicate what a valid address is.
function cleanEmail(value) {
  const text = cleanText(value, 200);
  if (!text) return null;
  const trimmed = text.trim().toLowerCase();
  return /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/.test(trimmed) ? trimmed : null;
}

function matchAssignee(value, travelerNames) {
  const text = cleanText(value, 60);
  if (!text) return undefined;
  // One traveler or the whole family, and nothing in between. See lib/people.
  return oneOrShared(text, travelerNames);
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
// Which packing template an item goes on. Nothing named means the base
// list, which is the one every trip starts from and the one people mean when
// they say "our packing list".
function resolveTemplate(args, known) {
  const templates = known.packing_templates || new Map();
  // template_id first, the way resolveTrip takes trip_id first: the apply route
  // revalidates with the patch as args, so a list resolved on the first pass
  // arrives on the second as template_id and nothing else. Ignoring it here sent
  // the item to the base list instead — the wrong list, reported as success.
  const named =
    cleanText(args.template_id, 60) ||
    cleanText(args.list, 140) ||
    cleanText(args.template, 140);

  if (named) {
    if (UUID_RE.test(named)) return templates.has(named) ? named : null;
    const lower = named.toLowerCase();
    for (const [id, t] of templates.entries()) {
      if (String(t?.name || "").toLowerCase() === lower) return id;
    }
    for (const [id, t] of templates.entries()) {
      const other = String(t?.name || "").toLowerCase();
      if (other && (other.includes(lower) || lower.includes(other))) return id;
    }
    return null;
  }

  for (const [id, t] of templates.entries()) if (t?.is_base) return id;
  // No list is marked as the base one, so only a single list is unambiguous.
  if (templates.size === 1) return templates.keys().next().value;
  return undefined;
}

// The source of a copy, which must be named outright. resolveTemplate falls back
// to the base list when nothing is named, and that fallback would be dangerous
// here: silently copying ninety items off the wrong list is worse than refusing.
function resolveNamedTemplate(named, known) {
  if (!named) return undefined;
  return resolveTemplate({ list: named }, known);
}

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

const SPECIES_KEYS = SPECIES.map((x) => x.id);
const TRAVEL_STYLE_KEYS = TRAVEL_STYLES.map((x) => x.id);
const ARRANGEMENT_KEYS = ARRANGEMENTS.map((x) => x.id);

function speciesLabelFor(id) {
  return SPECIES.find((x) => x.id === id)?.label || "pet";
}

function arrangementLabelFor(id) {
  return ARRANGEMENTS.find((x) => x.id === id)?.label || "not decided yet";
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
  // Adding something needs a trip to add it to, and so do the two whole-list
  // actions, which name a trip rather than a row.
  const needsTripScope =
    name.startsWith("add_") ||
    name === "clear_packing_list" ||
    name === "tidy_packing_list" ||
    name === "start_packing_list";
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

  const needsId =
    name.startsWith("update_") ||
    name.startsWith("delete_") ||
    EDIT_TOOLS.has(name);
  let id;
  if (needsId) {
    id = cleanText(args.id, 40);
    if (!id || !UUID_RE.test(id)) {
      return { error: "That action referred to an item I could not identify." };
    }
    const pool = known[table] || new Map();
    if (!pool.has(id)) {
      if (TEMPLATE_TABLES.has(table)) {
        return {
          error:
            "I could not find that on any of your packing templates, so I did not change it.",
        };
      }
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
        // Anything started from "Create with Aly" is an idea unless the family
        // said otherwise. This used to force "draft" whatever status was asked
        // for, which made the question Aly asks — draft, or a trip you mean to
        // take? — a question whose answer could not change anything. Someone who
        // says "it's a real trip" and gets a draft anyway has been ignored, so an
        // explicit status now wins and only the silence defaults to a draft.
        if (newTripDraft && !patch.status) patch.status = "draft";
        // Who is going is not a column on a trip, so it is carried in the patch,
        // used to trim the packing list, and then stripped before the write.
        // Names are checked here because a typo would quietly trim the list down
        // to nothing but the shared items.
        if (args.travelers !== undefined && args.travelers !== null) {
          const asked = (
            Array.isArray(args.travelers) ? args.travelers : [args.travelers]
          )
            .map((n) => cleanText(n, 80))
            .filter(Boolean);
          const resolved = [];
          for (const n of asked) {
            const match = travelerNames.find(
              (t) => t.toLowerCase() === n.toLowerCase(),
            );
            if (!match) {
              return {
                error: `I do not know who ${n} is. The people on this family are ${travelerNames.join(", ")}.`,
              };
            }
            if (!resolved.includes(match)) resolved.push(match);
          }
          // Everyone going is the same as not saying, and "Shared" on its own
          // names no one, so both are left off rather than trimming to nothing.
          const people = resolved.filter((n) => n !== "Shared");
          if (people.length && people.length < travelerNames.length - 1) {
            patch.travelers = people;
          }
        }
        // Which animals are coming, resolved to ids here so that a typo is
        // caught while the family can still see the card, rather than becoming a
        // trip with a dog on it that does not exist. Like travelers, this is not
        // a column: the apply step reads it, writes the trip_pets rows and the
        // pet's packing lines, then strips it.
        if (args.pets !== undefined && args.pets !== null) {
          const petsKnown = known.pets || new Map();
          const asked = (Array.isArray(args.pets) ? args.pets : [args.pets])
            .map((n) => cleanText(n, 60))
            .filter(Boolean);
          const petIds = [];
          const petNamesOn = [];
          for (const n of asked) {
            const lower = n.toLowerCase();
            let found;
            for (const [pid, pname] of petsKnown.entries()) {
              if (String(pname).toLowerCase() === lower) found = pid;
            }
            if (!found) {
              const names = Array.from(petsKnown.values());
              return {
                error: names.length
                  ? `I have no pet called ${clip(n, 30)} on file. The animals on this family are ${names.join(", ")}.`
                  : `I have no pets on file for this family, so I could not put ${clip(n, 30)} on the trip.`,
              };
            }
            if (!petIds.includes(found)) {
              petIds.push(found);
              petNamesOn.push(petsKnown.get(found));
            }
          }
          if (petIds.length) {
            patch.pets = petIds;
            patch.pet_names = petNamesOn;
          }
        }
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
            // Who is going belongs on the card: it changes what lands on the
            // packing list, so approving it blind would be a surprise.
            summary: `Create the trip "${patch.name}"${when}${
              patch.travelers ? ` for ${listPeople(patch.travelers)}` : ""
            }${
              patch.pet_names
                ? `, with ${listPeople(patch.pet_names)} coming`
                : ""
            }`,
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
        end_date: cleanDate(args.end_date),
        start_time: cleanTime(args.start_time),
        category: cleanEnum(args.category, ITINERARY_CATEGORIES),
        status: cleanEnum(args.status, ITINERARY_STATUSES),
        location: cleanText(args.location, 300),
        confirmation_number: cleanText(args.confirmation_number, 60),
        notes: cleanText(args.notes, 2000),
      });
      // A second date only makes sense on a stay, and only if it is genuinely
      // later. Catching it here keeps a bad range out of the database and turns
      // it into something the assistant can say back in words.
      if (patch.end_date) {
        if (patch.category && !SPANNING_CATEGORIES.includes(patch.category))
          return {
            error: `A check-out date only belongs on a lodging or cruise item, not a ${patch.category} one.`,
          };
        if (name === "add_itinerary_item" && !patch.item_date)
          return {
            error: "I need a check-in date before I can set a check-out date.",
          };
        if (patch.item_date && patch.end_date <= patch.item_date)
          return {
            error: `A stay covers at least one night, so the check-out date has to be ${addDays(patch.item_date, 1)} or later.`,
          };
      }
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
            }${on}${statusNote(patch.status)}`,
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

    case "start_packing_list": {
      const patch = tripRef(tripId, newTripName);
      if (!patch.trip_id && !newTripName) {
        return {
          error: "Say which trip the packing list is for.",
        };
      }
      return {
        action: {
          tool: name,
          table,
          patch,
          ...pendingOn,
          summary: `Fill in the packing list${on || " for this trip"}, worked out from your base list`,
        },
      };
    }

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

    // Not a wipe: it only touches rows belonging to people who are not on the
    // trip, and never one that has been packed or written on. Which rows those
    // are is worked out at the moment it runs, against the roster as it stands,
    // so there is no count to promise here.
    case "tidy_packing_list": {
      const patch = tripRef(tripId, newTripName);
      const where = newTripName ? ` on ${newTripName}` : on;
      return {
        action: {
          tool: name,
          table,
          patch,
          ...pendingOn,
          destructive: true,
          summary: `Take the packing items${where} that belong to people who are not on the trip off the list. Anything already packed or with a note stays.`,
        },
      };
    }

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
        due_date: cleanDueDate(args.due_date),
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

    // The packing templates, not any trip's list. Everything here is deliberately
    // Asked for three times before this existed, and each time Aly did something
    // else instead: tried to add items to a list that was not there, or filed the
    // request away as a preference. There is no way to fake it with the item
    // tools, so it gets a tool of its own.
    case "create_template": {
      const wanted = cleanText(args.name, 140);
      if (!wanted) return { error: "A packing template needs a name." };
      const templates = known.packing_templates || new Map();
      for (const [, t] of templates.entries()) {
        if (String(t?.name || "").toLowerCase() === wanted.toLowerCase()) {
          return {
            error: `There is already a packing template called “${clip(wanted, 60)}”, so I did not start another. I can add to that one instead.`,
          };
        }
      }

      const patch = prune({
        name: wanted,
        description: cleanText(args.description, 400),
      });

      // Where the contents come from. A list may also start empty.
      //
      // Both spellings are accepted on purpose. The apply route revalidates by
      // feeding this patch straight back in as args, so a source named only as
      // copy_from_list would resolve on the first pass and then quietly
      // disappear on the second, creating the list empty. Whatever this returns
      // has to survive being read back as input.
      const fromList = cleanText(args.copy_from_list, 140);
      const fromTrip = cleanText(args.copy_from_trip, 140);
      const listId = cleanText(args.copy_from_template_id, 80);
      const tripId = cleanText(args.copy_from_trip_id, 80);
      let source = "";

      if (listId || tripId) {
        // Already resolved, so confirm it still exists rather than trusting it.
        if (listId) {
          if (!templates.has(listId)) {
            return {
              error:
                "That packing template is no longer there to copy from, so I did not start a new one.",
            };
          }
          patch.copy_from_template_id = listId;
          source = ` from ${templates.get(listId)?.name || "another packing template"}`;
        } else {
          if (!known.trips?.has(tripId)) {
            return {
              error:
                "That trip is no longer there to copy its packing list, so I did not start a new packing template.",
            };
          }
          patch.copy_from_trip_id = tripId;
          source = ` from the ${known.trips.get(tripId)} packing list`;
        }
      } else if (fromList) {
        const sourceId = resolveNamedTemplate(fromList, known);
        if (!sourceId) {
          return {
            error: `I could not find a packing template called “${clip(fromList, 60)}” to copy from, so I did not start a new one.`,
          };
        }
        patch.copy_from_template_id = sourceId;
        source = ` from ${templates.get(sourceId)?.name || "another packing template"}`;
      } else if (fromTrip) {
        // "this trip" is how people ask for it while looking at one.
        const here =
          /^(this|these|current|the current|this one)( trip)?$/i.test(fromTrip);
        const resolved = here
          ? focusTripId || undefined
          : resolveTrip({ trip: fromTrip }, known, focusTripId, pendingTrips);
        if (resolved && typeof resolved === "object") {
          return {
            error: `“${clip(resolved.pending, 60)}” is not saved yet and has no packing list to copy, so I did not start a new packing template from it.`,
          };
        }
        if (!resolved) {
          return {
            error: here
              ? "No trip is open, so tell me which trip's packing list to build it from."
              : `I could not find a trip called “${clip(fromTrip, 60)}” to copy its packing list, so I did not start a new packing template.`,
          };
        }
        patch.copy_from_trip_id = resolved;
        source = ` from the ${known.trips?.get(resolved) || "trip"} packing list`;
      }

      // Narrowing a copy to part of a list, which is how one kind of trip gets
      // split out of a list that had grown to cover two.
      const cats = (
        Array.isArray(args.copy_categories)
          ? args.copy_categories
          : String(args.only_categories || "").split(",")
      )
        .map((c) => cleanText(c, 60))
        .filter(Boolean)
        .slice(0, 8);
      let only = "";
      if (cats.length) {
        if (!source) {
          return {
            error:
              "Tell me which trip or which list to copy from and I will take just those categories.",
          };
        }
        patch.copy_categories = cats;
        only = ` (${cats.join(", ")} only)`;
      }

      return {
        action: {
          tool: name,
          table,
          patch,
          summary: source
            ? `Start a packing template “${clip(wanted, 60)}”${source}${only}`
            : `Start an empty packing template “${clip(wanted, 60)}”`,
        },
      };
    }

    // kept apart from add_packing_item: putting an item on the wrong one of the
    // two goes unnoticed until the next trip is built without it.
    case "add_template_item":
    case "update_template_item": {
      const patch = prune({
        item: cleanText(args.item, 200),
        assignee: matchAssignee(args.assignee, travelerNames),
        quantity: cleanText(args.quantity, 40),
        category: cleanText(args.category, 60),
      });
      const listName = (tid) =>
        known.packing_templates?.get(tid)?.name || "the packing template";

      if (name === "add_template_item") {
        if (!patch.item) return { error: "A packing item needs a name." };
        const templateId = resolveTemplate(args, known);
        if (templateId === null) {
          const have = Array.from(known.packing_templates?.values() || [])
            .map((t) => t?.name)
            .filter(Boolean);
          return {
            error: `There is no packing template called “${clip(
              cleanText(args.list, 140) || cleanText(args.template, 140) || "",
              60,
            )}”.${
              have.length
                ? ` The lists are ${have.map((n) => `“${clip(n, 40)}”`).join(", ")}.`
                : ""
            } Start it with create_template first, or name one of those.`,
          };
        }
        if (templateId === undefined) {
          return {
            error:
              "There are no packing templates yet. Start one with create_template and I will put that on it.",
          };
        }
        // An unassigned item belongs to the whole family.
        if (!patch.assignee) patch.assignee = "Shared";
        patch.template_id = templateId;
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Always pack ${patch.quantity ? `${patch.quantity} ` : ""}${
              patch.item
            } for ${patch.assignee} — ${listName(templateId)}`,
          },
        };
      }

      if (args.assignee === undefined) delete patch.assignee;
      if (Object.keys(patch).length === 0)
        return { error: "No valid changes were given for that packing item." };
      const row = known.packing_template_items?.get(id);
      return {
        action: {
          tool: name,
          table,
          id,
          patch,
          summary: `Change ${
            row?.item ? `“${clip(row.item, 60)}”` : "an item"
          } on ${listName(row?.template_id)}`,
        },
      };
    }

    case "delete_template_item": {
      const row = known.packing_template_items?.get(id);
      return {
        action: {
          tool: name,
          table,
          id,
          destructive: true,
          summary: `Stop always packing ${
            row?.item ? `“${clip(row.item, 60)}”` : "that item"
          }${
            row?.template_id
              ? ` — ${known.packing_templates?.get(row.template_id)?.name || "packing template"}`
              : ""
          }`,
        },
      };
    }

    // Everything on a person that is not their documents. One card, however many
    // of the three groups were mentioned, because "Steph is on AT&T with an
    // iPhone and she speaks Spanish" is one thing the user said.
    case "set_person_details": {
      const travelerId = prefTraveler(args, travelerNames, travelerIds);
      let who = null;
      for (const [n, tid] of travelerIds.entries())
        if (tid === travelerId) who = n;
      if (!travelerId || !who || who.toLowerCase() === "shared") {
        return {
          error: `Tell me which person that is about. The people on this family are ${travelerNames
            .filter((n) => n.toLowerCase() !== "shared")
            .join(", ")}.`,
        };
      }

      const patch = { traveler_id: travelerId };
      const said = [];
      // An empty string is a deliberate erasure and null is "not mentioned", so
      // the two cannot be collapsed: undefined means leave the column alone.
      const text = (key, max, label) => {
        if (args[key] === undefined) return;
        const value = cleanText(args[key], max);
        patch[key] = value || null;
        said.push(value ? `${label} ${value}` : `no ${label.toLowerCase()}`);
      };
      // A date, not a number: an age is only true for a year, and the whole point
      // is working out what it will be on a day that is not today.
      if (args.date_of_birth !== undefined) {
        const raw = cleanText(args.date_of_birth, 10);
        if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          return {
            error:
              "I need a birthday as a date, like 2014-02-02. An age on its own goes out of date, so ask them for the day.",
          };
        }
        patch.date_of_birth = raw || null;
        said.push(raw ? `born ${raw}` : "with no birthday recorded");
      }
      text("phone_carrier", 60, "on");
      text("phone_device", 60, "carrying a");
      text("accessibility_notes", 300, "noted:");

      if (args.mobility_aids !== undefined) {
        const aids = cleanAids(args.mobility_aids);
        patch.mobility_aids = aids;
        said.push(
          aids.length
            ? `travelling with ${aids.map(aidPhrase).join(", ")}`
            : "travelling with no special equipment",
        );
      }
      if (args.languages !== undefined) {
        const langs = parseLanguages(args.languages);
        patch.languages = langs;
        said.push(
          langs.length
            ? `speaking ${langs.join(", ")}`
            : "with no languages recorded",
        );
      }

      // Nothing but a name is not a change. Said plainly, because the alternative
      // is a card that saves nothing and looks like it worked.
      if (said.length === 0) {
        return {
          error: `Tell me what to record about ${who} — their phone provider or device, what they travel with, or the languages they speak.`,
        };
      }

      return {
        action: {
          tool: name,
          table,
          patch,
          summary: `${who}: ${said.join("; ")}`.slice(0, 200),
        },
      };
    }

    case "set_person_email":
    case "invite_person": {
      const travelerId = prefTraveler(args, travelerNames, travelerIds);
      let who = null;
      for (const [n, tid] of travelerIds.entries())
        if (tid === travelerId) who = n;
      // "Shared" is a bucket for things the family owns together, not a person
      // with an inbox.
      if (!travelerId || !who || who.toLowerCase() === "shared") {
        return {
          error: `Tell me which person that is for. The people on this family are ${travelerNames
            .filter((n) => n.toLowerCase() !== "shared")
            .join(", ")}.`,
        };
      }

      if (name === "invite_person") {
        return {
          action: {
            tool: name,
            table,
            patch: { traveler_id: travelerId },
            summary: `Email ${who} the sign-in invitation to the planner`,
          },
        };
      }

      const email = cleanEmail(args.email);
      if (!email) {
        return {
          error: "That did not look like an email address, so I left it alone.",
        };
      }
      return {
        action: {
          tool: name,
          table,
          patch: { traveler_id: travelerId, email },
          summary: `Let ${who} sign in as ${email} and edit the trips`,
        },
      };
    }

    case "record_lesson": {
      const subject = cleanText(args.subject, 120);
      const body = cleanText(args.body, 1000);
      if (!subject || !body)
        return {
          error: "A lesson needs a heading and something to say.",
        };
      const asked = String(cleanText(args.kind, 20) || "").toLowerCase();
      const kind = LESSON_KINDS.includes(asked) ? asked : "other";
      // A lesson may belong to one trip or to the family everywhere. A trip that
      // does not resolve is left off rather than guessed at: a note filed against
      // the wrong trip is worse than one filed against none.
      const resolved =
        args.trip || args.trip_id
          ? resolveTrip(args, known, null, pendingTrips)
          : undefined;
      const tripId =
        typeof resolved === "string" && UUID_RE.test(resolved)
          ? resolved
          : undefined;
      const patch = prune({
        subject,
        body,
        kind,
        trip_id: tripId,
        // told_by_family on the first pass; the stored value on revalidation,
        // because the apply route hands the patch back as the arguments.
        learned_from:
          args.told_by_family === true || args.learned_from === "family"
            ? "family"
            : "aly",
      });
      return {
        action: {
          tool: name,
          table,
          patch,
          summary: `Remember for later${
            tripId ? ` on ${known.trips?.get(tripId) || "that trip"}` : ""
          } — ${subject}: “${clip(body, 90)}”`,
        },
      };
    }

    case "retire_lesson": {
      const heading = known.lessons?.get(id);
      if (!id || !heading)
        return {
          error: "I could not find that note of mine, so I left it alone.",
        };
      return {
        action: {
          tool: name,
          table,
          id,
          patch: { status: "retired" },
          summary: `Stop using my note “${clip(heading, 60)}”${
            cleanText(args.why, 120) ? ` — ${cleanText(args.why, 120)}` : ""
          }`,
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

    case "add_pet":
    case "update_pet": {
      const patch = prune({
        name: cleanText(args.name, 60),
        species: cleanEnum(args.species, SPECIES_KEYS),
        breed: cleanText(args.breed, 80),
        date_of_birth: cleanDate(args.date_of_birth),
        weight_lb: cleanDecimal(args.weight_lb, 400),
        travel_style: cleanEnum(args.travel_style, TRAVEL_STYLE_KEYS),
        carrier_size: cleanText(args.carrier_size, 80),
        is_service_animal:
          typeof args.is_service_animal === "boolean"
            ? args.is_service_animal
            : undefined,
        microchip_number: cleanText(args.microchip_number, 40),
        rabies_expiration: cleanDate(args.rabies_expiration),
        health_certificate_expiration: cleanDate(
          args.health_certificate_expiration,
        ),
        vet_name: cleanText(args.vet_name, 120),
        vet_phone: cleanText(args.vet_phone, 40),
        medications: cleanText(args.medications, 400),
        dietary_notes: cleanText(args.dietary_notes, 400),
        temperament_notes: cleanText(args.temperament_notes, 400),
        notes: cleanText(args.notes, 1000),
      });

      if (name === "add_pet") {
        if (!patch.name) return { error: "A pet needs a name." };
        // Recorded as a dog only when nothing better was said, because the
        // column is not-null; the species is easy to correct and the record is
        // useless without a row.
        if (!patch.species) patch.species = "dog";
        const bits = [speciesLabelFor(patch.species).toLowerCase()];
        if (patch.weight_lb !== undefined) bits.push(`${patch.weight_lb} lb`);
        if (patch.is_service_animal) bits.push("service animal");
        return {
          action: {
            tool: name,
            table,
            patch,
            summary: `Add ${patch.name} (${bits.join(", ")}) to the family's pets`,
          },
        };
      }

      if (Object.keys(patch).length === 0)
        return { error: "No valid changes were given for that pet." };
      const petName = (known.pets || new Map()).get(id) || "that pet";
      const bits = [];
      if (patch.name) bits.push(`name → ${clip(patch.name, 40)}`);
      if (patch.weight_lb !== undefined)
        bits.push(`weight → ${patch.weight_lb} lb`);
      if (patch.rabies_expiration)
        bits.push(`rabies → ${patch.rabies_expiration}`);
      if (patch.health_certificate_expiration)
        bits.push(
          `health certificate → ${patch.health_certificate_expiration}`,
        );
      if (patch.travel_style)
        bits.push(`travels → ${patch.travel_style.replace(/_/g, " ")}`);
      if (patch.is_service_animal !== undefined)
        bits.push(
          patch.is_service_animal
            ? "marked a service animal"
            : "no longer marked a service animal",
        );
      if (patch.medications) bits.push("medication");
      if (patch.temperament_notes) bits.push("temperament");
      if (patch.notes) bits.push("notes");
      return {
        action: {
          tool: name,
          table,
          id,
          patch,
          summary: `Update ${petName}${bits.length ? `: ${bits.join(", ")}` : ""}`,
        },
      };
    }

    case "delete_pet": {
      const petName = (known.pets || new Map()).get(id) || "that pet";
      return {
        action: {
          tool: name,
          table,
          id,
          patch: {},
          destructive: true,
          summary: `Remove ${petName} from the family's pets`,
        },
      };
    }

    case "set_pet_trip": {
      const pets = known.pets || new Map();
      const wanted = cleanText(args.pet, 60);
      if (!wanted) return { error: "Tell me which pet and I will sort that." };
      let petId;
      if (UUID_RE.test(wanted)) {
        if (pets.has(wanted)) petId = wanted;
      } else {
        const lower = wanted.toLowerCase();
        for (const [pid, pname] of pets.entries()) {
          if (String(pname).toLowerCase() === lower) petId = pid;
        }
      }
      if (!petId)
        return {
          error: `I have no pet called ${clip(wanted, 30)} on file, so I did not change anything.`,
        };
      const petName = pets.get(petId);

      // "none" takes the pet off the trip, which is a different write from
      // recording an arrangement, so it is checked before the enum.
      const raw = cleanText(args.arrangement, 20)?.toLowerCase();
      const off = raw === "none" || raw === "off" || raw === "remove";
      const arrangement = off
        ? null
        : cleanEnum(args.arrangement, ARRANGEMENT_KEYS);
      if (!off && !arrangement)
        return {
          error: `I could not tell what you meant to happen to ${petName} for that trip.`,
        };

      const resolved = resolveTrip(args, known, focusTripId, pendingTrips);
      if (resolved === null)
        return {
          error: `I could not tell which trip you meant for ${petName}.`,
        };
      if (resolved === undefined)
        return {
          error: `Tell me which trip that is and I will say what happens to ${petName} — no trip is open right now.`,
        };
      // A pet cannot be filed against a trip that does not exist yet: the row
      // needs a real trip_id, and create_trip has not run.
      if (typeof resolved === "object")
        return {
          error: `Let me create that trip first, then I can say what happens to ${petName} on it.`,
        };

      const tripName = (known.trips || new Map()).get(resolved) || "that trip";
      return {
        action: {
          tool: name,
          table,
          patch: prune({
            trip_id: resolved,
            pet_id: petId,
            arrangement,
            arrangement_notes: cleanText(args.arrangement_notes, 400),
          }),
          destructive: off,
          summary: off
            ? `Take ${petName} off ${tripName}`
            : `${petName} on ${tripName}: ${arrangementLabelFor(arrangement).toLowerCase()}`,
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
            summary: `Add ${patch.brand} to the Wallet${balanceBit}${earnBit}${creditBit}`,
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
          summary: `Remove ${label("that travel program")} from the Wallet`,
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
    .map(([k, v]) =>
      v === null
        ? `${FIELD_LABELS[k] || k} removed`
        : `${FIELD_LABELS[k] || k} → ${v}`,
    )
    .join(", ");
}
