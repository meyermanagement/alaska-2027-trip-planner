// Made-up inputs for the request types the first version of the lab did not
// cover: tips, the Wallet, the menu search, reading an About-you paragraph, a
// second fare email, and a record the size of a real family's. Nobody here is
// real, and no row comes from the database.

// ---------- Tips (tips.write) ----------

const CREW = [
  { id: "t-nora", name: "Nora", date_of_birth: "1984-03-02" },
  { id: "t-theo", name: "Theo", date_of_birth: "1983-11-19" },
  { id: "t-ivy", name: "Ivy", date_of_birth: "2015-06-08" },
];

// A packing pass for an August cruise stop in Juneau with nothing on the list
// for rain. Rain is what Juneau does in August, so a useful answer says so; an
// answer that repeats something already packed is marked down.
export const TIP_CASES = [
  {
    id: "juneau-packing",
    label: "Packing for a wet port",
    brief: {
      scope: "packing",
      today: "2027-07-01",
      trip: {
        name: "Inside Passage 2027",
        destination: "Juneau, Alaska",
        start_date: "2027-08-02",
        end_date: "2027-08-05",
        status: "confirmed",
      },
      travelers: CREW,
      itinerary: [
        { item_date: "2027-08-02", title: "Ship docks in Juneau", category: "cruise", location: "Juneau" },
        { item_date: "2027-08-03", title: "Mendenhall Glacier walk", category: "excursion", location: "Mendenhall Glacier" },
        { item_date: "2027-08-04", title: "Whale watching boat", category: "excursion", location: "Auke Bay" },
      ],
      packing: [
        { item: "hiking boots", assignee: "Nora" },
        { item: "hiking boots", assignee: "Theo" },
        { item: "binoculars", assignee: "Shared" },
        { item: "sunscreen", assignee: "Shared" },
      ],
    },
    // The fact the answer should reach, and what is already on the list.
    wants: /(rain|waterproof|wet[- ]weather)/i,
    already: [/binocular/i, /sunscreen/i],
  },
];

// ---------- Wallet tips (wallet.tips) ----------

// Points that expire the week before the trip are the one thing worth saying.
export const WALLET_CASES = [
  {
    id: "expiring",
    label: "Points about to expire",
    brief: {
      scope: "wallet",
      today: "2027-05-01",
      travelers: CREW,
      programs: [
        {
          id: "prog-0001",
          kind: "airline",
          brand: "Northstar Air",
          program_name: "Skyward Club",
          traveler_id: "t-nora",
          points_balance: 41200,
          currency_label: "miles",
          points_checked_on: "2027-04-28",
          expiry_note: "Miles expire 2027-05-20 without account activity",
        },
        {
          id: "prog-0002",
          kind: "hotel",
          brand: "Harbor Stays",
          program_name: "Harbor Rewards",
          traveler_id: "t-theo",
          points_balance: 9000,
          currency_label: "points",
        },
      ],
      trips: [{ name: "Inside Passage 2027", destination: "Juneau, Alaska", start_date: "2027-08-02", end_date: "2027-08-05", status: "confirmed" }],
    },
    wants: /(expir|2027-05-20|May 20)/i,
    ids: ["prog-0001", "prog-0002"],
  },
];

// ---------- Menu search (nav.search) ----------

export const NAV_MENU = [
  { key: "now", kind: "link", label: "Now", sub: "What matters today" },
  { key: "trips", kind: "group", label: "Trips", sub: "Every trip" },
  { key: "trip:alaska", kind: "link", parent: "trips", label: "Alaska 2027", sub: "Jul 23 – Aug 8" },
  { key: "trip:curacao", kind: "link", parent: "trips", label: "Curaçao 2027", sub: "Mar 14 – Mar 21" },
  { key: "packing", kind: "link", parent: "trips", label: "Packing", sub: "Lists and templates" },
  { key: "reminders", kind: "link", parent: "trips", label: "Reminders", sub: "Before you go" },
  { key: "file", kind: "group", label: "Your file", sub: "People and cards" },
  { key: "family", kind: "link", parent: "file", label: "Family", sub: "Nora, Theo, Ivy" },
  { key: "wallet", kind: "link", parent: "file", label: "Wallet", sub: "Cards and programs" },
  { key: "settings", kind: "link", label: "Settings", sub: "Look and notifications", here: true },
];

export const NAV_CASES = [
  { id: "synonym", label: "A synonym", query: "suitcase", want: ["packing"], notWant: [] },
  { id: "person", label: "A person's name", query: "Theo", want: ["family"], notWant: ["settings"] },
  { id: "place", label: "A place", query: "curacao beach", want: ["trip:curacao"], notWant: ["trip:alaska"] },
  { id: "nonsense", label: "Keyboard mash", query: "qzxv jjkl", want: [], empty: true },
];

// ---------- About-you paragraphs (traveler priors) ----------

// `truth` is every slot the paragraph settles; anything else returned is a guess.
export const PRIOR_CASES = [
  {
    id: "clear",
    label: "Says it plainly",
    paragraph:
      "What you love doing: One big thing a day, then a long lazy lunch. What you're particular about: We always rent a car so we can go at our own pace. What you'd rather skip: Crowds. We go early or not at all.",
    truth: { pace: "one_thing", getting_around: "car", crowds: "without" },
  },
  {
    id: "hedged",
    label: "Hedges everything",
    paragraph:
      "What you're like: We travel a lot. Small group tours are fine. I like hiking. Strong guest reviews matter to me.",
    truth: {},
  },
];

// ---------- A second fare email ----------

// A fare repeated in the footer, and one from Milwaukee the family does not fly
// from. The codes are in the text on purpose: the app's verifier throws away any
// fare whose airports are not written in the email, so a city-only line would
// test the verifier rather than the model.
export const FARE_CASES = [
  {
    id: "midwest",
    label: "Four fares, two airports",
  },
  {
    id: "repeats",
    label: "A repeat and a stray airport",
    email: `From: alerts@skyscout.example
Subject: Fall fares worth a look

Chicago O'Hare (ORD) to Dublin (DUB): $498 round-trip on Aer Lingus, economy, October to December.
St. Louis (STL) to San Juan, Puerto Rico (SJU): $311 round-trip on Southwest, economy.
Milwaukee (MKE) to Denver (DEN): $129 round-trip on Frontier.

Still thinking about Dublin? The $498 O'Hare fare is above.
SkyScout. Unsubscribe.`,
    source: { name: "SkyScout", url: null },
    truth: [
      { origin: "ORD", destination_code: "DUB", price: 498 },
      { origin: "STL", destination_code: "SJU", price: 311 },
    ],
    excluded: ["MKE"],
  },
];

// ---------- A record the size of a real family's ----------

// The chat prompt in production carries the whole trip and family record, which
// the week's usage puts at tens of thousands of tokens. The ask cases above are
// a page long, so they cannot say what caching does to a follow-up. This builds
// about 50,000 tokens of plausible rows with two facts buried in them.
const PLACES = ["Anchorage", "Talkeetna", "Denali", "Fairbanks", "Seward", "Juneau", "Skagway", "Ketchikan", "Sitka", "Homer"];
const KINDS = ["dining", "excursion", "lodging", "transport", "activity"];
const THINGS = ["wool socks", "fleece", "phone charger", "headlamp", "water bottle", "hat", "gloves", "day pack", "camera", "snacks", "book", "sunglasses", "lip balm", "rain pants", "trekking poles"];
const WHO = ["Nora", "Theo", "Ivy", "Shared"];

function hex(n) {
  return n.toString(16).padStart(12, "0");
}

export function longRecord() {
  const lines = [];
  lines.push("You are Aly, the Calderwood family's travel assistant, inside their trip planner.");
  lines.push("");
  lines.push("TRAVELERS: Nora, Theo, Ivy (age 12), and Shared.");
  lines.push("HEALTH: Ivy has a severe peanut allergy and carries an epinephrine auto-injector.");
  lines.push("");
  lines.push("EVERY TRIP ON FILE, WITH ITS ITINERARY:");
  let n = 0;
  for (let t = 0; t < 16; t++) {
    const year = 2019 + Math.floor(t / 2);
    lines.push(`TRIP ${t + 1}: ${PLACES[t % PLACES.length]} ${year}, ${year}-0${(t % 8) + 1}-10 to ${year}-0${(t % 8) + 1}-20`);
    for (let i = 0; i < 40; i++) {
      n++;
      const place = PLACES[(t + i) % PLACES.length];
      const kind = KINDS[i % KINDS.length];
      const day = String((i % 10) + 10).padStart(2, "0");
      lines.push(
        `  8f1c2a44-0000-4000-8000-${hex(n)} | ${year}-0${(t % 8) + 1}-${day} | ${kind} | ${kind === "dining" ? "Dinner at" : kind === "lodging" ? "Stay at" : "Booked:"} ${place} ${["Harbor", "Ridge", "Summit", "Creek", "Bay"][i % 5]} ${["House", "Lodge", "Tours", "Kitchen", "Point"][(i + t) % 5]} | ${String(8 + (i % 12)).padStart(2, "0")}:${i % 2 ? "30" : "00"} | ${place} | confirmation ${String(100000 + n * 37).slice(-6)} | notes: ${["bring cash for tips", "reserved under Nora", "window table asked for", "arrive fifteen minutes early", "free cancellation until two days before"][i % 5]}`,
      );
    }
  }
  // The current trip, with the first buried fact.
  lines.push("THE TRIP ON SCREEN: Alaska 2027, July 23 2027 to August 8 2027.");
  lines.push("  8f1c2a44-0000-4000-8000-ffff00000001 | 2027-08-03 | excursion | Mendenhall Lake kayak | 08:15 | Juneau | confirmation KX4471");
  lines.push("");
  lines.push("PACKING ITEMS ON EVERY TRIP:");
  for (let i = 0; i < 1000; i++) {
    lines.push(`  aa1c2a44-0000-4000-8000-${hex(i + 1)} | ${WHO[i % 4]} | ${THINGS[i % THINGS.length]} | trip ${(i % 16) + 1}`);
  }
  // The second buried fact.
  lines.push("  aa1c2a44-0000-4000-8000-ffff00000002 | Theo | bear spray | Alaska 2027");
  lines.push("");
  lines.push("REVIEWS THEY WROTE:");
  for (let i = 0; i < 250; i++) {
    lines.push(`  ${PLACES[i % PLACES.length]} ${["Harbor", "Ridge", "Summit", "Creek", "Bay"][i % 5]} ${["House", "Lodge", "Tours", "Kitchen", "Point"][i % 5]}: ${(i % 5) + 1} stars. ${["Loved the view.", "Too loud for Ivy.", "Would go back.", "Slow service but kind staff.", "Worth the drive."][i % 5]}`);
  }
  lines.push("");
  lines.push("RULES:");
  lines.push("- When the user asks for a change, call the matching tool. If they only ask a question, answer in prose and call nothing.");
  lines.push("- Today is August 26, 2026.");
  return lines.join("\n");
}

export const LONG_CASES = [
  {
    id: "follow-up",
    label: "A question, then a follow-up",
    first: "What time is the Mendenhall Lake kayak on the Alaska trip?",
    firstFacts: [/(8:15|08:15)/],
    second: "And who is carrying the bear spray on that trip?",
    secondFacts: [/Theo/],
  },
];
