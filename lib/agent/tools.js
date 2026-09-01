// Tool definitions for the trip assistant, plus the server-side validation and
// write handlers. Everything the model can do to the trip lives here.

import {
  ARRANGEMENTS,
  PET_SEX_KEYS,
  SPECIES,
  TRAVEL_STYLES,
  isComing,
  petSexPhrase,
} from "@/lib/pets/pets";

const ARRANGEMENT_KEYS = ARRANGEMENTS.map((x) => x.id);
import {
  addDays,
  formatFullDay,
  formatRange,
  formatTime,
  SPANNING_CATEGORIES,
} from "../format";
import { LESSON_KINDS } from "./lessons";
import { oneOrShared } from "../people";
import { looksLastMinute } from "../packing/lastMinute";
import { topicPatch } from "../preferences/topics";
import {
  MOBILITY_AID_VALUES,
  aidPhrase,
  cleanAids,
  genderPhrase,
  normalizeGender,
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
// Both halves of the answer, because a card that mentions only the dog hides
// the fact that the cats were settled as well.
function petClause(rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  const coming = rows.filter((r) => isComing(r.arrangement)).map((r) => r.name);
  const behind = rows.filter((r) => !isComing(r.arrangement));
  const bits = [];
  if (coming.length) bits.push(`${listPeople(coming)} coming`);
  if (behind.length) {
    // Grouped by what is actually happening, so "Mabel boarding, Otis with a
    // sitter" does not flatten into "Mabel and Otis staying behind".
    const byKind = new Map();
    for (const r of behind) {
      if (!byKind.has(r.arrangement)) byKind.set(r.arrangement, []);
      byKind.get(r.arrangement).push(r.name);
    }
    for (const [kind, names] of byKind.entries()) {
      bits.push(`${listPeople(names)} ${arrangementClause(kind)}`);
    }
  }
  return bits.length ? `, with ${bits.join(", ")}` : "";
}

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
        last_minute: {
          type: "boolean",
          description:
            "True when the item cannot be packed ahead — medications somebody is still taking, toiletries, a retainer, a charger that stays in the wall. The app pulls these into their own block on the packing screen once the trip is close. Leave it out unless the user says or clearly implies it.",
        },
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
        last_minute: {
          type: "boolean",
          description:
            "True when the item cannot be packed ahead. Set it false to move something back onto the ordinary list.",
        },
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
      "Show a shortlist of real places as cards the family can look at: restaurants, hotels, or things to do. Call this whenever you recommend somewhere, INSTEAD OF listing the places in your reply - the card carries a photo, the address, a link to the place, a link to the map, and a button to put it on the itinerary. Then keep your reply to a sentence or two saying how you chose. This saves nothing and changes nothing; the family taps a card to add it. Only real places you are confident exist. A place to stay must carry nightly and nightly_basis -- an average for the family's own dates, because a hotel with no price is not a recommendation they can turn down -- and must name one of their own rewards programs or cards in program when it gets them something there.",
    parameters: {
      type: "object",
      properties: {
        places: {
          type: "array",
          description:
            "Between two and six places, best first. Include the ones the place is simply known for as well as the ones that suit this family -- a shortlist for a city with none of its landmarks on it is wrong however well it fits the preferences.",
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
              group: {
                type: "string",
                enum: ["popular", "for_you"],
                description:
                  "Which of the two lists it goes on. popular for what the place is simply known for -- what anybody visiting would consider. for_you when the reason is something about this family: a saved preference, a review of theirs, the ages on the roster, the pattern of what they have done before. Set it on every place when the shortlist has some of each, and leave it off entirely when they are all the same kind, because two headings with one list under them is worse than none.",
              },
              price: {
                type: "string",
                description:
                  "A rough price band in the local currency, or a $ to $$$$ band. Leave out if unsure. For a hotel use nightly instead: every hotel worth suggesting is $$$$, so the band separates nothing.",
              },
              nightly: {
                type: "string",
                description:
                  'REQUIRED for kind=stay. The average rate for one night on THIS FAMILY\'S OWN DATES, in the local currency with its symbol: a single figure or a tight range, such as "EUR 640" or "$480-560". Not the cheapest night of the year and not the rack rate. Leave it out only if you truly have no idea what the place costs, which should be rare.',
              },
              nightly_basis: {
                type: "string",
                description:
                  'What that average is over, in a few words a person would say: "early June", "Thanksgiving week", "high season". It must describe the family\'s own dates, so read them off the trip before answering.',
              },
              program: {
                type: "string",
                description:
                  "For kind=stay: the exact brand of one of the family's OWN rewards programs or credit cards that gets them something here, copied as it is written in their rewards list. Their hotel programs and their cards' hotel booking channels both count. Leave it out when none of them applies. NEVER name a program they are not enrolled in -- the app checks this against their rows and throws away a perk it cannot find, so an invented one costs you the whole line.",
              },
              perk: {
                type: "string",
                description:
                  'What that program actually gets them at this place, in a few words: "Gold Elite: room upgrade when available and 2pm checkout", "Book through Fine Hotels + Resorts for breakfast and a $100 credit". Only alongside program.',
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
    name: "offer_followups",
    description:
      'Offer two to four short questions the family might want to ask next, shown as buttons under your answer. Use it whenever an answer leaves an obvious next question -- narrowing a shortlist, the day either side, what a choice would cost, what still has to be booked. Write each one in the family\'s voice, as they would ask it ("Which of those is walkable from the hotel?"), under about twelve words, and only where you could actually answer it. Questions only: never an instruction to add, book or change anything, because pressing one sends it straight to you. This saves nothing.',
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "Two to four questions, most useful first.",
          items: { type: "string" },
        },
      },
      required: ["questions"],
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
        topics: {
          type: "array",
          items: { type: "string" },
          description:
            "One to three short grouping labels, so it files with similar preferences. A preference about a hotel spa belongs under both 'Where we stay' and 'Things we do', so give both. Reuse the topics already listed in the context wherever one fits, and invent a new one only when nothing there does.",
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
        topics: {
          type: "array",
          items: { type: "string" },
          description:
            "The complete new list of topics for this preference, not the ones to add — whatever is given here replaces what it has now. Pass an empty array to leave it with no topic at all.",
        },
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
        sex: {
          type: "string",
          enum: PET_SEX_KEYS,
          description:
            "female, male, or unknown when the paperwork does not say. Kennels, vets and airlines all ask for it. Only when the user has said which, or has referred to the animal as he or she.",
        },
        is_sterilized: {
          type: "boolean",
          description:
            "Whether the animal is spayed or neutered. Boarding kennels ask on every form and some require it, so record it the moment the user mentions it. Never infer it from the animal's age.",
        },
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
            "YYYY-MM-DD the rabies certificate runs to. Never guess this date. Dogs, cats and ferrets have one; birds, fish, reptiles and rabbits do not.",
        },
        health_certificate_expiration: {
          type: "string",
          description: "YYYY-MM-DD, if they already hold one.",
        },
        coggins_expiration: {
          type: "string",
          description:
            "YYYY-MM-DD a horse's negative Coggins test runs to, usually twelve months from the draw. Horses only, and it is the paper checked at a state line or a show gate. Never guess this date.",
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
        sex: { type: "string", enum: PET_SEX_KEYS },
        is_sterilized: { type: "boolean" },
        date_of_birth: { type: "string" },
        weight_lb: { type: "number" },
        travel_style: { type: "string" },
        carrier_size: { type: "string" },
        is_service_animal: { type: "boolean" },
        microchip_number: { type: "string" },
        rabies_expiration: { type: "string" },
        health_certificate_expiration: { type: "string" },
        coggins_expiration: {
          type: "string",
          description:
            "YYYY-MM-DD, a horse's negative Coggins test. Horses only.",
        },
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
      'Start a new PACKING TEMPLATE — one of the lists every future trip is built from. Use this when the user wants a list for a kind of trip they take more than once ("a Disney list", "a horse show list", "a cruise list"), and especially when they ask for one BASED ON a list they already have. Copy the contents from a trip\'s packing list with copy_from_trip, or from another packing template with copy_from_list, and narrow it to particular categories with only_categories. This is the only way to make a new list. To start a list AND put things on it in one go — "a cruise list with door magnets and magnetic hooks" — call this once and then call add_template_item once per item, naming this list; they are approved together and the list is saved first. Creating a list changes nothing on any trip, and copying from somewhere leaves the source untouched.',
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
    name: "rename_template",
    description:
      'Change what a PACKING TEMPLATE is called — one of the standing lists every future trip is built from. Use this when a list\'s name has stopped describing it ("Cruise Add-ons should be called Ship Cabin", "rename the Disney list to Disney Parks"). Name the list as it is called NOW in `list`, and what it should be called in `name`. This renames the list and nothing else: no item on it changes, no trip loses it, and nothing is copied or started. It is not a way to make a new list, and it is not a way to move items between lists.',
    parameters: {
      type: "object",
      properties: {
        list: {
          type: "string",
          description:
            "The list to rename, by its exact current name from the context, e.g. 'Cruise Add-ons'.",
        },
        name: {
          type: "string",
          description: "What it should be called instead, e.g. 'Ship Cabin'.",
        },
      },
      required: ["list", "name"],
    },
  },
  {
    name: "add_template_item",
    description:
      "Add one item to a PACKING TEMPLATE — the lists every future trip is built from, not any one trip's list. Use this when the user is talking about what the family always takes, or is on the Packing templates screen. Call once per distinct item. The list may be one create_template is starting in this same reply: name it in `list` and it will be saved before the items go on it. This changes nothing on trips that already exist.",
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
        last_minute: {
          type: "boolean",
          description:
            "True when the item cannot be packed ahead — medications somebody is still taking, toiletries, a retainer, a charger that stays in the wall. The app pulls these into their own block on the packing screen once the trip is close. Leave it out unless the user says or clearly implies it. On a template it carries onto every trip built from it.",
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
        last_minute: {
          type: "boolean",
          description:
            "True when the item cannot be packed ahead. Set it false to move it back onto the ordinary list.",
        },
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
    name: "propagate_templates",
    description:
      "Push the family's packing templates onto every trip that has not started yet: add template lines those trips are missing, correct the category, quantity and last-minute flag where the template disagrees, and remove lines that are no longer on any template. Use this when the user has changed a template and wants the change to reach trips they already have — a trip's list is otherwise a copy taken when the trip was built. It never touches a line somebody typed by hand, only lines that came off a template, and it never touches an animal's list. Takes no arguments; it works out the trips and the changes itself, and the user is shown exactly what it would do before it happens.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "set_trip_templates",
    description:
      'Say which add-on packing templates a trip is built from, by name, as a list. A trip can use several at once: an Alaska cruise is both an Alaska trip and a cruise, and a Disney cruise is both a Disney trip and a cruise. Call this when the user says what kind of trip it is, when they ask for a template to be applied to a trip ("add the cruise list to Alaska"), and whenever you create a trip whose kind you can tell from the destination or itinerary. Pass every add-on that applies, not just the one being added — the list replaces whatever was set before, so include the ones already there. Pass an empty list to say a trip uses no add-ons at all, which is a real answer and not the same as never having been asked. Never name the base template: every trip starts from that one. This decides what a rebuilt packing list is generated from and which template changes reach the trip; it does not itself add lines to the list.',
    parameters: {
      type: "object",
      properties: {
        templates: {
          type: "array",
          items: { type: "string" },
          description:
            "The add-on templates that apply, by name as they appear in the PACKING TEMPLATES context. Empty array for none.",
        },
        trip: {
          type: "string",
          description:
            "The trip, by name as it appears in the context. Leave out to use the trip on screen.",
        },
      },
      required: ["templates"],
    },
  },
  {
    name: "update_review",
    description:
      "Rate or write the family's review of somewhere they have already been — a hotel, an excursion, an activity or a restaurant that is on a trip's itinerary. Works as soon as that one item has happened, including partway through a trip they are still on: the dinner they ate last night can be reviewed today. Use the exact id of that itinerary item from the context. Give a star rating, review text, or both.",
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
        getting_there: {
          type: "string",
          description:
            "How they get there, in their own words: 'fly into Kona', 'drive, about nine hours', 'cruise out of Vancouver'. One of the six things a trip needs a rough answer to. Vague is fine and expected at this stage -- do NOT hold this back waiting for a flight number, and do not invent one.",
        },
        staying: {
          type: "string",
          description:
            "Where they sleep, roughly: 'a condo with a kitchen near a beach', 'one hotel the whole time'. Not a booking. Vague is fine.",
        },
        doing: {
          type: "string",
          description:
            "The one or two things they would be sorry to miss: 'swim with the manta rays, Volcanoes National Park'. This is what the itinerary gets built around. Vague is fine -- 'beach and one good dinner' is a real answer.",
        },
        getting_around: {
          type: "string",
          description:
            "How they get around once there: 'rent a car', 'trains and walking', 'resort shuttle, not leaving'. Vague is fine.",
        },
        date_note: {
          type: "string",
          description:
            "When, in THEIR words, whenever they have not given you settled dates: 'spring break next year', 'ten days sometime next summer'. Always set this instead of inventing a date range you were not given. You may ALSO set start_date and end_date as your best guess alongside it -- if you do, set dates_approximate true.",
        },
        dates_approximate: {
          type: "boolean",
          description:
            "True when start_date and end_date are your estimate rather than dates the family settled on. The app then shows the trip as approximate and never counts down to it as though a ticket had been bought. Set it false only when they have actually fixed the dates.",
        },
        travelers: {
          type: "array",
          items: { type: "string" },
          description:
            "Who is actually going, by name, when it is not the whole family. Leave it out when everyone is going. This sets who is on the trip, which the app shows on the trip and uses to keep the packing list to those people and whatever is shared, so nobody packs for someone who stayed home.",
        },
        pets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "The animal's name, as it is on file.",
              },
              arrangement: {
                type: "string",
                enum: ARRANGEMENT_KEYS,
                description:
                  "What is happening to this animal for this trip. 'coming' brings it along and adds its packing lines. The rest all mean it is not traveling, and differ only in where it is instead: 'boarding' at a kennel, 'sitter' at home, 'family' with relatives or friends, 'undecided' if they have not worked it out. Defaults to 'coming' if you leave it out.",
              },
              arrangement_notes: {
                type: "string",
                description:
                  "Anything they said about the arrangement — the kennel's name, the sitter's name, drop-off times.",
              },
            },
            required: ["name"],
          },
          description:
            "Only on create_trip. One entry per animal the family told you about, INCLUDING the ones staying behind — a household with a dog and two cats where only the dog travels should send all three, so the trip records the decision for each rather than leaving the cats blank. Leave the whole argument out only when they have not said anything about the animals.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "start_packing_list",
    description:
      "Offer to fill in a trip's packing list. Always suggest this for a trip you are creating, and suggest it as its OWN separate call so the family can take the packing list or leave it without that changing anything about the trip. The app works out what goes on the list itself once it is approved — from the family's base list, what they packed on past trips, and where and when this trip is — so do not list the items yourself and never add packing items one at a time for a trip you are creating. Only for a trip whose packing list is still empty, and NEVER for a draft: a draft's dates and destination are still moving, so nothing packs for one until it has been moved to Upcoming trips.",
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
    name: "draw_trip_cover",
    description:
      "Draw the illustration that sits behind a trip on the trip list and at the top of the trip's own screen. The app builds the picture itself from where and when the trip is — a flat, poster-style landscape of the place — so do NOT describe the picture yourself. Offer this for a trip that has no cover yet, and use it again when the family asks for a different one. When they say what they want changed about it ('more winter', 'show the ship'), pass that as `note` and nothing else.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Which trip, by its exact id from the TRIPS context.",
        },
        note: {
          type: "string",
          description:
            "The family's own words about what to change, when they are asking for another go. A short phrase, not a full description of the picture. Leave out entirely the first time.",
        },
      },
      required: ["id"],
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
        getting_there: {
          type: "string",
          description:
            "How they get there, in their own words: 'fly into Kona', 'drive, about nine hours', 'cruise out of Vancouver'. One of the six things a trip needs a rough answer to. Vague is fine and expected at this stage -- do NOT hold this back waiting for a flight number, and do not invent one.",
        },
        staying: {
          type: "string",
          description:
            "Where they sleep, roughly: 'a condo with a kitchen near a beach', 'one hotel the whole time'. Not a booking. Vague is fine.",
        },
        doing: {
          type: "string",
          description:
            "The one or two things they would be sorry to miss: 'swim with the manta rays, Volcanoes National Park'. This is what the itinerary gets built around. Vague is fine -- 'beach and one good dinner' is a real answer.",
        },
        getting_around: {
          type: "string",
          description:
            "How they get around once there: 'rent a car', 'trains and walking', 'resort shuttle, not leaving'. Vague is fine.",
        },
        date_note: {
          type: "string",
          description:
            "When, in THEIR words, whenever they have not given you settled dates: 'spring break next year', 'ten days sometime next summer'. Always set this instead of inventing a date range you were not given. You may ALSO set start_date and end_date as your best guess alongside it -- if you do, set dates_approximate true.",
        },
        dates_approximate: {
          type: "boolean",
          description:
            "True when start_date and end_date are your estimate rather than dates the family settled on. The app then shows the trip as approximate and never counts down to it as though a ticket had been bought. Set it false only when they have actually fixed the dates.",
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
        gender: {
          type: "string",
          description:
            "How this person describes themselves: 'female', 'male', 'nonbinary', or 'undisclosed' when they would rather not say. A term of their own is kept as they said it. Record it when somebody tells you \u2014 never infer it from a name, a pronoun somebody else used, or anything else. This is for advice only: a passport carries its own sex field printed by whoever issued it, so never use this to fill in paperwork or to say what a document shows. An empty string clears it.",
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
        about_me: {
          type: "string",
          description:
            "What this person is like on a trip, in their own words: what they enjoy, the pace they want, what they would rather avoid. 'I like sunsets, yoga and relaxing, mostly on a beach, and I am a big reader.' Record this whenever somebody describes themselves or another traveler that way, and keep their phrasing rather than tidying it into categories — it is read as taste, and the wording carries it. Add to what is there rather than replacing it when they are telling you something new about the same person: send the existing text plus the new sentence. An empty string clears it. This is not the place for a booking note like a dietary need or a seat preference.",
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
    // loop the "Check for pro tips" button drives.
    description:
      "Go and research this trip for pro tips: rules, timing, booking windows and local realities that this family would want to know about the exact places and dates on their itinerary. Call this when they ask what they should know, what to watch out for, whether anything needs booking, or ask you to look for tips — and also when you find yourself about to guess at that sort of thing, because this searches the web and your own recollection does not. It saves nothing they have to undo: what it finds appears as tips they can act on or clear. It takes up to a minute, so say you are looking and let it run. Do not call it twice in one reply.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["trip", "packing", "item", "wallet"],
          description:
            "trip to walk the whole trip, which also covers the packing list and the next few dated bookings — the right choice for a general question. packing for what they are taking and nothing else. item for one booking or activity, which needs the name below. wallet for their loyalty programs and credit cards: what to do about the ones they hold, and which welcome bonus on a card they do not hold is worth opening for. wallet needs no trip and works from any screen.",
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
  draw_trip_cover: "trips",
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
  rename_template: "packing_templates",
  add_template_item: "packing_template_items",
  update_template_item: "packing_template_items",
  delete_template_item: "packing_template_items",
  set_person_email: "travelers",
  set_person_details: "travelers",
  invite_person: "travelers",
  // It writes packing rows on many trips at once rather than one row anywhere,
  // which is why it takes no arguments -- but it is still a change, and a change
  // has to be in this table or the validator has never heard of it. It was
  // offered to her, grouped for approval, described on a card and handled by the
  // apply step, and rejected here with "Unknown action", so it had never once
  // worked.
  propagate_templates: "packing_items",
  // It writes the trip's own choice of add-on lists rather than any packing row.
  set_trip_templates: "trip_templates",
};

// Tools that write a family-level table and so need no trip in scope.
// Tools that change a row that already exists although their name does not begin
// with "update_". Reading the shape of a write off the front of its name is a
// small trick that holds for nearly all of them; this is where the exceptions are
// written down rather than guessed at twice.
// Tools that act on one existing row but whose names say what they do rather
// than starting with "update_" or "delete_". They still need an id, and it still
// has to be one the model was actually shown.
export const EDIT_TOOLS = new Set(["retire_lesson", "draw_trip_cover"]);

/**
 * The tools that are not changes, and so are deliberately absent from the table
 * above.
 *
 * Every one of these is taken out of the reply before anything treats a tool call
 * as something to save: a shortlist of places and a set of next questions are
 * things she says, a research pass is something that happens after she has
 * finished speaking, and recalling a lesson is a read. Naming them here is what
 * lets a test insist that every other tool she is offered is a tool the validator
 * knows, which is the check that would have caught propagate_templates.
 */
export const NOT_A_CHANGE = new Set([
  "show_places",
  "offer_followups",
  "find_tips",
  "recall_lessons",
]);

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
  // A trip's choice of add-on lists is a row that belongs to one trip, so it
  // gets the same trip resolution and the same polite refusal when the trip it
  // names is still only a proposal in the panel.
  "trip_templates",
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
function resolveTemplate(args, known, pendingTemplates) {
  const templates = known.packing_templates || new Map();
  // Lists this same batch is about to start. A reply that says "start a Cruise
  // list and put the door magnets on it" is one thought, and it used to fail
  // halfway: create_template was proposed, then every add_template_item beside
  // it was refused with "there is no packing template called Cruise -- start it
  // with create_template first", which is advice to do the thing that had just
  // been done. resolveTrip has taken pending trips for a while; this is the same
  // idea for the same reason.
  const coming = Array.isArray(pendingTemplates) ? pendingTemplates : [];
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
    // An exact name wins over a list that only exists as a proposal, but a
    // proposal beats a loose partial match: somebody starting a "Cruise" list
    // and filling it means that list, not the "Cruise Add-ons" one already saved.
    for (const name of coming) {
      if (name.toLowerCase() === lower) return { pending: name };
    }
    for (const [id, t] of templates.entries()) {
      const other = String(t?.name || "").toLowerCase();
      if (other && (other.includes(lower) || lower.includes(other))) return id;
    }
    for (const name of coming) {
      const other = name.toLowerCase();
      if (other.includes(lower) || lower.includes(other))
        return { pending: name };
    }
    return null;
  }

  // Nothing named. A list being started in the same breath is what was meant --
  // far more likely than the base list, which is what this used to fall back to,
  // quietly filing a cruise packing list onto the family's everyday one.
  if (coming.length === 1) return { pending: coming[0] };
  if (coming.length > 1) return null;

  for (const [id, t] of templates.entries()) if (t?.is_base) return id;
  // No list is marked as the base one, so only a single list is unambiguous.
  if (templates.size === 1) return templates.keys().next().value;
  return undefined;
}

/**
 * The names of packing templates a batch of model calls is about to create, so
 * the items meant for them can be filed against a list with no id yet.
 */
export function pendingTemplateNames(calls) {
  const out = [];
  for (const call of calls || []) {
    const tool = call?.name || call?.tool;
    if (tool !== "create_template") continue;
    const name = cleanText(call?.args?.name ?? call?.patch?.name, 140);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

// The source of a copy, which must be named outright. resolveTemplate falls back
// to the base list when nothing is named, and that fallback would be dangerous
// here: silently copying ninety items off the wrong list is worse than refusing.
function resolveNamedTemplate(named, known) {
  if (!named) return undefined;
  // No pending list passed on purpose: a list that does not exist yet has nothing
  // in it to copy, so naming one as a source is a mistake, not a dependency.
  const found = resolveTemplate({ list: named }, known);
  return found && typeof found === "object" ? null : found;
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
const ARRANGEMENT_CLAUSES = {
  coming: "coming",
  boarding: "boarding",
  sitter: "at home with a sitter",
  family: "staying with family",
  undecided: "still to be sorted out",
};

function arrangementClause(kind) {
  return ARRANGEMENT_CLAUSES[kind] || "staying behind";
}

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
    pendingTemplates = [],
    // True when the user started this from the trip builder screen.
    newTripDraft = false,
    // True when they started from the log-a-previous-trip screen, where the trip
    // is over before the conversation begins.
    loggedTrip = false,
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
    name === "start_packing_list" ||
    name === "set_trip_templates";
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
    case "draw_trip_cover": {
      // No patch of its own: what this changes on the row -- the URL, the alt
      // text, the status -- is written by the generator, not by the model. All
      // that has to survive to the apply step is which trip, and whatever the
      // family said they wanted different about it.
      if (!id) {
        return { error: "Say which trip the picture is for." };
      }
      const note = cleanText(args.note, 300);
      return {
        action: {
          tool: name,
          table,
          id,
          patch: note ? { note } : {},
          summary: note
            ? `Draw a new picture for ${label("this trip")} — ${note}`
            : `Draw a picture for ${label("this trip")}`,
        },
      };
    }

    case "create_trip":
    case "update_trip": {
      // An animal named in the conversation that the family has no record of.
      // Set aside rather than refused, and reported on the card.
      let petsMissing = null;
      const patch = prune({
        name: cleanText(args.name, 120),
        destination: cleanText(args.destination, 300),
        start_date: cleanDate(args.start_date),
        end_date: cleanDate(args.end_date),
        cover_emoji: cleanEmoji(args.cover_emoji),
        summary: cleanText(args.summary, 2000),
        status: cleanEnum(args.status, TRIP_STATUSES),
        // The four baseline components that had nowhere to live before. Text,
        // and allowed to be vague: "probably fly into Kona" is the answer at
        // this stage and demanding a flight number turns a conversation into a
        // form.
        getting_there: cleanText(args.getting_there, 600),
        staying: cleanText(args.staying, 600),
        doing: cleanText(args.doing, 2000),
        getting_around: cleanText(args.getting_around, 600),
        // When, in the family's words, for a trip that has no settled dates.
        date_note: cleanText(args.date_note, 200),
        dates_approximate: cleanBool(args.dates_approximate),
      });

      // A guess on a booked trip is the one combination that puts an invented
      // date in front of somebody on the screen where they are least likely to
      // question it. The database refuses it too; this turns that refusal into a
      // sentence rather than a constraint violation.
      if (patch.dates_approximate === true && patch.status === "booked") {
        return {
          error:
            "A booked trip cannot have approximate dates. Ask for the real dates, or leave it as planning.",
        };
      }
      // Approximate is a claim about start_date and end_date, so it means
      // nothing without them -- and left on a trip whose dates were since
      // settled, it would keep calling them a guess.
      if (
        patch.dates_approximate === true &&
        !patch.start_date &&
        !patch.end_date
      ) {
        delete patch.dates_approximate;
      }

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
        // Anything started from the trip builder is an idea unless the family
        // said otherwise. This used to force "draft" whatever status was asked
        // for, which made the question Aly asks — draft, or a trip you mean to
        // take? — a question whose answer could not change anything. Someone who
        // says "it's a real trip" and gets a draft anyway has been ignored, so an
        // explicit status now wins and only the silence defaults to a draft.
        if (newTripDraft && !patch.status) patch.status = "draft";
        // The log screen is the same bargain pointed the other way: a trip
        // written down after the fact is finished, and silence means finished
        // rather than draft. An explicit status still wins, because somebody may
        // be logging a trip they abandoned.
        if (loggedTrip && !patch.status) patch.status = "complete";
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
          const asked = Array.isArray(args.pets) ? args.pets : [args.pets];
          const rows = [];
          const seen = new Set();
          const missing = [];
          for (const entry of asked) {
            // A bare name is accepted as well as an object, because models reach
            // for the simpler shape and "the dog is coming" is the common case.
            const raw = typeof entry === "string" ? { name: entry } : entry;
            if (!raw || typeof raw !== "object") continue;
            const wanted = cleanText(raw.name, 60);
            if (!wanted) continue;

            const lower = wanted.toLowerCase();
            let found;
            for (const [pid, pname] of petsKnown.entries()) {
              if (String(pname).toLowerCase() === lower) found = pid;
            }
            // An animal nobody has on file is not a reason to lose the trip. The
            // trip is the thing being built; the dog is a passenger on it. This
            // used to return an error, which sank the whole card -- a family who
            // said "and Storm is coming" got "Nothing was saved" and no trip at
            // all. So the name is set aside, said out loud on the card, and the
            // rest of the trip goes through.
            if (!found) {
              if (!missing.includes(wanted)) missing.push(wanted);
              continue;
            }
            if (seen.has(found)) continue;

            // Silence means coming: an animal named at all in answer to "who is
            // coming" is being brought along unless they said otherwise. A word
            // that is not one of the five is a mistake worth stopping for rather
            // than quietly turning into "coming".
            const petName = petsKnown.get(found);
            let arrangement = "coming";
            if (raw.arrangement !== undefined && raw.arrangement !== null) {
              const clean = cleanEnum(raw.arrangement, ARRANGEMENT_KEYS);
              if (!clean) {
                return {
                  error: `I could not tell what "${clip(String(raw.arrangement), 30)}" means for ${petName}. It has to be one of ${ARRANGEMENT_KEYS.join(", ")}.`,
                };
              }
              arrangement = clean;
            }
            seen.add(found);
            rows.push({
              pet_id: found,
              name: petName,
              arrangement,
              arrangement_notes: cleanText(raw.arrangement_notes, 400) || null,
            });
          }
          if (rows.length) patch.pets = rows;
          // Written onto the action rather than the patch: it is a sentence for
          // whoever reads the card, not a column, and the apply step strips it.
          if (missing.length) {
            const names = Array.from(petsKnown.values());
            petsMissing = `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not on the family's animals yet, so ${missing.length === 1 ? "that one is" : "those are"} left off${names.length ? ` — the animals on file are ${names.join(", ")}` : ""}.`;
          }
        }
        // A proposal is read before it is approved, so it says its dates the way
        // every screen in the app says them rather than the way the column
        // stores them.
        // What the family said about when wins over a range worked out from it.
        // A card is read in a hurry and approved with one press, so a guessed
        // range must not be printed in the same words as a booked one -- that is
        // how an estimate becomes a departure date nobody chose.
        const range =
          patch.start_date && patch.end_date
            ? formatRange(patch.start_date, patch.end_date)
            : patch.start_date
              ? `from ${formatFullDay(patch.start_date) || patch.start_date}`
              : "";
        const approximate = patch.dates_approximate === true;
        const when = patch.date_note
          ? range
            ? ` (${patch.date_note} — roughly ${range})`
            : ` (${patch.date_note})`
          : range
            ? approximate
              ? ` (roughly ${range})`
              : ` (${range})`
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
            }${petClause(patch.pets)}`,
            caution: petsMissing,
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
          caution: petsMissing,
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
            summary: `Add "${patch.title}" to the itinerary on ${formatFullDay(patch.item_date) || patch.item_date}${
              patch.start_time
                ? ` at ${formatTime(patch.start_time) || patch.start_time}`
                : ""
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
        last_minute: cleanBool(args.last_minute),
      });
      if (name === "add_packing_item") {
        if (!patch.item) return { error: "A packing item needs a name." };
        // A tick means "this is in the bag", so it is not something to accept
        // while a list is being built for a trip nobody has left for yet. On a
        // logged trip it is the opposite: every line is a thing that was packed,
        // and an untouched list on a finished trip reads as work outstanding.
        if (!loggedTrip) delete patch.is_packed;
        else if (patch.is_packed === undefined) patch.is_packed = true;
        // An unassigned item belongs to the whole family.
        if (!patch.assignee) patch.assignee = "Shared";
        // Read off the name when Aly did not say either way, so "add Veda's
        // medication" lands on the right side of the distinction without the
        // model having to remember a flag exists.
        if (patch.last_minute === undefined && looksLastMinute(patch.item))
          patch.last_minute = true;
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
              patch.due_date
                ? ` due ${formatFullDay(patch.due_date) || patch.due_date}`
                : ""
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
        // A list this same batch is starting has nothing on it to copy. Said
        // plainly, the way the copy_from_trip branch below already does, because
        // "I could not find a packing template called Cruise" is a confusing
        // thing to read one line under a card that starts a Cruise list.
        const alsoNew = pendingTemplates.find(
          (n) => n.toLowerCase() === fromList.toLowerCase(),
        );
        if (alsoNew) {
          return {
            error: `“${clip(alsoNew, 60)}” is not saved yet and has nothing on it to copy, so I did not start a new packing template from it.`,
          };
        }
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

    // Renaming a standing list. Kept well away from create_template: a model
    // that reads "the Disney list should be called Disney Parks" as a reason to
    // start a second list leaves the family with two lists and half the items on
    // each, which is worse than doing nothing.
    case "rename_template": {
      const wanted = cleanText(args.name, 140);
      if (!wanted) return { error: "A packing template needs a name." };

      const found = resolveTemplate(args, known, pendingTemplates);
      // A list that only exists as a proposal in this same reply has no name to
      // change yet -- it has whatever create_template is about to call it.
      if (found && typeof found === "object") {
        return {
          error:
            "That list is not saved yet, so there is nothing to rename. Give create_template the name you want in the first place.",
        };
      }
      const templates = known.packing_templates || new Map();
      if (!found) {
        const have = Array.from(templates.values())
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
          } Tell me which one to rename.`,
        };
      }

      const before = String(templates.get(found)?.name || "").trim();
      if (before.toLowerCase() === wanted.toLowerCase() && before === wanted) {
        return {
          error: `That list is already called “${clip(wanted, 60)}”, so there is nothing to change.`,
        };
      }
      // Two lists with the same name is a trap rather than an error: every place
      // the app names a template -- the pills under a trip's add-item form, the
      // chips saying what a trip is built from, what I read back -- becomes a
      // guess. Refused before anything is written.
      for (const [tid, t] of templates.entries()) {
        if (tid === found) continue;
        if (String(t?.name || "").toLowerCase() === wanted.toLowerCase()) {
          return {
            // The other list's own spelling, not the spelling that was asked
            // for: "there is already a list called disney parks" reads like a
            // quibble about capitals rather than a list that already exists.
            error: `There is already a packing template called “${clip(String(t.name), 60)}”, so I did not rename this one. Two lists with the same name make every other screen ambiguous.`,
          };
        }
      }

      return {
        action: {
          tool: name,
          table,
          id: found,
          patch: { name: wanted },
          summary: `Rename the ${
            before ? `“${clip(before, 60)}”` : "packing"
          } packing template to “${clip(wanted, 60)}” — nothing on it changes and no trip loses it`,
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
        last_minute: cleanBool(args.last_minute),
      });
      const listName = (tid) =>
        known.packing_templates?.get(tid)?.name || "the packing template";

      if (name === "add_template_item") {
        if (!patch.item) return { error: "A packing item needs a name." };
        const found = resolveTemplate(args, known, pendingTemplates);
        // A list still waiting to be approved: the item names it instead, and the
        // apply step -- which writes every create_template first -- turns that
        // name into an id.
        const newListName =
          found && typeof found === "object" ? found.pending : null;
        const templateId = newListName ? undefined : found;
        if (found === null) {
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
        if (!newListName && templateId === undefined) {
          return {
            error:
              "There are no packing templates yet. Start one with create_template and I will put that on it.",
          };
        }
        // An unassigned item belongs to the whole family.
        if (!patch.assignee) patch.assignee = "Shared";
        if (patch.last_minute === undefined && looksLastMinute(patch.item))
          patch.last_minute = true;
        if (newListName) patch.list = newListName;
        else patch.template_id = templateId;
        return {
          action: {
            tool: name,
            table,
            patch,
            // Locks this to the same approval chunk as the list itself, and lets
            // the apply step say which list to approve rather than refusing blankly.
            ...(newListName ? { needsTemplate: newListName } : {}),
            summary: `Always pack ${patch.quantity ? `${patch.quantity} ` : ""}${
              patch.item
            } for ${patch.assignee} — ${newListName || listName(templateId)}`,
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

    // No arguments to read and no single row to name: the whole point is that it
    // works out the trips and the lines itself. The card says what it is and the
    // apply step reports what it did.
    case "propagate_templates":
      return {
        action: {
          tool: name,
          table: "packing_items",
          destructive: true,
          summary:
            "Push the packing templates onto every trip that has not started yet",
        },
      };

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
      // Their own word for themselves, normalized only as far as matching the
      // four the app offers. Anything else is stored as typed rather than being
      // rounded to the nearest category.
      if (args.gender !== undefined) {
        const given = cleanText(args.gender, 40);
        const value = given ? normalizeGender(given) : null;
        patch.gender = value;
        said.push(value ? genderPhrase(value) : "with no gender recorded");
      }
      text("phone_carrier", 60, "on");
      text("phone_device", 60, "carrying a");
      text("accessibility_notes", 300, "noted:");
      // Longer than the rest on purpose: this one is meant to be a paragraph, and
      // a cap that clips it mid-sentence would change what it says.
      text("about_me", 1200, "described as:");

      if (args.mobility_aids !== undefined) {
        const aids = cleanAids(args.mobility_aids);
        patch.mobility_aids = aids;
        said.push(
          aids.length
            ? `traveling with ${aids.map(aidPhrase).join(", ")}`
            : "traveling with no special equipment",
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
      // Both columns move together. `topics` is the truth; `topic` is mirrored
      // from the first entry because the packing generator, the tips brief and the
      // wallet still print it. An explicit empty list is a real instruction —
      // "take the topics off this one" — so it has to survive prune(), which is
      // why the two keys are only added when topics were actually given.
      const askedTopics = Array.isArray(args.topics)
        ? args.topics
        : args.topic !== undefined
          ? [args.topic]
          : null;
      const patch = prune({
        body: cleanText(args.body, 1000),
        traveler_id: prefTraveler(args, travelerNames, travelerIds),
      });
      if (askedTopics) {
        const written = topicPatch(askedTopics.map((t) => cleanText(t, 60)));
        patch.topics = written.topics;
        patch.topic = written.topic;
      }
      const topicsSaid = patch.topics?.length ? patch.topics.join(" and ") : "";
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
              topicsSaid ? ` under ${topicsSaid}` : ""
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
      if (patch.topics)
        bits.push(
          topicsSaid
            ? `${patch.topics.length === 1 ? "topic" : "topics"} → ${topicsSaid}`
            : "no topic",
        );
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
        sex: cleanEnum(args.sex, PET_SEX_KEYS),
        is_sterilized:
          typeof args.is_sterilized === "boolean"
            ? args.is_sterilized
            : undefined,
        date_of_birth: cleanDate(args.date_of_birth),
        // 2500 rather than 400: a draft horse outweighs the old cap six times
        // over, and a cap that silently drops the number is worse than no field.
        weight_lb: cleanDecimal(args.weight_lb, 2500),
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
        coggins_expiration: cleanDate(args.coggins_expiration),
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
        const sexBit = petSexPhrase(patch);
        if (sexBit) bits.push(sexBit);
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
      if (patch.sex) bits.push(`sex → ${patch.sex}`);
      if (patch.is_sterilized !== undefined)
        bits.push(
          patch.is_sterilized
            ? `recorded as ${patch.species === "horse" ? "gelded" : "spayed or neutered"}`
            : `recorded as not ${patch.species === "horse" ? "gelded" : "spayed or neutered"}`,
        );
      if (patch.weight_lb !== undefined)
        bits.push(`weight → ${patch.weight_lb} lb`);
      if (patch.rabies_expiration)
        bits.push(`rabies → ${patch.rabies_expiration}`);
      if (patch.health_certificate_expiration)
        bits.push(
          `health certificate → ${patch.health_certificate_expiration}`,
        );
      if (patch.coggins_expiration)
        bits.push(`Coggins → ${patch.coggins_expiration}`);
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
          error: `I have no pet called ${clip(wanted, 30)} on file, so I did not change anything. Add them to the family with add_pet first, then put them on the trip.`,
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

    case "set_trip_templates": {
      const templates = known.packing_templates || new Map();
      // template_ids first, the way resolveTrip takes trip_id first: the apply
      // route revalidates with the patch as args, so what was resolved on the
      // first pass arrives on the second as ids and nothing else. The same is
      // true of the trip, which is why the patch names it `trip` -- resolveTrip
      // reads that field, and by then the trip it named actually exists.
      const wanted = Array.isArray(args.template_ids)
        ? args.template_ids
        : Array.isArray(args.templates)
          ? args.templates
          : null;
      if (!wanted) {
        return {
          error:
            "Tell me which add-on lists that trip uses and I will set them — an empty list is fine if it uses none.",
        };
      }

      const chosen = [];
      const missing = [];
      for (const raw of wanted.slice(0, 20)) {
        const named = cleanText(raw, 140);
        if (!named) continue;
        const found = resolveTemplate({ list: named }, known, pendingTemplates);
        // A list being created in the same breath has no id yet, and a trip's
        // choice is a row that needs one. Saying so beats filing it against the
        // wrong list.
        if (found && typeof found === "object") {
          return {
            error: `Let me create the ${clip(found.pending, 40)} list first, then I can say that trip uses it.`,
          };
        }
        if (!found) {
          missing.push(named);
          continue;
        }
        const row = templates.get(found);
        // The base list is not a choice: every trip starts from it, so a row
        // saying so would always be there and never mean anything.
        if (row?.is_base) continue;
        if (!chosen.includes(found)) chosen.push(found);
      }

      if (missing.length) {
        return {
          error: `I have no packing template called ${missing
            .map((m) => clip(m, 40))
            .join(" or ")}, so I did not change which lists that trip uses.`,
        };
      }

      // The trip came out of the shared block above, which also decides whether
      // it is still only a proposal in the panel. Worth allowing on a trip being
      // created in the same breath, unlike a pet: knowing it is a cruise is
      // exactly what should shape the list the new trip is built from.
      const tripName = newTripName
        ? newTripName
        : (known.trips || new Map()).get(tripId) || "that trip";

      const names = chosen.map((id) => templates.get(id)?.name).filter(Boolean);
      return {
        action: {
          tool: name,
          table,
          ...pendingOn,
          patch: prune({
            trip_id: newTripName ? undefined : tripId,
            trip: newTripName || undefined,
            template_ids: chosen,
          }),
          // Setting the lists can take a trip off one it was on before, and a
          // removal is a removal even when the point of the call was to add.
          destructive: true,
          summary: names.length
            ? `Build ${tripName} from ${names.join(" and ")} as well as the base list`
            : `Build ${tripName} from the base list only, with no add-ons`,
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
          summary: `Review ${label("a place on the itinerary")}${on}: ${bits.join(
            ", ",
          )}`,
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
  date_note: "when",
  dates_approximate: "dates are approximate",
  getting_there: "getting there",
  staying: "where you stay",
  doing: "what you do there",
  getting_around: "getting around",
};

// Any column holding a day or a clock time, whatever it is called: the two
// tests are on the name so a column added later is written out properly without
// anybody remembering to come back here.
const DATE_FIELD = /(^|_)(date|on|expires|expiry)$/;
const TIME_FIELD = /(^|_)time$/;

function describePatch(patch) {
  return Object.entries(patch)
    .filter(([k]) => k !== "trip_id" && k !== "trip")
    .map(([k, v]) => {
      const label = FIELD_LABELS[k] || k;
      if (v === null) return `${label} removed`;
      // "dates are approximate → true" is not a sentence. A flag says what it
      // means or it says nothing.
      if (typeof v === "boolean") {
        if (k === "dates_approximate") {
          return v ? "dates marked approximate" : "dates marked settled";
        }
        return v ? label : `${label} off`;
      }
      // A date the family said in words comes back out in words. "date →
      // 2027-07-25 " is how the column stores it, not how anybody reads a
      // change before approving it -- and this is the line they approve from.
      if (typeof v === "string") {
        if (DATE_FIELD.test(k)) return `${label} → ${formatFullDay(v) || v}`;
        if (TIME_FIELD.test(k)) return `${label} → ${formatTime(v) || v}`;
      }
      return `${label} → ${v}`;
    })
    .join(", ");
}
