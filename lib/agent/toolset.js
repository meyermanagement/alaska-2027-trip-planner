// Which of Aly's tools to put in front of the model for this one request.
//
// Aly has 28 tools. Sending all of them costs 24,427 characters of JSON Schema
// on every single message — about 6,500 tokens before a word of the family's
// trip data is added — and Google's own function-calling guidance is to keep the
// active set to 10 to 20, because a model choosing between 28 near-neighbours
// picks wrong more often than one choosing between 15.
//
// So the set is assembled from three parts:
//
//   1. A core that is always present, because these are the things people ask
//      for from anywhere: the itinerary, the packing list, the checklist, notes,
//      trips, and noting a preference.
//   2. Whatever else belongs to the screen they are looking at.
//   3. Anything the words of the request plainly reach for, wherever they are.
//      This is what stops "add sunscreen to the standing list" failing just
//      because it was typed on the Notes tab.
//
// Part 3 is the important one. Trimming by screen alone would make Aly worse at
// exactly the cross-cutting requests that make her useful.

import {
  TOOL_DECLARATIONS,
  TRIP_TOOL_DECLARATIONS,
  SHARED_TOOL_DECLARATIONS,
} from "./tools";
import { NEW_TRIP_FOCUS, REWARDS_FOCUS, TEMPLATES_FOCUS } from "./context";

const ALL = [
  ...TOOL_DECLARATIONS,
  ...TRIP_TOOL_DECLARATIONS,
  ...SHARED_TOOL_DECLARATIONS,
];

const BY_NAME = new Map(ALL.map((t) => [t.name, t]));

/** Present on every screen, whatever the user is looking at. */
export const CORE_TOOLS = [
  "add_itinerary_item",
  "update_itinerary_item",
  "delete_itinerary_item",
  "add_packing_item",
  "update_packing_item",
  "delete_packing_item",
  "add_task",
  "update_task",
  "delete_task",
  "add_note",
  "create_trip",
  "update_trip",
  // Something learned about a traveler is worth keeping wherever it is said.
  "add_preference",
];

// What each screen adds to the core.
const BY_FOCUS = {
  itinerary: ["update_review"],
  packing: ["clear_packing_list", "start_packing_list"],
  tasks: [],
  notes: [],
  [TEMPLATES_FOCUS]: [
    "create_template",
    "add_template_item",
    "update_template_item",
    "delete_template_item",
    "start_packing_list",
  ],
  [REWARDS_FOCUS]: [
    "add_rewards_program",
    "update_rewards_program",
    "delete_rewards_program",
  ],
  [NEW_TRIP_FOCUS]: ["start_packing_list"],
};

// No focus means one of the screens that spans every trip: home, the trips list,
// Preferences & Reviews, or Who can sign in. Deleting a whole trip lives here and
// nowhere else, which also means a model on the itinerary screen cannot propose
// it however badly it misreads "cancel the tour".
const NO_FOCUS = [
  "delete_trip",
  "set_person_email",
  "invite_person",
  "update_review",
  "update_preference",
  "delete_preference",
];

// Words that reach for a part of the app the user is not currently looking at.
const RESCUES = [
  {
    test: /\b(standing list|standing lists|template|templates)\b/i,
    tools: [
      "create_template",
      "add_template_item",
      "update_template_item",
      "delete_template_item",
    ],
  },
  {
    test: /\b(rewards?|loyalty|miles|mileage|points|frequent flyer|aadvantage|skymiles|hyatt|marriott|hilton|membership number)\b/i,
    tools: [
      "add_rewards_program",
      "update_rewards_program",
      "delete_rewards_program",
    ],
  },
  {
    test: /\b(sign ?in|sign ?-?in|log ?in|invite|invitation|email address|her email|his email|their email)\b/i,
    tools: ["set_person_email", "invite_person"],
  },
  {
    test: /\b(review|reviews|rating|ratings|rate it|stars?|out of five)\b/i,
    tools: ["update_review"],
  },
  {
    test: /\b(prefers?|preference|preferences|dislikes?|allergic|allergy|hates?|favou?rite)\b/i,
    tools: ["update_preference", "delete_preference"],
  },
  {
    test: /\b(delete|remove|get rid of|cancel|scrap)\b[^.!?]{0,30}\btrip\b/i,
    tools: ["delete_trip"],
  },
  {
    test: /\btrip\b[^.!?]{0,30}\b(delete|deleted|remove|removed|gone)\b/i,
    tools: ["delete_trip"],
  },
  {
    test: /\b(empty|clear|wipe|start over|from scratch|replace)\b[^.!?]{0,40}\b(packing|list)\b/i,
    tools: ["clear_packing_list", "start_packing_list"],
  },
  {
    test: /\b(pack(ing)? list|start packing)\b/i,
    tools: ["start_packing_list"],
  },
];

/** Which tool names this request should see, in declaration order. */
export function toolNamesForRequest({ focus = null, message = "" } = {}) {
  const wanted = new Set(CORE_TOOLS);

  const extras = focus ? BY_FOCUS[focus] : NO_FOCUS;
  for (const name of extras || []) wanted.add(name);

  const said = typeof message === "string" ? message : "";
  if (said) {
    for (const rescue of RESCUES) {
      if (rescue.test.test(said)) {
        for (const name of rescue.tools) wanted.add(name);
      }
    }
  }

  // Declaration order, so the model always sees them in the same arrangement
  // whatever combination of screen and words produced the set.
  return ALL.filter((t) => wanted.has(t.name)).map((t) => t.name);
}

/** The declarations themselves, ready to hand to an adapter. */
export function toolsForRequest(opts) {
  return toolNamesForRequest(opts)
    .map((name) => BY_NAME.get(name))
    .filter(Boolean);
}

/** Every tool, for the places that genuinely need the lot. */
export function allToolNames() {
  return ALL.map((t) => t.name);
}
