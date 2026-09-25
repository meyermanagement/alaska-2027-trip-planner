// A made-up household and trip for the Ask Aly tests. No real family data.
//
// The system prompt is a compact stand-in for the one the chat route builds:
// same rules, same tool names, a fraction of the context. It measures whether a
// model follows the rules the real prompt sets, not how it copes with a real
// family's full context.

export const TOOLS = [
  {
    name: "add_itinerary_item",
    description: "Add one item to a trip's itinerary.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        item_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string" },
        start_time: { type: "string", description: "HH:MM" },
        category: { type: "string", enum: ["flight", "lodging", "cruise", "excursion", "dining", "transport", "activity", "note"] },
        location: { type: "string" },
        status: { type: "string", enum: ["planned", "booked", "confirmed", "canceled"] },
      },
      required: ["title"],
    },
  },
  {
    name: "update_itinerary_item",
    description: "Change an existing itinerary item. Requires the item's id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" }, title: { type: "string" }, item_date: { type: "string" },
        start_time: { type: "string" }, status: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_itinerary_item",
    description: "Remove an itinerary item. Requires the item's id.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "add_packing_item",
    description: "Add one item to somebody's packing list.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        whose: { type: "string", description: "Nora, Theo, Ivy, or Shared" },
        quantity: { type: "integer" },
        category: { type: "string" },
      },
      required: ["name", "whose"],
    },
  },
  {
    name: "delete_packing_item",
    description: "Remove a packing item. Requires the item's id.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "add_predeparture_task",
    description: "Add a task to the pre-trip checklist.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        timing: { type: "string", enum: ["now", "month_before", "week_before", "day_before", "travel_day", "before_trip"] },
        assignee: { type: "string" },
      },
      required: ["title"],
    },
  },
];

export const SYSTEM = `You are Aly, the Calderwood family's travel assistant, inside their trip planner.

THE TRIP ON SCREEN: Alaska 2027, July 23 2027 to August 8 2027, a cruise-tour.
TRAVELERS: Nora, Theo, Ivy (age 12), and Shared (for things nobody owns personally).
HEALTH: Ivy has a severe peanut allergy and carries an epinephrine auto-injector.
ITINERARY ALREADY ON THIS TRIP:
  8f1c2a44-0000-4000-8000-000000000001 | 2027-07-24 | dining | Dinner at Harborlight Grill | 19:00 | Anchorage
  8f1c2a44-0000-4000-8000-000000000002 | 2027-07-26 | excursion | Glacier flightseeing | 09:30 | Talkeetna
  8f1c2a44-0000-4000-8000-000000000003 | 2027-07-28 | lodging | Ridgeview Lodge | check in
PACKING ITEMS ALREADY ON THIS TRIP:
  aa1c2a44-0000-4000-8000-000000000011 | Ivy | rain jacket
  aa1c2a44-0000-4000-8000-000000000012 | Theo | rain jacket
  aa1c2a44-0000-4000-8000-000000000013 | Shared | bear spray

RULES:
- When the user asks for a change, call the matching tool. Never describe a change you could make.
- To change or remove something that already exists, use its id from the lists above. Never invent an id.
- If the user only asks a question, answer in prose and call nothing.
- Dates are always YYYY-MM-DD. Times are 24-hour HH:MM.
- Today is August 26, 2026.`;

export const KNOWN_IDS = [
  "8f1c2a44-0000-4000-8000-000000000001",
  "8f1c2a44-0000-4000-8000-000000000002",
  "8f1c2a44-0000-4000-8000-000000000003",
  "aa1c2a44-0000-4000-8000-000000000011",
  "aa1c2a44-0000-4000-8000-000000000012",
  "aa1c2a44-0000-4000-8000-000000000013",
];

// Questions answered in prose. Each regex is a fact the answer has to contain.
export const QUESTIONS = [
  {
    id: "allergy",
    label: "Dinner with an allergy",
    ask: "Anything Ivy should watch out for at our Anchorage dinner?",
    facts: [/peanut/i, /(epi|auto-?injector|epinephrine)/i],
  },
  {
    id: "lookup",
    label: "Reads the itinerary",
    ask: "What do we have on July 26, and what time does it start?",
    facts: [/flightseeing/i, /(9:30|09:30|9\.30)/i],
  },
  {
    id: "count",
    label: "Counts the days",
    ask: "How many days long is this trip?",
    facts: [/(17 days|seventeen days|16 nights|sixteen nights)/i],
  },
  {
    // Harder: the answer is "no", and the reason is on another line.
    id: "clash",
    label: "Spots a clash",
    ask: "Could we fit a two-hour kayak tour into the morning of July 26, starting at 8:30?",
    facts: [/flightseeing/i, /(9:30|09:30|conflict|clash|overlap)/i],
  },
  {
    // Harder: has to notice who is missing from a list, not read a line off it.
    id: "missing",
    label: "Notices who is missing",
    ask: "Who still doesn't have a rain jacket on the packing list?",
    facts: [/Nora/],
  },
];

// Requests that should become tool calls. `want` is the exact set of tools.
export const CHANGES = [
  {
    id: "two-lists",
    label: "Adds to two lists at once",
    ask: "Add lunch at Tidewater Brewing in Anchorage on July 25 at noon, and put sunscreen on Ivy's list.",
    want: ["add_itinerary_item", "add_packing_item"],
  },
  {
    id: "edit-by-id",
    label: "Edits by id with a relative date",
    ask: "Push the glacier flightseeing back a day.",
    want: ["update_itinerary_item"],
    args: { update_itinerary_item: { id: "8f1c2a44-0000-4000-8000-000000000002", item_date: "2027-07-27" } },
  },
  {
    id: "delete-two",
    label: "Deletes two rows by id",
    ask: "Take the rain jackets off both lists.",
    want: ["delete_packing_item"],
    count: { delete_packing_item: 2 },
  },
  {
    id: "question",
    label: "Answers a question without acting",
    ask: "What time does our Anchorage dinner start?",
    want: [],
  },
  {
    id: "checklist",
    label: "Checklist, not itinerary",
    ask: "Remind me to renew Ivy's passport a month before we go.",
    want: ["add_predeparture_task"],
  },
  {
    id: "no-invented-id",
    label: "Does not invent an id",
    ask: "Cancel the whale watching tour.",
    want: [],
    noInventedId: true,
  },
  {
    id: "edit-and-add",
    label: "Edits one row and adds to another list",
    ask: "Move the Harborlight dinner to 7:30pm, and put Ivy's epinephrine auto-injector on her packing list.",
    want: ["add_packing_item", "update_itinerary_item"],
    args: { update_itinerary_item: { id: "8f1c2a44-0000-4000-8000-000000000001", start_time: "19:30" } },
  },
];

// Questions that need the web. Scored on whether sources came back and the
// answer has the shape asked for, never on a fact that changes.
export const LOOKUPS = [
  {
    id: "park",
    label: "Finds an official page",
    ask: "What is the official website for Denali National Park, and what does it say about the park entrance fee? Search the web.",
    facts: [/nps\.gov/i, /\$\s?\d+/],
  },
  {
    id: "sunset",
    label: "Answers something that changes daily",
    ask: "What time is sunset in Anchorage, Alaska today? Search the web.",
    facts: [/\d{1,2}[:.]\d{2}/],
  },
  {
    id: "ferry",
    label: "Names who runs a service",
    ask: "Which ferry system sails between Bellingham, Washington and Alaska, and what is its official website? Search the web.",
    facts: [/Alaska Marine Highway/i, /(dot\.alaska\.gov|ferryalaska\.com)/i],
  },
];

// A made-up fare alert. The household flies from STL and ORD, so the Denver
// fare must be left out.
export const FARE_EMAIL = `From: deals@farefinch.example
Subject: This week's fares from the Midwest

Hi traveler, here are this week's deals.

St. Louis (STL) to Lisbon (LIS): $412 round-trip on TAP Air Portugal, economy. Travel October through February.
Chicago (ORD) to Tokyo (HND): $689 round-trip on ANA, economy. Travel January through March.
Denver (DEN) to Paris (CDG): $455 round-trip on United, economy.
St. Louis (STL) to Cancun (CUN): $268 round-trip on Southwest, economy.

These fares may disappear within 48 hours.
You are receiving this because you subscribed to FareFinch. Unsubscribe. Privacy.`;

export const FARE_AIRPORTS = [{ code: "STL" }, { code: "ORD" }];
export const FARE_SOURCE = { name: "FareFinch", url: null };
export const FARE_TRUTH = [
  { origin: "STL", destination_code: "LIS", price: 412 },
  { origin: "ORD", destination_code: "HND", price: 689 },
  { origin: "STL", destination_code: "CUN", price: 268 },
];
export const FARE_EXCLUDED = ["DEN"];
