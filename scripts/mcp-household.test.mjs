// The household-context assistant tools, against the same two invented
// households, now with preferences, money, documents, a wallet, day packs,
// reminders, insurance, pets, fares and a bucket list. Every value that must
// never leave the app is a SECRET- sentinel, and every child row is named Kit.
// Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { readerScope } = jiti("../lib/mcp/scope.js");
const { TOOLS, callTool } = jiti("../lib/mcp/tools.js");
const { AGREEMENT_VERSION, PRIVACY_VERSION } = jiti("../lib/beta/agreement.js");

const TODAY = "2027-03-10";
const A = "fam-a", B = "fam-b";
const consent = (user_id) => ({ user_id, agreement_version: AGREEMENT_VERSION, privacy_version: PRIVACY_VERSION, age_confirmed: true, data_acknowledged: true });

function world() {
  return {
    beta_consents: [consent("u-ann"), consent("u-sam"), consent("u-bob"), consent("u-kid")],
    family_members: [
      { family_id: A, user_id: "u-ann" }, { family_id: A, user_id: "u-sam" },
      { family_id: B, user_id: "u-bob" },
    ],
    travelers: [
      { id: "ta1", family_id: A, name: "Ann", user_id: "u-ann", is_person: true, access_level: "primary", date_of_birth: "1980-01-01", accessibility_notes: "SECRET-HEALTH" },
      { id: "ta2", family_id: A, name: "Sam", user_id: "u-sam", is_person: true, access_level: "secondary", date_of_birth: "1982-01-01" },
      { id: "ta3", family_id: A, name: "Kit", user_id: null, is_person: true, access_level: "primary", date_of_birth: "2015-06-01" },
      { id: "tb1", family_id: B, name: "Ann", user_id: null, is_person: true, access_level: "primary", date_of_birth: "1970-01-01" },
      { id: "tb2", family_id: B, name: "Bob", user_id: "u-bob", is_person: true, access_level: "primary", date_of_birth: "1971-01-01" },
    ],
    trips: [
      { id: "trip-a1", family_id: A, name: "Curacao spring", destination: "Willemstad", start_date: "2027-03-09", end_date: "2027-03-15", status: "planning" },
      { id: "trip-a2", family_id: A, name: "Secret draft", destination: "Oslo", start_date: "2027-06-01", end_date: "2027-06-05", status: "draft" },
      { id: "trip-a0", family_id: A, name: "Maui last year", destination: "Maui", start_date: "2026-03-01", end_date: "2026-03-08", status: "complete" },
      { id: "trip-b1", family_id: B, name: "Curacao spring", destination: "Willemstad", start_date: "2027-03-09", end_date: "2027-03-12", status: "planning" },
    ],
    trip_travelers: [
      { trip_id: "trip-a1", traveler_id: "ta1" }, { trip_id: "trip-a1", traveler_id: "ta2" }, { trip_id: "trip-a1", traveler_id: "ta3" },
      { trip_id: "trip-a2", traveler_id: "ta2" },
      { trip_id: "trip-a0", traveler_id: "ta1" },
      { trip_id: "trip-b1", traveler_id: "tb1" }, { trip_id: "trip-b1", traveler_id: "tb2" },
    ],
    itinerary_items: [
      { trip_id: "trip-a1", item_date: TODAY, start_time: "14:00:00", title: "Snorkel tour", location: "Playa Lagun", notes: "SECRET-NOTE", confirmation_number: "SECRET-CONF", cost_actual: 999 },
      { trip_id: "trip-a1", item_date: TODAY, start_time: "08:30:00", title: "Breakfast" },
      { trip_id: "trip-a1", item_date: "2027-03-09", end_date: "2027-03-15", title: "Hotel stay", category: "lodging" },
      { trip_id: "trip-a0", item_date: "2026-03-03", title: "Mama's Fish House", location: "Paia", rating: 5, review: "Worth it" },
      { trip_id: "trip-b1", item_date: TODAY, start_time: "09:00:00", title: "OTHER-HOUSEHOLD", location: "Playa Lagun", rating: 1, review: "OTHER-HOUSEHOLD" },
    ],
    packing_items: [
      { trip_id: "trip-a1", category: "Clothes", item: "Swimsuit", assignee: "Ann", is_packed: true },
      { trip_id: "trip-a1", category: "Clothes", item: "Hat", assignee: "Ann", is_packed: false },
      { trip_id: "trip-a1", category: "Gear", item: "Snorkel", assignee: "Sam", is_packed: false },
      { trip_id: "trip-a1", category: "Toys", item: "CHILD-ITEM", assignee: "Kit", is_packed: false },
      { trip_id: "trip-a1", category: "Old", item: "Stashed", assignee: "Ann", is_packed: false, stashed_at: "2027-01-01" },
      { trip_id: "trip-b1", category: "Clothes", item: "OTHER-HOUSEHOLD", assignee: "Ann", is_packed: false },
    ],
    pro_tips: [
      { family_id: A, trip_id: "trip-a1", title: "Book the snorkel boat", body: "It sells out.", status: "active", act_by: "2027-03-11", for_date: TODAY },
      { family_id: A, trip_id: "trip-a1", title: "Old tip", body: "x", status: "cleared" },
      { family_id: B, trip_id: "trip-b1", title: "OTHER-HOUSEHOLD", body: "x", status: "active" },
    ],
    minors: new Set(["u-kid"]),
  };
}

// Just enough of supabase-js: select, eq, in, order and await.
function fakeAdmin(db, calls = []) {
  return {
    rpc: async (fn, args) => {
      calls.push(`rpc:${fn}`);
      if (fn !== "account_is_minor") return { data: null, error: { message: "no" } };
      return { data: db.minors.has(args.account_id), error: null };
    },
    from(table) {
      calls.push(`from:${table}`);
      let rows = [...(db[table] || [])];
      let cols = null;
      const q = {
        select(c) { cols = c.split(",").map((s) => s.trim()); return q; },
        eq(k, v) { rows = rows.filter((r) => r[k] === v); return q; },
        in(k, vs) { rows = rows.filter((r) => vs.includes(r[k])); return q; },
        order(k) { rows.sort((a, b) => String(a[k]).localeCompare(String(b[k]))); return q; },
        insert() { throw new Error("write attempted"); },
        update() { throw new Error("write attempted"); },
        delete() { throw new Error("write attempted"); },
        upsert() { throw new Error("write attempted"); },
        maybeSingle() { return Promise.resolve({ data: pick(rows)[0] || null, error: null }); },
        then(ok, bad) { return Promise.resolve({ data: pick(rows), error: null }).then(ok, bad); },
      };
      const pick = (rs) => (cols ? rs.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))) : rs);
      return q;
    },
  };
}

async function asUser(userId, db = world()) {
  const admin = fakeAdmin(db);
  const scope = await readerScope(admin, userId, TODAY);
  return { admin, scope, call: (name, args) => callTool(admin, scope, name, args) };
}


function household() {
  const db = world();
  db.trips.find((t) => t.id === "trip-a1").budget_target = 5000;
  db.itinerary_items.push(
    { id: "it-dinner", trip_id: "trip-a1", item_date: TODAY, start_time: "19:00:00", title: "Dinner at Kome", category: "food", cost_estimate: 200, cost_actual: 180, cost_note: "SECRET-COSTNOTE" },
    { id: "it-kitreview", trip_id: "trip-a0", item_date: "2026-03-04", title: "Kids club", rating: 5, review: "Kit loved it" },
    { id: "it-healthreview", trip_id: "trip-a0", item_date: "2026-03-05", title: "Maui bakery", rating: 4, review: "Good gluten free options" },
  );
  db.item_insights = [
    { trip_id: "trip-a1", item_id: "it-dinner", dress_code: "Smart casual", arrive_minutes: 10, arrive_why: "Tables are released", heads_up: null, bring: null },
    { trip_id: "trip-a1", item_id: "it-dinner-2", dress_code: "x", bring: "EpiPen for Ann" },
  ];
  db.trip_costs = [
    { trip_id: "trip-a1", label: "Flights", category: "flights", cost_estimate: 1500, cost_actual: 1480, cost_note: "SECRET-COSTNOTE" },
    { trip_id: "trip-b1", label: "OTHER-HOUSEHOLD", category: "flights", cost_estimate: 9, cost_actual: 9 },
  ];
  db.travel_preferences = [
    { family_id: A, traveler_id: null, traveler_ids: [], topic: "Food", topics: ["Food"], body: "We like local seafood", reason: "It is why we go", sort_order: 1 },
    { family_id: A, traveler_id: "ta1", traveler_ids: ["ta1"], topic: "Accommodations", topics: ["Accommodations"], body: "Ann wants a quiet room", reason: null, sort_order: 2 },
    { family_id: A, traveler_id: "ta1", traveler_ids: ["ta1"], topic: "Food", topics: ["Food"], body: "No shellfish, severe allergy", reason: null, sort_order: 3 },
    { family_id: A, traveler_id: "ta3", traveler_ids: ["ta3"], topic: "Excursions", topics: ["Excursions"], body: "CHILD-PREF", reason: null, sort_order: 4 },
    { family_id: A, traveler_id: null, traveler_ids: [], topic: "Excursions", topics: ["Excursions"], body: "Short hikes so Kit keeps up", reason: null, sort_order: 5 },
    { family_id: A, traveler_id: "ta2", traveler_ids: ["ta2"], topic: "Daily Pace", topics: ["Daily Pace"], body: "Sam likes slow mornings", reason: null, sort_order: 6 },
    { family_id: B, traveler_id: null, traveler_ids: [], topic: "Food", topics: ["Food"], body: "OTHER-HOUSEHOLD", reason: null, sort_order: 1 },
  ];
  db.traveler_documents = [
    { traveler_id: "ta1", doc_type: "passport", expiration_date: "2027-07-01", number: "SECRET-DOCNUM", notes: "SECRET-NOTE", storage_path: "SECRET-PATH" },
    { traveler_id: "ta2", doc_type: "passport", expiration_date: "2030-01-01", number: "SECRET-DOCNUM" },
    { traveler_id: "ta3", doc_type: "passport", expiration_date: "2027-04-01", number: "SECRET-DOCNUM" },
    { traveler_id: "tb2", doc_type: "passport", expiration_date: "2027-03-11", number: "OTHER-HOUSEHOLD" },
  ];
  db.trip_facts = [
    { trip_id: "trip-a1", family_id: A, leaves_country: true, countries: ["Curaçao"], entry_note: "Passport required", mains_voltage: "127V", plug_types: ["A", "B"], currencies: ["ANG"], languages: ["Papiamentu"], coverage_note: null,
      booking_windows: [{ name: "Snorkel boat", opens_days_before: 0, anchor: "trip_end", note: "Opens on the last day" }, { name: "Too late", opens_on: "2027-01-01" }] },
  ];
  db.trip_pets = [{ trip_id: "trip-a1", pet_id: "pet-1", arrangement: "coming", arrangement_notes: "SECRET-NOTE" }, { trip_id: "trip-a1", pet_id: "pet-2", arrangement: "sitter" }];
  db.pets = [
    { id: "pet-1", family_id: A, name: "Biscuit", species: "dog", breed: "Beagle", travel_style: "cabin", carrier_size: "S", is_service_animal: true, rabies_expiration: "2027-03-12", microchip_number: "SECRET-CHIP", vet_name: "SECRET-VET", vet_phone: "SECRET-VET", medications: "SECRET-MEDS", dietary_notes: "SECRET-DIET", temperament_notes: "SECRET-NOTE", notes: "SECRET-NOTE" },
    { id: "pet-2", family_id: A, name: "Mittens", species: "cat", rabies_expiration: "2028-01-01" },
    { id: "pet-b", family_id: B, name: "OTHER-HOUSEHOLD", species: "dog" },
  ];
  db.insurance_policies = [
    { id: "pol-1", family_id: A, kind: "trip", provider: "Acme Travel", plan_name: "Gold", policy_number: "SECRET-POLICY", coverage_start: "2027-03-09", coverage_end: "2027-03-15", covers: ["medical", "cancellation"], premium: 120, deductible: 0, medical_limit: 50000, evacuation_limit: 250000, emergency_phone: "+1 555 0100", claims_phone: null, claims_url: null, notes: "SECRET-NOTE" },
    { id: "pol-b", family_id: B, kind: "annual", provider: "OTHER-HOUSEHOLD" },
  ];
  db.insurance_policy_travelers = [{ policy_id: "pol-1", traveler_id: "ta1" }, { policy_id: "pol-1", traveler_id: "ta3" }];
  db.trip_insurance_policies = [{ trip_id: "trip-a1", policy_id: "pol-1" }];
  db.rewards_programs = [
    { family_id: A, traveler_id: "ta1", kind: "airline", brand: "United", program_name: "MileagePlus", points_balance: 42000, status_tier: "Silver", member_number: "SECRET-MEMBER", notes: "SECRET-NOTE", earn_rules: [{ on: "flights", rate: "5x", note: "SECRET-NOTE" }], credits: [{ on: "travel", amount: 300, resets: "yearly", note: "SECRET-NOTE" }], is_active: true },
    { family_id: A, traveler_id: "ta2", kind: "hotel", brand: "Hilton", program_name: "Honors", points_balance: 1000, member_number: "SECRET-MEMBER", is_active: true },
    { family_id: A, traveler_id: "ta3", kind: "airline", brand: "Delta", program_name: "CHILD-PROGRAM", member_number: "SECRET-MEMBER", is_active: true },
    { family_id: A, traveler_id: "ta1", kind: "credit_card", brand: "Old card", program_name: "Closed card", is_active: false },
    { family_id: B, traveler_id: "tb2", kind: "airline", program_name: "OTHER-HOUSEHOLD", is_active: true },
  ];
  db.card_offers = [
    { family_id: A, issuer: "Chase", card_name: "Sapphire", bonus_text: "60k points", min_spend: 4000, offer_ends_on: "2027-04-01", status: "open", decided_note: "SECRET-NOTE" },
    { family_id: A, issuer: "Amex", card_name: "Declined card", status: "declined" },
  ];
  db.day_pack_items = [
    { trip_id: "trip-a1", item_date: TODAY, item: "Reef-safe sunscreen", why: "Snorkel tour", assignee: null, is_packed: true },
    { trip_id: "trip-a1", item_date: TODAY, item: "Towel", assignee: "Sam", is_packed: false },
    { trip_id: "trip-a1", item_date: TODAY, item: "CHILD-ITEM", assignee: "Kit", is_packed: false },
    { trip_id: "trip-a1", item_date: TODAY, item: "Inhaler", assignee: "Ann", is_packed: false },
    { trip_id: "trip-a1", item_date: TODAY, item: "Snacks for Kit", assignee: null, is_packed: false },
  ];
  db.predeparture_tasks = [
    { trip_id: "trip-a1", title: "Print boarding passes", assignee: "Ann", due_date: "2027-03-08", is_done: false },
    { trip_id: "trip-a1", title: "Refill prescription", assignee: "Ann", due_date: "2027-03-01", is_done: false },
    { trip_id: "trip-a1", title: "Pack Kit's tablet", assignee: null, is_done: false },
    { trip_id: "trip-a1", title: "Done already", assignee: "Ann", is_done: true },
    { trip_id: "trip-a1", title: "Sam's task", assignee: "Sam", is_done: false },
  ];
  db.house_tasks = [
    { family_id: A, title: "Hold the mail", timing: "week_before", only_when_empty: true },
    { family_id: B, title: "OTHER-HOUSEHOLD", timing: "now" },
  ];
  db.location_tips = [
    { user_id: "u-ann", trip_id: "trip-a1", status: "active", checked_at: "2027-03-10T10:00:00Z", content: { title: "Beach closes at 6", body: "Leave by 5:30", sources: [] } },
    { user_id: "u-sam", trip_id: "trip-a1", status: "active", checked_at: "2027-03-10T10:00:00Z", content: { title: "SAM-PRIVATE-TIP" } },
  ];
  db.someday_places = [
    { family_id: A, place: "Iceland", why: "Northern lights", months: [2, 3], nights: 6, fare_ceiling: 700, traveler_ids: ["ta1", "ta3"], watch: true, status: "open", priority: 1 },
    { family_id: A, place: "Legoland", why: "For Kit", status: "open", priority: 2 },
    { family_id: B, place: "OTHER-HOUSEHOLD", status: "open" },
  ];
  db.flight_deals = [
    { family_id: A, origin: "STL", destination: "Reykjavik", price: 450, currency: "USD", book_by: "2027-03-20", status: "open", notes: "SECRET-NOTE" },
    { family_id: A, origin: "STL", destination: "Expired", price: 1, book_by: "2027-03-01", status: "open" },
    { family_id: B, origin: "OTHER-HOUSEHOLD", status: "open" },
  ];
  db.home_airports = [{ family_id: A, code: "STL", name: "Lambert", is_primary: true, notes: "SECRET-NOTE" }];
  db.favorite_moments = [
    { family_id: A, traveler_id: "ta1", body: "Sunrise on Haleakala" },
    { family_id: A, traveler_id: "ta3", body: "CHILD-MOMENT" },
    { family_id: A, traveler_id: "ta1", body: "Watching Kit swim" },
  ];
  return db;
}

async function run(userId, name, args = {}) {
  const db = household();
  const admin = fakeAdmin(db);
  const scope = await readerScope(admin, userId, TODAY);
  return callTool(admin, scope, name, args);
}

const NEW = ["get_preferences", "get_budget", "get_expiration_dates", "get_insurance", "get_wallet", "get_day_pack", "get_reminders", "get_house_tasks", "get_deadlines", "get_trip_essentials", "get_nearby_tips", "get_bucket_list", "get_fare_alerts", "get_pets", "get_trip_log", "get_itinerary_day", "get_prior_reviews"];
const argsFor = (name) => (name === "get_prior_reviews" ? { place: "maui" } : {});

test("the new tools are listed, read-only, and take only text", () => {
  for (const name of NEW) {
    const tool = TOOLS.find((t) => t.name === name);
    assert.ok(tool, name);
    assert.equal(tool.annotations.readOnlyHint, true, name);
    assert.equal(tool.inputSchema.additionalProperties, false, name);
  }
});

test("no answer, for the primary, carries a secret, a child, or another household", async () => {
  for (const name of NEW) {
    const out = JSON.stringify(await run("u-ann", name, argsFor(name)));
    for (const bad of ["SECRET-", "CHILD-", "OTHER-HOUSEHOLD", "Kit", "SAM-PRIVATE"]) assert.ok(!out.includes(bad), `${name} leaked ${bad}: ${out}`);
  }
});

test("health wording is withheld, the rest of the preferences come through", async () => {
  const out = await run("u-ann", "get_preferences");
  const said = out.preferences.map((p) => p.preference);
  assert.deepEqual(said.sort(), ["Ann wants a quiet room", "Sam likes slow mornings", "We like local seafood"]);
  assert.equal(out.preferences.find((p) => p.preference.startsWith("We like")).whose[0], "Shared");
  assert.equal((await run("u-ann", "get_preferences", { topic: "food" })).preferences.length, 1);
});

test("a secondary traveler gets only their own and shared rows, and none of the household's money", async () => {
  const prefs = (await run("u-sam", "get_preferences")).preferences.map((p) => p.preference).sort();
  assert.deepEqual(prefs, ["Sam likes slow mornings", "We like local seafood"]);
  const docs = await run("u-sam", "get_expiration_dates");
  assert.deepEqual(docs.documents.map((d) => d.whose), ["Sam"]);
  assert.deepEqual(docs.pets, []);
  const wallet = await run("u-sam", "get_wallet");
  assert.deepEqual(wallet.programs.map((p) => p.program), ["Honors"]);
  assert.deepEqual(wallet.card_offers, []);
  assert.deepEqual((await run("u-sam", "get_day_pack")).items.map((i) => i.item).sort(), ["Reef-safe sunscreen", "Towel"]);
  assert.deepEqual((await run("u-sam", "get_reminders")).reminders.map((r) => r.reminder), ["Sam's task"]);
  assert.deepEqual((await run("u-sam", "get_nearby_tips")).tips.map((t) => t.title), ["SAM-PRIVATE-TIP"]);
  for (const name of ["get_budget", "get_insurance", "get_house_tasks", "get_bucket_list", "get_fare_alerts", "get_pets"])
    await assert.rejects(run("u-sam", name), /primary travelers only/, name);
});

test("expiration dates are checked against the trip, six months out for a passport abroad", async () => {
  const out = await run("u-ann", "get_expiration_dates", { trip: "Curacao" });
  const ann = out.documents.find((d) => d.whose === "Ann");
  assert.match(ann.check, /six months/);
  assert.equal(ann.number, undefined);
  assert.deepEqual(out.pets.map((p) => [p.pet, p.check]), [["Biscuit", "Expires before the trip ends."]]);
});

test("the budget adds up plan and costs, and leaves the note behind", async () => {
  const out = await run("u-ann", "get_budget");
  assert.equal(out.budget_target, 5000);
  assert.equal(out.planned, 1700);
  assert.equal(out.actual, 2659); // 1480 flights + 180 dinner + 999 snorkel
});

test("wallet: balances and earn rates, no member numbers, closed cards gone, open offers only", async () => {
  const out = await run("u-ann", "get_wallet");
  assert.deepEqual(out.programs.map((p) => p.program).sort(), ["Honors", "MileagePlus"]);
  assert.deepEqual(out.programs.find((p) => p.program === "MileagePlus").earns, [{ on: "flights", rate: "5x" }]);
  assert.deepEqual(out.card_offers.map((o) => o.card), ["Sapphire"]);
});

test("insurance names only the adults it covers", async () => {
  const out = await run("u-ann", "get_insurance", { trip: "Curacao" });
  assert.equal(out.policies.length, 1);
  assert.deepEqual(out.policies[0].adults_covered, ["Ann"]);
  assert.equal(out.policies[0].spans_trip, true);
});

test("pets: arrangement in words, no service-animal flag", async () => {
  const out = await run("u-ann", "get_pets", { trip: "Curacao" });
  assert.deepEqual(out.pets.map((p) => [p.name, p.arrangement]), [["Biscuit", "Coming with us"], ["Mittens", "Pet sitter at home"]]);
  assert.ok(!("service_animal" in out.pets[0]));
});

test("deadlines: a booking window still ahead, a live fare, an open offer; past ones dropped", async () => {
  const out = await run("u-ann", "get_deadlines");
  assert.deepEqual(out.deadlines.map((d) => [d.kind, d.date]), [["booking window", "2027-03-15"], ["fare", "2027-03-20"], ["card offer", "2027-04-01"]]);
});

test("the day and the essentials carry booking advice, minus health wording", async () => {
  const day = await run("u-ann", "get_itinerary_day");
  assert.equal(day.items.find((i) => i.title === "Dinner at Kome").advice.dress_code, "Smart casual");
  const ess = await run("u-ann", "get_trip_essentials");
  assert.deepEqual(ess.facts.plugs, ["A", "B"]);
  assert.deepEqual(ess.bookings.map((b) => b.booking), ["Dinner at Kome"]);
});

test("reviews that name a child or read as health are dropped whole", async () => {
  const out = await run("u-ann", "get_prior_reviews", { place: "maui" });
  assert.deepEqual(out.reviews.map((r) => r.place), ["Mama's Fish House"]);
});

test("bucket list and trip log keep the adults' rows only", async () => {
  const bl = await run("u-ann", "get_bucket_list");
  assert.deepEqual(bl.places.map((p) => [p.place, p.priority, p.who.join()]), [["Iceland", "high", "Ann"]]);
  assert.deepEqual((await run("u-ann", "get_trip_log")).moments.map((m) => m.moment), ["Sunrise on Haleakala"]);
  const fares = await run("u-ann", "get_fare_alerts");
  assert.deepEqual(fares.fares.map((f) => f.to), ["Reykjavik"]);
  assert.deepEqual(fares.home_airports, [{ code: "STL", name: "Lambert", city: null, drive_minutes: null, primary: true }]);
});
