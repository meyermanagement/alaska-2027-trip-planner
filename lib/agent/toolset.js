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
//      This is what stops "add sunscreen to the packing template" failing just
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
import { SECONDARY } from "@/lib/travelers/access";

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
  // Recommending somewhere is asked for from every screen, and the cards are an
  // answer rather than a change, so this belongs with the core.
  "show_places",
  // Every screen can end an answer with the next question, because every screen
  // leaves one.
  "offer_followups",
  // Something learned is learned wherever it is said, and a note that has gone
  // wrong should be retirable from the same place it was read.
  "record_lesson",
];

// What each screen adds to the core.
const BY_FOCUS = {
  // find_tips needs a trip in focus, so it belongs to the screens inside one and
  // to none of the screens above them.
  // The trip's own tab. Changing who is coming and what the trip is called are
  // asked here more than anywhere, and update_trip is already in the core set;
  // what this adds is the ability to go and look for advice about the trip from
  // the tab that summarizes it.
  // A trip's picture is looked at on the tab that summarizes the trip, and the
  // picture is what the tab is mostly made of now, so "can you make it more
  // wintry" is said here or nowhere.
  overview: ["find_tips", "set_trip_templates", "draw_trip_cover"],
  itinerary: ["update_review", "find_tips"],
  // Same powers as the itinerary. A review is the obvious one: the day view now
  // offers stars on anything that has happened, and Aly is asked the same thing
  // out loud on the walk home.
  today: ["update_review", "find_tips"],
  packing: [
    "clear_packing_list",
    "tidy_packing_list",
    "start_packing_list",
    // "add the cruise list to this trip" is asked while looking at the list it
    // would change.
    "set_trip_templates",
    "find_tips",
  ],
  tasks: ["find_tips"],
  notes: ["find_tips"],
  [TEMPLATES_FOCUS]: [
    // rename_template takes create_template's place rather than joining it. The
    // set has a ceiling and this screen was over it, and of the two, renaming is
    // the one with nowhere else to go: the rescue below reaches create_template
    // from any screen, because asking for a new list is something you say in
    // words a rescue can match ("a Disney list", "make a horse show template").
    // Asking to rename one names the list, and the list's name is not a word any
    // rescue can know in advance.
    "rename_template",
    "add_template_item",
    "update_template_item",
    "delete_template_item",
    "propagate_templates",
    // Which trips use an add-on is the question the Templates screen provokes:
    // the lists are in front of them and the obvious next thought is which trip
    // each one is for.
    //
    // It takes start_packing_list's place rather than joining it, because the set
    // has a ceiling and this screen was at it. Rebuilding one trip's list is a
    // trip action asked from the trip, and the words for it -- "packing list",
    // "start packing" -- reach it from anywhere through a rescue, so nothing is
    // actually lost. Saying which lists a trip is built from has no other words
    // and no other screen.
    "set_trip_templates",
  ],
  [REWARDS_FOCUS]: [
    "add_rewards_program",
    "update_rewards_program",
    "delete_rewards_program",
    // On the Wallet, "anything I should know?" means the cards, not a trip.
    "find_tips",
  ],
  // Knowing a new trip is a cruise is what should shape the list it is built
  // from, so this belongs on the builder more than anywhere.
  [NEW_TRIP_FOCUS]: ["start_packing_list", "set_trip_templates"],
};

// No focus means one of the screens that spans every trip: home, the trips list,
// Preferences & Reviews, or Who can sign in. Deleting a whole trip lives here and
// nowhere else, which also means a model on the itinerary screen cannot propose
// it however badly it misreads "cancel the tour".
const NO_FOCUS = [
  "delete_trip",
  "set_person_email",
  "update_review",
  "update_preference",
  "delete_preference",
];

// invite_person used to sit in the list above and no longer does, because the set
// has to stay inside twenty and recording a lesson earns its place more. Nobody
// asks for an invitation without using the word, so the rescue below reaches it.

// Words that reach for a part of the app the user is not currently looking at.
const PET_TOOLS = ["add_pet", "update_pet", "delete_pet", "set_pet_trip"];

const RESCUES = [
  {
    // "standing list" was what these were called until they were renamed, and
    // people go on saying it for a long time after a label changes, so the old
    // words still reach the right tools.
    test: /\b(packing template|packing templates|standing list|standing lists|template|templates)\b/i,
    tools: [
      "create_template",
      "rename_template",
      "add_template_item",
      "update_template_item",
      "delete_template_item",
      "propagate_templates",
      "set_trip_templates",
    ],
  },
  {
    // Asking for a standing list without using the word for one. "We should have
    // a Disney list" is how the request actually gets made, and it used to depend
    // on create_template sitting on whichever screen you happened to be on. Now
    // that renaming has taken its place there, the words have to carry it, so the
    // shape of the sentence is matched instead of the vocabulary: wanting, making
    // or starting a list with something in front of the word.
    test: /\b(?:need|want|should have|make|start|create|set up|build)\b[^.!?]{0,40}\ba\s+[\w'\u2019-]+(?:\s+[\w'\u2019-]+){0,3}\s+list\b/i,
    tools: ["create_template", "add_template_item"],
  },
  {
    // Renaming one without using the word "template" either. Somebody who says
    // "rename the cruise add-ons list" from the trips screen means the standing
    // list, and the name of the list is not a word any rescue can know in
    // advance, so the verb has to carry it.
    test: /\b(rename|renaming|change the name of|call)\b[^.!?]{0,60}\blists?\b/i,
    tools: ["rename_template"],
  },
  {
    // What kind of trip this is, said in passing. "It's a cruise" is how somebody
    // tells you which add-on lists apply without ever saying the word template.
    test: /\b(cruise|cruises|cruising|sailing|ship|safari|theme park|theme parks|disney|universal|horse show|beach|ski|skiing|road trip)\b/i,
    tools: ["set_trip_templates"],
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
  // The three profile groups, reached by the words people use for them. Carrier
  // names are in here on purpose: "she is on Verizon" never says the word
  // "carrier", and it is the most common way any of this gets mentioned.
  {
    test: /\b(carrier|provider|verizon|at&t|at ?and ?t|t-?mobile|mint mobile|google fi|visible|cricket|roaming|day pass|esim|iphone|android|pixel|samsung|galaxy|phone plan|stroller|pushchair|wheelchair|chair|mobility scooter|walker|cane|hearing aid|hearing aids|service animal|service dog|cpap|accessib\w*|step-?free|languages?|speaks?|spoken|bilingual|translat\w*)\b/i,
    tools: ["set_person_details"],
  },
  {
    test: /\b(prefers?|preference|preferences|dislikes?|allergic|allergy|hates?|favou?rite)\b/i,
    tools: ["update_preference", "delete_preference"],
  },
  // Pets. The species words matter more than the word "pet" does: nobody says
  // "our pet is coming", they say "is Biscuit coming" or "the dogs will board".
  // Names cannot be matched here because the rescue does not know them, so the
  // net is cast over the words people use around an animal instead.
  {
    test: /\b(pet|pets|pet-?friendly|dog|dogs|puppy|puppies|cat|cats|kitten|kittens|rabbit|rabbits|bunny|bird|birds|ferret|hamster|guinea pig|kennel|kennels|boarding|board (?:him|her|them|the dogs?|the cats?)|pet ?sitter|sitters?|doggy ?day ?care|vet|veterinarian|rabies|microchip|carrier|crate|leash|lead|muzzle|brachycephalic|snub-?nosed|service animal|service dog|emotional support)\b/i,
    tools: PET_TOOLS,
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
  // The picture behind a trip. Said from the trips list as often as from inside
  // a trip -- the covers are all in front of you there, which is exactly when
  // one of them looks wrong.
  {
    test: /\b(cover|picture|image|illustration|artwork|photo)\b[^.!?]{0,40}\b(trip|card|header)\b|\b(trip|card)\b[^.!?]{0,30}\b(cover|picture|image|illustration|artwork)\b|\b(draw|redraw|re-?draw|generate)\b[^.!?]{0,30}\b(cover|picture|image|illustration)\b/i,
    tools: ["draw_trip_cover"],
  },
  // Said from anywhere, because this is noticed while looking at a roster or a
  // person as often as while looking at the list itself: somebody came off the
  // trip and their things are still on it.
  {
    test: /\b(not (going|coming|on (the|this) trip)|off (the|this) trip|came off|took (her|him|them|\w+) off|removed? \w+ from (the|this)[^.!?]{0,20}\btrip\b|isn'?t going|no longer (going|coming))\b/i,
    tools: ["tidy_packing_list"],
  },
  // Reaching back for something she noted earlier. The notes themselves ride in
  // the context on every request, so this is for the rest of the store.
  {
    test: /\b(remember|remembered|recall|last time|previously|earlier|before|we (decided|agreed|learned|learnt|found|worked out)|did we|have we|what did (i|we) (say|decide|tell you)|your notes?|you noted|lessons?)\b/i,
    tools: ["recall_lessons", "retire_lesson"],
  },
  {
    test: /\b(wrong|no longer|out of date|outdated|not true|forget that|that changed)\b/i,
    tools: ["retire_lesson"],
  },
  // Asking to be told something, in the various ways people ask. The tool is
  // already on every screen inside a trip, so this only matters for the two
  // trip-level focuses that do not list it.
  {
    test: /\b(tips?|pro ?tips?|advice|anything (i|we) should know|what should (i|we) know|watch out|heads? ?up|catch(es)? people out|worth knowing|look (it )?up|research)\b/i,
    tools: ["find_tips"],
  },
  // Asking about cards, points or an offer, from wherever they happen to be
  // standing. The Wallet look needs no trip, so unlike the rest of find_tips this
  // is worth rescuing on every screen.
  {
    test: /\b(welcome (bonus|offer)|sign[- ]?up bonus|bonus offer|new card|open a card|annual fee|status match|points? (expir|lapse)|transfer bonus|miles? (expir|lapse)|which card)\b/i,
    tools: ["find_tips"],
  },
];

/** Which tool names this request should see, in declaration order. */
// A pet's own name is the most likely way it comes up — "is Biscuit coming?"
// contains no word any rescue could match. So the names are passed in and
// matched directly, the same reasoning that puts carrier brand names in the
// profile rescue rather than the word "carrier".
function petNameRescue(said, petNames) {
  if (!Array.isArray(petNames) || !petNames.length) return false;
  for (const raw of petNames) {
    const name = String(raw || "").trim();
    if (name.length < 2) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "iu").test(said))
      return true;
  }
  return false;
}

// What a secondary traveler may reach through Aly. Everything that answers a
// question, plus the two changes they are allowed to make to their own things.
// The declarations for those two are narrowed below rather than passed through:
// handing over the full update_packing_item schema and relying on the database to
// refuse the rest would let Aly promise an edit she cannot make.
const SECONDARY_TOOLS = new Set([
  "show_places",
  "offer_followups",
  "find_tips",
  "recall_lessons",
  "update_packing_item",
  "update_task",
  "set_person_details",
]);

// The only fields left on those two tools. Any other property of the patch is
// dropped from the schema, so the model is never shown a field it cannot use.
const SECONDARY_FIELDS = {
  update_packing_item: ["item", "id", "trip", "is_packed"],
  update_task: ["title", "id", "trip", "is_done"],
  // Their own paragraph about themselves, and nothing else on the person. "whose"
  // stays because the tool needs a subject, and the apply route checks that the
  // subject is them -- a schema cannot say "only this row".
  set_person_details: ["whose", "about_me"],
};

// Narrowing a declaration has to be a copy. These objects are module-level and
// shared by every request, so editing one in place would leak a secondary
// traveler's reduced schema into the next primary traveler's request.
function narrow(tool) {
  const keep = SECONDARY_FIELDS[tool.name];
  if (!keep) return tool;
  const props = tool.parameters?.properties || {};
  const kept = {};
  for (const key of keep) if (props[key]) kept[key] = props[key];
  return {
    ...tool,
    description:
      "Check off one of your own packing items, or finish one of your own " +
      "tasks. You cannot change anything else about them.",
    parameters: {
      ...tool.parameters,
      properties: kept,
      required: (tool.parameters?.required || []).filter((k) =>
        keep.includes(k),
      ),
    },
  };
}

export function toolNamesForRequest({
  focus = null,
  message = "",
  petNames = [],
  level = null,
} = {}) {
  // A secondary traveler's set does not depend on the screen or the wording,
  // because there is nothing to widen it to.
  if (level === SECONDARY) {
    return ALL.filter((t) => SECONDARY_TOOLS.has(t.name)).map((t) => t.name);
  }

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

  if (said && petNameRescue(said, petNames)) {
    for (const name of PET_TOOLS) wanted.add(name);
  }

  // Declaration order, so the model always sees them in the same arrangement
  // whatever combination of screen and words produced the set.
  return ALL.filter((t) => wanted.has(t.name)).map((t) => t.name);
}

/** The declarations themselves, ready to hand to an adapter. */
export function toolsForRequest(opts) {
  const tools = toolNamesForRequest(opts)
    .map((name) => BY_NAME.get(name))
    .filter(Boolean);
  if (opts?.level === SECONDARY) return tools.map(narrow);
  return tools;
}

/** Every tool, for the places that genuinely need the lot. */
export function allToolNames() {
  return ALL.map((t) => t.name);
}
