// The kinds of request the app makes, as the model lab names them. Safe to
// import from the page: labels and ids only, no fixtures.
//
// `uses` is the feature key in catalog.inUse(), so the page can say which model
// each kind of request is on today and which setting changes it.

export const SCENARIOS = [
  {
    id: "ask",
    label: "Ask Aly questions",
    blurb: "Answers from the trip and the family, in prose",
    uses: "ask",
    cases: [
      { id: "allergy", label: "Dinner with an allergy" },
      { id: "lookup", label: "Reads the itinerary" },
      { id: "count", label: "Counts the days" },
      { id: "clash", label: "Spots a clash" },
      { id: "missing", label: "Notices who is missing" },
    ],
  },
  {
    id: "tools",
    label: "Ask Aly changes",
    blurb: "Turns a request into the right edits",
    uses: "tools",
    cases: [
      { id: "two-lists", label: "Adds to two lists at once" },
      { id: "edit-by-id", label: "Edits by id with a relative date" },
      { id: "delete-two", label: "Deletes two rows by id" },
      { id: "question", label: "Answers without acting" },
      { id: "checklist", label: "Checklist, not itinerary" },
      { id: "no-invented-id", label: "Does not invent an id" },
      { id: "edit-and-add", label: "Edits one row and adds to another list" },
    ],
  },
  {
    id: "search",
    label: "Web lookups",
    blurb: "Searches the web and says where it looked",
    uses: "search",
    cases: [
      { id: "park", label: "Finds an official page" },
      { id: "sunset", label: "Answers something that changes daily" },
      { id: "ferry", label: "Names who runs a service" },
    ],
  },
  {
    id: "email",
    label: "Booking emails",
    blurb: "Reads a confirmation into itinerary items",
    uses: "email",
    cases: [
      { id: "flight-3leg", label: "Three-leg flight" },
      { id: "hotel-pt", label: "Hotel, in Portuguese" },
      { id: "rental-oneway", label: "One-way car rental" },
      { id: "insurance", label: "Travel insurance" },
      { id: "marketing", label: "Marketing, not a booking" },
    ],
  },
  {
    id: "documents",
    label: "Document photos",
    blurb: "Reads a passport, license or policy from an image",
    uses: "documents",
    cases: [
      { id: "passport", label: "Passport" },
      { id: "license", label: "Driver's license" },
      { id: "trip-policy", label: "Trip insurance policy" },
      { id: "annual-plan", label: "Annual insurance plan" },
      { id: "card-benefits", label: "Card benefits guide" },
    ],
  },
  {
    id: "fares",
    label: "Fare alerts",
    blurb: "Pulls the fares from your airports out of a deal email",
    uses: "fares",
    cases: [
      { id: "midwest", label: "Four fares, two airports" },
      { id: "repeats", label: "A repeat and a stray airport" },
    ],
  },
  {
    id: "tips",
    label: "Tips",
    blurb: "Writes tips that pass the app's own checks",
    uses: "tips",
    cases: [{ id: "juneau-packing", label: "Packing for a wet port" }],
  },
  {
    id: "wallet",
    label: "Wallet tips",
    blurb: "Finds the one card or program worth acting on",
    uses: "wallet",
    cases: [{ id: "expiring", label: "Points about to expire" }],
  },
  {
    id: "nav",
    label: "Menu search",
    blurb: "Finds the right screen from a word",
    uses: "nav",
    cases: [
      { id: "synonym", label: "A synonym" },
      { id: "person", label: "A person's name" },
      { id: "place", label: "A place" },
      { id: "nonsense", label: "Keyboard mash" },
    ],
  },
  {
    id: "priors",
    label: "About-you paragraph",
    blurb: "Fills interview answers only where the paragraph is clear",
    uses: "priors",
    cases: [
      { id: "clear", label: "Says it plainly" },
      { id: "hedged", label: "Hedges everything" },
    ],
  },
  {
    id: "long",
    label: "Full-size record",
    blurb: "A 50,000-token record, then a follow-up on the same record",
    uses: "long",
    cases: [{ id: "follow-up", label: "A question, then a follow-up" }],
  },
];

export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id) || null;

export function requestCount(scenarioIds) {
  return scenarioIds.reduce((n, id) => n + (scenarioById(id)?.cases.length || 0), 0);
}
