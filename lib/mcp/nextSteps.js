// Follow-up suggestions an assistant can put to the person after a write, and
// the link that sends somebody to Alyeska for what the connector does not do.
//
// Every step is an offer, never an instruction to act unasked, and each one is
// computed from the same helpers the app's own screens use, so the assistant
// and the app agree on what is missing, over budget or out of date. Every read
// here is best effort: a failed read drops the suggestion, never the write that
// already happened.
import { BASIC_SELECT, basicsProgress, nextBasic } from "@/lib/trips/basics";
import { passportWarnings } from "@/lib/tips/warnings";
import { buildBudget, money } from "@/lib/budget/budget";
import { houseTasksFor } from "@/lib/tasks/house";
import { planFor } from "@/lib/packing/propagateRun";

const HOME = "https://www.alyeska.app";

/**
 * Alyeska's own address. The configured site URL wins when it is a real one;
 * a Vercel build host or a laptop is never sent to somebody reading a chat.
 * (lib/email/sendInvite.js does the same for email, but lets localhost win.)
 */
export function alyeskaOrigin() {
  const clean = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  try {
    const host = new URL(clean).hostname;
    if (host && !/\.vercel\.app$/i.test(host) && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(host)) return clean;
  } catch {
    // Not a URL; fall through to home.
  }
  return HOME;
}

/** A page in Alyeska. */
export function appLink(path = "/") {
  return `${alyeskaOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * A refusal, rewritten so it sends the person to Alyeska rather than leaving
 * them at a dead end. Used on every ToolError the connector returns.
 */
export function pointToAlyeska(message) {
  let out = String(message || "").replace(/\bin the app\b/g, "in Alyeska");
  if (/https?:\/\//.test(out)) return out;
  if (/primary travelers/.test(out)) {
    return /\bshown to\b/.test(out)
      ? `${out} A primary traveler in your household can see it in Alyeska: ${appLink("/")}`
      : `${out} Ask a primary traveler in your household; they can do it in Alyeska: ${appLink("/")}`;
  }
  if (/\bin Alyeska\b/.test(out)) return `${out} Open Alyeska: ${appLink("/")}`;
  return out;
}

// The three basics update_trip can answer; the other four are answered on the
// trip's draft screen.
const WRITABLE_BASICS = { where: "destination", when: "start_date and end_date", budget: "budget" };

async function quiet(run, fallback) {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/** For a draft: which of the seven basics to ask about next. */
export async function basicsStep(client, tripId, known) {
  return quiet(async () => {
    let trip = known;
    if (!trip) {
      const { data, error } = await client.from("trips").select(BASIC_SELECT).eq("id", tripId);
      if (error || !data?.[0]) return null;
      trip = data[0];
    }
    const next = nextBasic(trip);
    if (!next) return null;
    const { answered, total } = basicsProgress(trip);
    const how = WRITABLE_BASICS[next.id]
      ? `save the answer with update_trip (${WRITABLE_BASICS[next.id]})`
      : "the answer is saved on the draft in Alyeska";
    return `${answered} of ${total} basics are answered. Next, ask "${next.question}"; ${how}.`;
  }, null);
}

/** After the dates change: adults whose passports will not cover the trip. */
export async function passportStep(client, scope, fam, trip) {
  return quiet(async () => {
    const { data: facts } = await client.from("trip_facts").select("leaves_country, countries").eq("trip_id", trip.id);
    if (facts?.[0]?.leaves_country !== true) return null;
    const { data: roster } = await client.from("trip_travelers").select("traveler_id").eq("trip_id", trip.id);
    const ids = new Set((roster || []).map((r) => r.traveler_id));
    // Adults only: nothing about a child's documents goes through the connector.
    const going = scope.travelers
      .filter((t) => t.family_id === fam.familyId && t.is_person && ids.has(t.id) && !fam.minorIds.has(t.id))
      .map((t) => ({ id: t.id, name: t.name, is_person: true }));
    if (!going.length) return null;
    const { data: documents } = await client
      .from("traveler_documents")
      .select("traveler_id, doc_type, expiration_date")
      .in("traveler_id", going.map((g) => g.id))
      .eq("doc_type", "passport");
    const [warning] = passportWarnings({
      trips: [{ ...trip, leavesCountry: true, countries: facts[0].countries, going }],
      documents: documents || [],
      today: scope.today,
    });
    if (!warning) return null;
    return `${warning.headline} Offer to add a reminder to renew it with add_reminder.`;
  }, null);
}

/** After a cost changes: say so once if the trip is now over its budget. */
export async function budgetStep(client, trip) {
  return quiet(async () => {
    const [{ data: row }, { data: costs }, { data: itinerary }] = await Promise.all([
      client.from("trips").select("id, budget_target").eq("id", trip.id),
      client.from("trip_costs").select("label, category, cost_estimate, cost_actual, sort_order").eq("trip_id", trip.id),
      client.from("itinerary_items").select("title, category, status, item_date, cost_estimate, cost_actual").eq("trip_id", trip.id),
    ]);
    const budget = buildBudget({ trip: row?.[0], itinerary: itinerary || [], costs: costs || [] });
    if (budget.over == null || budget.over <= 0) return null;
    return `${trip.name} now comes to ${money(budget.expected)}, ${money(budget.over)} over its ${money(budget.target)} budget. Mention it once; get_budget shows where the money goes.`;
  }, null);
}

/** After a fare is put on a trip: the two things that make it part of the plan. */
export function fareSteps(deal) {
  const price = deal.price != null ? `${deal.currency && deal.currency !== "USD" ? `${deal.currency} ` : "$"}${deal.price}` : "the fare";
  return [
    `Once the flight is booked, offer to add it to the itinerary with add_itinerary_item (category flight).`,
    `Offer to add ${price} to the budget with add_trip_cost (category getting_there).`,
    "Ask before doing either.",
  ];
}

/** After create_trip: what the household's departure list put on the trip. */
export async function houseStep(client, scope, fam, trip, going) {
  return quiet(async () => {
    const { data: tasks } = await client
      .from("house_tasks")
      .select("id, title, only_when_empty")
      .eq("family_id", fam.familyId);
    if (!tasks?.length) return null;
    if (trip.status === "draft") {
      return "The household's departure list is added to the reminders once the draft becomes a trip.";
    }
    const { data: added } = await client.from("predeparture_tasks").select("id, house_task_id").eq("trip_id", trip.id);
    const count = (added || []).filter((r) => r.house_task_id).length;
    const household = scope.travelers.filter((t) => t.family_id === fam.familyId && t.is_person).map((t) => t.name);
    const { skipped, staying } = houseTasksFor({ tasks, going, household });
    let line = count
      ? `Alyeska added the household's ${count} departure ${count === 1 ? "task" : "tasks"} to the reminders.`
      : "None of the household's departure tasks were added.";
    if (skipped.length && staying.length) {
      line += ` It left out ${skipped.length} that only apply when the house is empty, since ${staying.join(" and ")} ${staying.length === 1 ? "stays" : "stay"} home.`;
    }
    return line;
  }, null);
}

/**
 * After a template changes: upcoming trips that would change if the template
 * were pushed. Pushing is done in Alyeska, where each change is previewed first.
 */
export async function templatePushStep(client, scope, fam, { tripId } = {}) {
  return quiet(async () => {
    const plan = await planFor({ supabase: client, familyId: fam.familyId, today: scope.today });
    const trips = (plan.trips || []).filter((t) => !tripId || t.trip_id === tripId);
    if (!trips.length) return null;
    const names = trips.map((t) => t.trip).filter(Boolean);
    const lines = trips.reduce((n, t) => n + (t.adds?.length || 0) + (t.removes?.length || 0) + (t.updates?.length || 0), 0);
    const which = tripId ? names[0] : `${trips.length} upcoming ${trips.length === 1 ? "trip" : "trips"} (${names.join(", ")})`;
    return `${which} would change by ${lines} packing ${lines === 1 ? "line" : "lines"} if the templates were pushed. That is done on the Packing page in Alyeska, which previews each change first: ${appLink("/packing")}`;
  }, null);
}
