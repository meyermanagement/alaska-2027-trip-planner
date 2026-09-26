// The assistant tools that plan: the itinerary, the trip itself, the Wallet,
// packing templates, and putting a packing-list line into a day pack.
//
// These change more than a tick or a new line, so they are held tighter than
// writeTools.js:
//
//   - Primary travelers only. A secondary is refused here, and row-level
//     security refuses them again on every table these touch.
//   - One household. A trip-level tool writes inside the trip's own household;
//     a household-level tool (create_trip, the Wallet, templates) refuses a
//     person who is primary in more than one, rather than guessing which.
//   - Nothing is deleted. Cancelling an itinerary item is a status, and the
//     row stays.
//   - Nothing that reads as health is written, and confirmation and member
//     numbers are neither accepted nor returned.
//   - An ambiguous name changes nothing and lists the candidates, and adding
//     something already there changes nothing.
//
// create_trip and update_trip go through lib/trips/write.js, the same code an
// approved Ask Aly card runs, so the roster, the house tasks, the cover queue
// and the history of the basics behave the same either way.

import { familyOf } from "./scope";
import { basicsStep, budgetStep, houseStep, passportStep, templatePushStep } from "./nextSteps";
import { readsAsHealth } from "./householdTools";
import { pickLine } from "./writeTools";
import { writeTrip } from "@/lib/trips/write";
import { matchCaseRow } from "@/lib/daypack/link";
import { looksLastMinute } from "@/lib/packing/lastMinute";
import { SPANNING_CATEGORIES } from "@/lib/format";
import {
  ITINERARY_CATEGORIES,
  ITINERARY_STATUSES,
  REWARD_KIND_KEYS,
  TRIP_STATUSES,
} from "@/lib/agent/tools";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
const clip = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, n) : null;
};
const given = (v) => v !== undefined && v !== null && String(v).trim() !== "";

function isoDate(ToolError, value, field) {
  if (!given(value)) return undefined;
  const s = String(value).trim();
  if (!ISO.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new ToolError(`${field} must be a date, YYYY-MM-DD.`);
  return s;
}

function time(ToolError, value) {
  if (!given(value)) return undefined;
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new ToolError("time must be 24-hour HH:MM, such as 14:30.");
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function oneOf(ToolError, value, allowed, field) {
  if (!given(value)) return undefined;
  const s = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!allowed.includes(s)) throw new ToolError(`${field} must be one of ${allowed.join(", ")}.`);
  return s;
}

function amount(ToolError, value, field, max, { whole = false } = {}) {
  if (!given(value)) return undefined;
  const n = Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > max || (whole && !Number.isInteger(n))) {
    throw new ToolError(`${field} must be ${whole ? "a whole number" : "a number"} from 0 to ${max.toLocaleString("en-US")}.`);
  }
  return whole ? n : Math.round(n * 100) / 100;
}

function text(ToolError, value, field, max) {
  if (!given(value)) return undefined;
  const s = clip(value, max + 1);
  if (s.length > max) throw new ToolError(`${field} is too long; keep it under ${max} characters.`);
  return s;
}

function noHealth(ToolError, ...texts) {
  if (readsAsHealth(...texts.filter(Boolean))) {
    throw new ToolError("Leave health details out; add them in Alyeska if they matter. Nothing was saved.");
  }
}

function tripPrimary(ToolError, scope, trip, what) {
  const fam = familyOf(scope, trip.family_id);
  if (!fam || fam.secondary) throw new ToolError(`Only the household's primary travelers can ${what}. Nothing was changed.`);
  return fam;
}

/** The one household this person is primary in, for household-level writes. */
function onlyPrimaryFamily(ToolError, scope, what) {
  const fams = scope.families.filter((f) => !f.secondary);
  if (!fams.length) throw new ToolError(`Only the household's primary travelers can ${what}. Nothing was changed.`);
  if (fams.length > 1) throw new ToolError(`You belong to more than one household, so this has to be done in Alyeska. Nothing was changed.`);
  return fams[0];
}

function people(scope, fam) {
  return scope.travelers.filter((t) => t.family_id === fam.familyId && t.is_person && t.name !== "Shared");
}

/** A first name to one person, from a given pool. Refuses unknown or ambiguous. */
function onePerson(ToolError, pool, said, verb) {
  const want = norm(said);
  const exact = pool.filter((p) => norm(p.name) === want);
  const hits = exact.length ? exact : pool.filter((p) => norm(p.name).startsWith(want));
  if (hits.length === 1) return hits[0];
  const names = pool.map((p) => p.name).join(", ");
  if (!hits.length) throw new ToolError(`"${said}" is not in this household. Say one of: ${names}. Nothing was ${verb}.`);
  throw new ToolError(`"${said}" could be ${hits.map((p) => p.name).join(" or ")}. Nothing was ${verb}.`);
}

const itineraryOut = (i) => ({
  title: i.title,
  date: i.item_date || null,
  end_date: i.end_date || null,
  time: i.start_time ? String(i.start_time).slice(0, 5) : null,
  category: i.category || null,
  status: i.status || null,
  place: i.location || null,
});

function checkSpan(ToolError, category, start, end) {
  if (!end) return;
  if (!SPANNING_CATEGORIES.includes(category)) throw new ToolError(`An end date only belongs on a ${SPANNING_CATEGORIES.join(" or ")} item, not a ${category} one.`);
  if (!start) throw new ToolError("An end date needs a start date.");
  if (end <= start) throw new ToolError("A stay covers at least one night, so end_date has to be after date.");
}

const programOut = (p, whose) => ({
  program: p.program_name || p.brand,
  brand: p.brand,
  kind: p.kind,
  whose,
  balance: p.points_balance ?? null,
  unit: p.currency_label || null,
  balance_checked_on: p.points_checked_on || null,
  status: p.status_tier || null,
  annual_fee: p.annual_fee == null ? null : Number(p.annual_fee),
});

export function planTools(ADD, UPDATE, tripArg) {
  const t = (name, title, description, properties, required, annotations) => ({
    name,
    title,
    description,
    inputSchema: { type: "object", properties, ...(required ? { required } : {}), additionalProperties: false },
    annotations: { title, ...annotations },
  });
  const date = (description) => ({ type: "string", description, pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
  const s = (description) => ({ type: "string", description });
  const e = (values, description) => ({ type: "string", enum: values, description });
  return [
    t("add_itinerary_item", "Add an itinerary item",
      "Adds one plan to a trip's itinerary: a flight, a stay, a dinner, an excursion. Primary travelers only. Will not add an item already on that day with the same title, or anything about health. Confirmation numbers are added in Alyeska.",
      {
        trip: tripArg,
        title: s("What it is, such as Dinner at Kome or Flight to Juneau."),
        date: date("The day, YYYY-MM-DD. For a stay, check-in."),
        end_date: date("Check-out, YYYY-MM-DD, for lodging or cruise only."),
        time: s("Start time, 24-hour HH:MM."),
        category: e(ITINERARY_CATEGORIES, "Defaults to activity."),
        status: e(ITINERARY_STATUSES, "Defaults to planned. Use confirmed only when it is booked."),
        location: s("Where it is."),
        notes: s("A short note."),
      },
      ["title", "date"], ADD),
    t("update_itinerary_item", "Update an itinerary item",
      "Changes one item already on a trip's itinerary: its time, date, place, status or title. Set status to cancelled to cancel it; nothing is deleted. Primary travelers only. If more than one item matches, it changes nothing and lists them.",
      {
        trip: tripArg,
        item: s("The item's title as it appears on the itinerary."),
        on: date("The item's current day, YYYY-MM-DD, when more than one item has that title."),
        title: s("A new title."),
        date: date("A new day, YYYY-MM-DD."),
        end_date: date("A new check-out, YYYY-MM-DD, for lodging or cruise only."),
        time: s("A new start time, 24-hour HH:MM."),
        category: e(ITINERARY_CATEGORIES, "A new category."),
        status: e(ITINERARY_STATUSES, "A new status."),
        location: s("A new place."),
      },
      ["item"], UPDATE),
    t("create_trip", "Create a trip",
      "Creates a new trip in the household, with who is going. Primary travelers only. It does not build a packing list; the result's next_steps say what to offer next. Will not create a second trip with the same name.",
      {
        name: s("The trip's name, such as Iceland 2028."),
        destination: s("Where it is."),
        start_date: date("First day, YYYY-MM-DD."),
        end_date: date("Last day, YYYY-MM-DD."),
        status: e(["draft", "planning", "complete"], "draft for an idea, planning for a trip you mean to take (the default), complete for a trip already taken."),
        travelers: s("Who is going, first names, comma-separated. Defaults to everyone in the household."),
        budget: s("The budget in dollars."),
      },
      ["name"], ADD),
    t("update_trip", "Update a trip",
      "Changes a trip's name, destination, dates, status or budget. Primary travelers only. Who is going is changed in Alyeska.",
      {
        trip: tripArg,
        name: s("A new name."),
        destination: s("A new destination."),
        start_date: date("A new first day, YYYY-MM-DD."),
        end_date: date("A new last day, YYYY-MM-DD."),
        status: e(TRIP_STATUSES, "A new status. draft is an idea; planning is a trip you mean to take."),
        budget: s("A new budget in dollars."),
      },
      ["trip"], UPDATE),
    t("add_rewards_program", "Add a rewards program or card",
      "Adds a loyalty program or credit card to the household's Wallet, for one adult or Shared. Primary travelers only. Member and card numbers are added in Alyeska, never here. Will not add a program that person already has.",
      {
        brand: s("The company, such as Alaska Airlines, Marriott or Chase."),
        kind: e(REWARD_KIND_KEYS, "What sort of program it is."),
        whose: s("Whose it is, by first name, or Shared. Defaults to Shared."),
        program_name: s("The program or card name, such as Mileage Plan or Sapphire Preferred."),
        currency_label: s("What its points are called, such as miles or points."),
        balance: s("The current balance, as a whole number. Only if the person said it."),
        status_tier: s("Elite status, such as MVP Gold."),
        annual_fee: s("The card's annual fee in dollars."),
      },
      ["brand", "kind"], ADD),
    t("update_rewards_program", "Update a rewards program or card",
      "Updates the balance, elite status or annual fee of a program already in the Wallet. Primary travelers only. If more than one program matches, it changes nothing and lists them.",
      {
        program: s("The program's brand or name, as get_wallet shows it."),
        whose: s("Whose it is, by first name, when more than one person has it."),
        balance: s("The new balance, as a whole number."),
        status_tier: s("The new elite status."),
        annual_fee: s("The new annual fee in dollars."),
      },
      ["program"], UPDATE),
    t("add_template_item", "Add an item to a packing template",
      "Adds one item to a packing template, the lists new trips are built from. Defaults to the base list every trip starts with. Primary travelers only. It changes nothing on trips that already exist. Will not add an item already on that template for that person, or anything about health.",
      {
        item: s("What to pack, such as Rain jacket."),
        list: s("Which template, by name. Defaults to the base list."),
        traveler: s("Who always packs it, by first name, or Shared. Defaults to Shared."),
        quantity: s("How many, if more than one."),
        category: s("The list's category, such as Clothes or Gear."),
        last_minute: e(["yes", "no"], "yes for something packed on the last morning, such as a charger in use."),
      },
      ["item"], ADD),
    t("add_day_pack_item", "Put a packing item in a day pack",
      "Takes one line already on a trip's packing list and puts it in the day pack for a day, or for every day. Primary travelers only. The item has to be on the packing list first; add it with add_packing_item if not. Will not add it twice to the same day.",
      {
        trip: tripArg,
        item: s("The packing-list line's name."),
        date: date("The day, YYYY-MM-DD. Leave it out for every day of the trip."),
        traveler: s("Whose line it is, by first name, when more than one person has it."),
        why: s("Why it is needed that day, such as For the glacier walk."),
      },
      ["item"], ADD),
  ];
}

/** `{ next_steps }` when there is something to offer, `{}` otherwise. */
async function withSteps(...pending) {
  const steps = (await Promise.all(pending)).flat().filter(Boolean);
  return steps.length ? { next_steps: steps } : {};
}

/** What to offer after a new trip: suggestions for the assistant to put to the
 * person, never something it should do unasked. */
async function nextSteps(client, fam, name, status) {
  if (status === "complete") return [];
  if (status === "draft") return [`Nothing packs for a draft. Once ${name} is a trip you mean to take (update_trip, status planning), offer to start its packing list.`];
  const { data } = await client.from("packing_templates").select("name, is_base").eq("family_id", fam.familyId);
  const base = (data || []).find((l) => l.is_base);
  const addOns = (data || []).filter((l) => !l.is_base).map((l) => l.name);
  const steps = [];
  if (addOns.length) steps.push(`Ask which of the household's add-on packing templates fit ${name} (${addOns.join(", ")}), then save the answer with set_trip_templates.`);
  steps.push(base
    ? `Offer to start the packing list with start_packing_list; it copies ${base.name}, the base list, for the people going.`
    : "There is no base packing list yet, so the packing list is started in Alyeska.");
  steps.push("Ask before doing either.");
  return steps;
}

export function planHandlers({ ToolError, pickTrip, tripRef, visiblePacking }) {
  return {
    async add_itinerary_item(client, scope, args) {
      const title = text(ToolError, args.title, "title", 200);
      if (!title) throw new ToolError("Say what the itinerary item is.");
      const day = isoDate(ToolError, args.date, "date");
      if (!day) throw new ToolError(`Say which day "${title}" is on.`);
      const end = isoDate(ToolError, args.end_date, "end_date");
      const category = oneOf(ToolError, args.category, ITINERARY_CATEGORIES, "category") || "activity";
      const status = oneOf(ToolError, args.status, ITINERARY_STATUSES, "status") || "planned";
      const location = text(ToolError, args.location, "location", 300);
      const notes = text(ToolError, args.notes, "notes", 2000);
      const start = time(ToolError, args.time);
      checkSpan(ToolError, category, day, end);
      noHealth(ToolError, title, location, notes);
      const trip = await pickTrip(client, scope, args.trip);
      tripPrimary(ToolError, scope, trip, "add to the itinerary");
      const { data, error } = await client.from("itinerary_items").select("title, item_date").eq("trip_id", trip.id);
      if (error) throw new Error("itinerary unavailable");
      if ((data || []).some((i) => i.item_date === day && norm(i.title) === norm(title))) {
        return { summary: `${title} is already on ${trip.name} for ${day}.`, trip: tripRef(trip), item: { title, date: day }, changed: false };
      }
      const row = {
        trip_id: trip.id,
        title,
        item_date: day,
        end_date: end || null,
        start_time: start || null,
        category,
        status,
        location: location || null,
        notes: notes || null,
        created_by: scope.userId,
        updated_by: scope.userId,
      };
      const { data: saved, error: saveError } = await client.from("itinerary_items").insert(row).select("id");
      if (saveError || !saved?.length) throw new ToolError(`${title} could not be added. Nothing was saved.`);
      return {
        summary: `Added ${title} to ${trip.name} on ${day}${start ? ` at ${start}` : ""}, ${status.replace(/_/g, " ")}.`,
        trip: tripRef(trip),
        item: itineraryOut(row),
        changed: true,
      };
    },

    async update_itinerary_item(client, scope, args) {
      const want = String(args.item || "").trim();
      if (!want) throw new ToolError("Say which itinerary item to change.");
      const on = isoDate(ToolError, args.on, "on");
      const patch = {};
      const title = text(ToolError, args.title, "title", 200);
      if (title) patch.title = title;
      const day = isoDate(ToolError, args.date, "date");
      if (day) patch.item_date = day;
      const end = isoDate(ToolError, args.end_date, "end_date");
      if (end) patch.end_date = end;
      const start = time(ToolError, args.time);
      if (start) patch.start_time = start;
      const category = oneOf(ToolError, args.category, ITINERARY_CATEGORIES, "category");
      if (category) patch.category = category;
      const status = oneOf(ToolError, args.status, ITINERARY_STATUSES, "status");
      if (status) patch.status = status;
      const location = text(ToolError, args.location, "location", 300);
      if (location) patch.location = location;
      if (!Object.keys(patch).length) throw new ToolError("Say what to change: title, date, end_date, time, category, status or location. Nothing was changed.");
      noHealth(ToolError, title, location);
      const trip = await pickTrip(client, scope, args.trip);
      tripPrimary(ToolError, scope, trip, "change the itinerary");
      const { data, error } = await client
        .from("itinerary_items")
        .select("id, title, item_date, end_date, start_time, category, status, location")
        .eq("trip_id", trip.id);
      if (error) throw new Error("itinerary unavailable");
      const items = (data || [])
        .filter((i) => !on || i.item_date === on || (i.item_date && i.end_date && i.item_date <= on && i.end_date >= on))
        .map((i) => ({ ...i, name: i.title }));
      const label = (i) => `${i.title}${i.item_date ? ` (${i.item_date})` : ""}`;
      const row = pickLine(ToolError, items, {
        want, what: "itinerary item", where: `on ${trip.name}${on ? `, ${on}` : ""}`,
        isDone: () => false, target: true, label,
      });
      const after = { ...row, ...patch };
      if (after.end_date && (patch.end_date || patch.item_date || patch.category)) {
        checkSpan(ToolError, after.category || "activity", after.item_date, after.end_date);
      }
      // Moving a stay's check-in past its check-out would leave a backwards range.
      if (!patch.end_date && patch.item_date && row.end_date && row.end_date <= patch.item_date) {
        throw new ToolError(`That puts check-in after check-out (${row.end_date}). Give a new end_date too. Nothing was changed.`);
      }
      const same = Object.keys(patch).every((k) => String(row[k] ?? "").slice(0, k === "start_time" ? 5 : undefined) === String(patch[k]));
      if (same) return { summary: `${label(row)} already says that.`, trip: tripRef(trip), item: itineraryOut(row), changed: false };
      const { data: saved, error: saveError } = await client
        .from("itinerary_items")
        .update({ ...patch, updated_by: scope.userId, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("trip_id", trip.id)
        .select("id");
      if (saveError || !saved?.length) throw new ToolError(`${label(row)} could not be changed. Nothing was saved.`);
      return {
        summary: `Updated ${label(row)} on ${trip.name}: ${Object.keys(patch).map((k) => k.replace("item_date", "date").replace("start_time", "time")).join(", ")}.`,
        trip: tripRef(trip),
        before: itineraryOut(row),
        item: itineraryOut(after),
        changed: true,
      };
    },

    async create_trip(client, scope, args) {
      const name = text(ToolError, args.name, "name", 120);
      if (!name) throw new ToolError("A new trip needs a name.");
      const destination = text(ToolError, args.destination, "destination", 300);
      const start = isoDate(ToolError, args.start_date, "start_date");
      const end = isoDate(ToolError, args.end_date, "end_date");
      if (start && end && end < start) throw new ToolError("Those dates end before they start. Nothing was created.");
      const status = oneOf(ToolError, args.status, ["draft", "planning", "complete"], "status") || "planning";
      const budget = amount(ToolError, args.budget, "budget", 2000000);
      noHealth(ToolError, name, destination);
      const fam = onlyPrimaryFamily(ToolError, scope, "create a trip");
      const household = people(scope, fam);
      let going = null;
      if (given(args.travelers)) {
        const picked = [];
        for (const said of String(args.travelers).split(/[,;]|\band\b/i).map((x) => x.trim()).filter(Boolean)) {
          const p = onePerson(ToolError, household, said, "created");
          if (!picked.includes(p.name)) picked.push(p.name);
        }
        if (picked.length && picked.length < household.length) going = picked;
      }
      const { data: existing, error } = await client.from("trips").select("name").eq("family_id", fam.familyId);
      if (error) throw new Error("trips unavailable");
      if ((existing || []).some((x) => norm(x.name) === norm(name))) {
        throw new ToolError(`There is already a trip called ${name}. Use update_trip to change it. Nothing was created.`);
      }
      const patch = {
        name,
        status,
        ...(destination ? { destination } : {}),
        ...(start ? { start_date: start } : {}),
        ...(end ? { end_date: end } : {}),
        ...(budget !== undefined ? { budget_target: budget } : {}),
        ...(going ? { travelers: going } : {}),
      };
      const outcome = await writeTrip({ supabase: client, tool: "create_trip", patch, familyId: fam.familyId, userId: scope.userId });
      if (outcome.error || !outcome.id) throw new ToolError(`${name} could not be created. Nothing was saved.`);
      const who = going || household.map((p) => p.name);
      const next_steps = [
        ...(status === "draft" ? [await basicsStep(client, outcome.id)] : []),
        await houseStep(client, scope, fam, { id: outcome.id, status }, who),
        ...(await nextSteps(client, fam, name, status)),
      ].filter(Boolean);
      return {
        summary: `Created ${name}${start ? ` (${start}${end ? ` to ${end}` : ""})` : ""} for ${who.join(", ")}.`,
        trip: tripRef({ id: outcome.id, name, destination, start_date: start, end_date: end, status }),
        travelers: who,
        budget: budget ?? null,
        next_steps,
        changed: true,
      };
    },

    async update_trip(client, scope, args) {
      const patch = {};
      const name = text(ToolError, args.name, "name", 120);
      if (name) patch.name = name;
      const destination = text(ToolError, args.destination, "destination", 300);
      if (destination) patch.destination = destination;
      const start = isoDate(ToolError, args.start_date, "start_date");
      if (start) patch.start_date = start;
      const end = isoDate(ToolError, args.end_date, "end_date");
      if (end) patch.end_date = end;
      const status = oneOf(ToolError, args.status, TRIP_STATUSES, "status");
      if (status) patch.status = status;
      const budget = amount(ToolError, args.budget, "budget", 2000000);
      if (budget !== undefined) patch.budget_target = budget;
      if (!Object.keys(patch).length) throw new ToolError("Say what to change: name, destination, start_date, end_date, status or budget. Nothing was changed.");
      noHealth(ToolError, name, destination);
      const trip = await pickTrip(client, scope, args.trip);
      tripPrimary(ToolError, scope, trip, "change a trip");
      const from = patch.start_date || trip.start_date;
      const to = patch.end_date || trip.end_date;
      if (from && to && to < from) throw new ToolError(`That would end the trip (${to}) before it starts (${from}). Nothing was changed.`);
      if (name && norm(name) !== norm(trip.name)) {
        const { data: others, error } = await client.from("trips").select("id, name").eq("family_id", trip.family_id);
        if (error) throw new Error("trips unavailable");
        if ((others || []).some((x) => x.id !== trip.id && norm(x.name) === norm(name))) {
          throw new ToolError(`There is already a trip called ${name}. Nothing was changed.`);
        }
      }
      const outcome = await writeTrip({ supabase: client, tool: "update_trip", id: trip.id, patch, familyId: trip.family_id, userId: scope.userId });
      if (outcome.error) throw new ToolError(`${trip.name} could not be changed. Nothing was saved.`);
      const after = { ...trip, ...patch };
      const fam = familyOf(scope, trip.family_id);
      const wasDraft = trip.status === "draft";
      const leftDraft = wasDraft && patch.status && patch.status !== "draft";
      const next_steps = [];
      if (after.status === "draft") next_steps.push(await basicsStep(client, trip.id));
      if (leftDraft) {
        const { data: roster } = await client.from("trip_travelers").select("traveler_id").eq("trip_id", trip.id);
        const ids = new Set((roster || []).map((r) => r.traveler_id));
        const going = scope.travelers.filter((t) => t.family_id === trip.family_id && t.is_person && ids.has(t.id)).map((t) => t.name);
        next_steps.push(await houseStep(client, scope, fam, { id: trip.id, status: after.status }, going));
        next_steps.push(...(await nextSteps(client, fam, after.name, after.status)));
      }
      if (after.status !== "draft" && after.status !== "complete" && (patch.start_date || patch.end_date || leftDraft)) {
        next_steps.push(await passportStep(client, scope, fam, after));
      }
      if (patch.budget_target !== undefined) next_steps.push(await budgetStep(client, after));
      const steps = next_steps.filter(Boolean);
      return {
        summary: `Updated ${trip.name}: ${Object.keys(patch).map((k) => (k === "budget_target" ? "budget" : k.replace("_", " "))).join(", ")}.`,
        before: tripRef(trip),
        trip: tripRef(after),
        ...(budget !== undefined ? { budget } : {}),
        ...(steps.length ? { next_steps: steps } : {}),
        changed: true,
      };
    },

    async add_rewards_program(client, scope, args) {
      const brand = text(ToolError, args.brand, "brand", 120);
      if (!brand) throw new ToolError("Say which company the program is with.");
      const kind = oneOf(ToolError, args.kind, REWARD_KIND_KEYS, "kind");
      if (!kind) throw new ToolError(`Say what kind of program ${brand} is: ${REWARD_KIND_KEYS.join(", ")}.`);
      const programName = text(ToolError, args.program_name, "program_name", 120);
      const unit = text(ToolError, args.currency_label, "currency_label", 40);
      const balance = amount(ToolError, args.balance, "balance", 1000000000, { whole: true });
      const tier = text(ToolError, args.status_tier, "status_tier", 60);
      const fee = amount(ToolError, args.annual_fee, "annual_fee", 10000);
      // A long run of digits is a member or card number, which is added in the app.
      if ([brand, programName, tier].some((x) => x && /\d{6,}/.test(x.replace(/[\s-]/g, "")))) {
        throw new ToolError("Member and card numbers are added in Alyeska, not here. Nothing was added.");
      }
      const fam = onlyPrimaryFamily(ToolError, scope, "add to the Wallet");
      const adults = people(scope, fam).filter((p) => !fam.minorIds.has(p.id));
      const want = norm(args.whose);
      const owner = !want || want === "shared" ? null : onePerson(ToolError, adults, args.whose, "added");
      const whose = owner ? owner.name : "Shared";
      const { data, error } = await client
        .from("rewards_programs")
        .select("brand, program_name, traveler_id, is_active, closed_on")
        .eq("family_id", fam.familyId);
      if (error) throw new Error("wallet unavailable");
      const dupe = (data || []).find(
        (p) => p.is_active !== false && !p.closed_on && (p.traveler_id || null) === (owner?.id || null) &&
          norm(p.brand) === norm(brand) && (!programName || !p.program_name || norm(p.program_name) === norm(programName)),
      );
      if (dupe) return { summary: `${whose} already has ${dupe.program_name || dupe.brand} in the Wallet. Use update_rewards_program to change it.`, changed: false };
      const row = {
        family_id: fam.familyId,
        brand,
        kind,
        traveler_id: owner?.id || null,
        ...(programName ? { program_name: programName } : {}),
        ...(unit ? { currency_label: unit } : {}),
        ...(balance !== undefined ? { points_balance: balance, points_checked_on: scope.today } : {}),
        ...(tier ? { status_tier: tier } : {}),
        ...(fee !== undefined ? { annual_fee: fee } : {}),
      };
      const { data: saved, error: saveError } = await client.from("rewards_programs").insert(row).select("id");
      if (saveError || !saved?.length) throw new ToolError(`${brand} could not be added. Nothing was saved.`);
      return {
        summary: `Added ${programName || brand} to the Wallet for ${whose}${balance !== undefined ? `, ${balance.toLocaleString("en-US")} ${unit || "points"}` : ""}.`,
        program: programOut(row, whose),
        changed: true,
      };
    },

    async update_rewards_program(client, scope, args) {
      const want = String(args.program || "").trim();
      if (!want) throw new ToolError("Say which program to update.");
      const balance = amount(ToolError, args.balance, "balance", 1000000000, { whole: true });
      const tier = text(ToolError, args.status_tier, "status_tier", 60);
      const fee = amount(ToolError, args.annual_fee, "annual_fee", 10000);
      if (balance === undefined && !tier && fee === undefined) throw new ToolError("Say what to change: balance, status_tier or annual_fee. Nothing was changed.");
      if (tier && /\d{6,}/.test(tier.replace(/[\s-]/g, ""))) throw new ToolError("Member numbers are added in Alyeska, not here. Nothing was changed.");
      const fam = onlyPrimaryFamily(ToolError, scope, "change the Wallet");
      const { data, error } = await client
        .from("rewards_programs")
        .select("id, brand, program_name, kind, traveler_id, currency_label, points_balance, points_checked_on, status_tier, annual_fee, is_active, closed_on")
        .eq("family_id", fam.familyId);
      if (error) throw new Error("wallet unavailable");
      const nameOf = (id) => (id ? scope.travelers.find((x) => x.id === id)?.name || "someone" : "Shared");
      const who = norm(args.whose);
      const items = (data || [])
        .filter((p) => p.is_active !== false && !p.closed_on)
        .filter((p) => !fam.minorIds.has(p.traveler_id))
        .filter((p) => !who || norm(nameOf(p.traveler_id)).startsWith(who))
        .map((p) => ({ ...p, name: norm(p.brand) === norm(want) || !p.program_name ? p.brand : `${p.brand} ${p.program_name}` }));
      const label = (p) => `${p.program_name || p.brand} (${nameOf(p.traveler_id)})`;
      const row = pickLine(ToolError, items, {
        want, what: "program", where: "in the Wallet",
        isDone: () => false, target: true, label,
      });
      const patch = {
        ...(balance !== undefined ? { points_balance: balance, points_checked_on: scope.today } : {}),
        ...(tier ? { status_tier: tier } : {}),
        ...(fee !== undefined ? { annual_fee: fee } : {}),
      };
      const { data: saved, error: saveError } = await client
        .from("rewards_programs")
        .update(patch)
        .eq("id", row.id)
        .eq("family_id", fam.familyId)
        .select("id");
      if (saveError || !saved?.length) throw new ToolError(`${label(row)} could not be changed. Nothing was saved.`);
      const whose = nameOf(row.traveler_id);
      return {
        summary: `Updated ${label(row)}${balance !== undefined ? `: ${balance.toLocaleString("en-US")} ${row.currency_label || "points"}` : ""}${tier ? `, status ${tier}` : ""}${fee !== undefined ? `, annual fee $${fee}` : ""}.`,
        before: programOut(row, whose),
        program: programOut({ ...row, ...patch }, whose),
        changed: true,
      };
    },

    async add_template_item(client, scope, args) {
      const item = text(ToolError, args.item, "item", 200);
      if (!item) throw new ToolError("Say what to add to the template.");
      const quantity = text(ToolError, args.quantity, "quantity", 40);
      const category = text(ToolError, args.category, "category", 60) || "General";
      if (given(args.last_minute) && !["yes", "no"].includes(args.last_minute)) throw new ToolError('last_minute must be "yes" or "no".');
      noHealth(ToolError, item, quantity, category);
      const fam = onlyPrimaryFamily(ToolError, scope, "change a packing template");
      const { data: lists, error } = await client
        .from("packing_templates")
        .select("id, name, is_base")
        .eq("family_id", fam.familyId);
      if (error) throw new Error("templates unavailable");
      let template;
      if (!given(args.list)) {
        template = (lists || []).find((l) => l.is_base);
        if (!template) throw new ToolError("There is no base packing list yet. Name a template, or start one in Alyeska. Nothing was added.");
      } else {
        template = pickLine(ToolError, (lists || []).map((l) => ({ ...l })), {
          want: String(args.list), what: "packing template", where: `(the templates are ${(lists || []).map((l) => l.name).join(", ") || "none yet"})`,
          isDone: () => false, target: true, label: (l) => l.name,
        });
      }
      const pool = [...people(scope, fam)];
      const want = norm(args.traveler);
      const assignee = !want || want === "shared" || want === "everyone" ? "Shared" : onePerson(ToolError, pool, args.traveler, "added").name;
      const { data: rows, error: readError } = await client
        .from("packing_template_items")
        .select("item, assignee")
        .eq("template_id", template.id);
      if (readError) throw new Error("template unavailable");
      if ((rows || []).some((r) => norm(r.item) === norm(item) && norm(r.assignee) === norm(assignee))) {
        return { summary: `${item} (${assignee}) is already on ${template.name}.`, template: template.name, changed: false };
      }
      const lastMinute = given(args.last_minute) ? args.last_minute === "yes" : looksLastMinute(item);
      const row = {
        template_id: template.id,
        item,
        assignee,
        category,
        last_minute: lastMinute,
        ...(quantity ? { quantity } : {}),
        created_by: scope.userId,
        updated_by: scope.userId,
      };
      const { data: saved, error: saveError } = await client.from("packing_template_items").insert(row).select("id");
      if (saveError || !saved?.length) throw new ToolError(`${item} could not be added. Nothing was saved.`);
      return {
        summary: `Added ${quantity ? `${quantity} ` : ""}${item} (${assignee}) to ${template.name}. Trips built from it from now on will include it; existing trips are unchanged.`,
        template: template.name,
        item: { item, for: assignee, quantity: quantity || null, category, last_minute: lastMinute },
        ...(await withSteps(templatePushStep(client, scope, fam))),
        changed: true,
      };
    },

    async add_day_pack_item(client, scope, args) {
      const want = String(args.item || "").trim();
      if (!want) throw new ToolError("Say which packing-list line to put in the day pack.");
      const day = isoDate(ToolError, args.date, "date") || null;
      const why = text(ToolError, args.why, "why", 300);
      noHealth(ToolError, why);
      const trip = await pickTrip(client, scope, args.trip);
      const fam = tripPrimary(ToolError, scope, trip, "add to a day pack");
      if (day && ((trip.start_date && day < trip.start_date) || (trip.end_date && day > trip.end_date))) {
        throw new ToolError(`${day} is not a day of ${trip.name} (${trip.start_date || "?"} to ${trip.end_date || "?"}). Nothing was added.`);
      }
      const { data, error } = await client
        .from("packing_items")
        .select("id, item, assignee, stashed_at")
        .eq("trip_id", trip.id);
      if (error) throw new Error("packing list unavailable");
      const who = norm(args.traveler);
      const lines = visiblePacking(fam, data)
        .filter((i) => !who || norm(i.assignee).startsWith(who))
        .map((i) => ({ ...i, name: i.item }));
      // The app's own matcher first, so "rain shells" finds "Rain shell"; then
      // the same exact-or-contains pick every other tool uses.
      const loose = matchCaseRow(lines, want, args.traveler || "Shared");
      const label = (i) => `${i.item} (${i.assignee || "Shared"})`;
      const row = loose && (!who || norm(loose.assignee).startsWith(who)) && lines.filter((l) => norm(l.item) === norm(loose.item)).length === 1
        ? loose
        : pickLine(ToolError, lines, {
            want, what: "packing-list line", where: `on ${trip.name}. Add it with add_packing_item first`,
            isDone: () => false, target: true, label,
          });
      const { data: bag, error: bagError } = await client
        .from("day_pack_items")
        .select("item, item_date, assignee")
        .eq("trip_id", trip.id);
      if (bagError) throw new Error("day pack unavailable");
      const when = day ? `for ${day}` : "for every day";
      if ((bag || []).some((b) => norm(b.item) === norm(row.item) && (b.item_date || null) === day)) {
        return { summary: `${row.item} is already in the day pack ${when}.`, trip: tripRef(trip), changed: false };
      }
      const insert = {
        trip_id: trip.id,
        item: row.item,
        item_date: day,
        assignee: row.assignee || "Shared",
        from_packing_id: row.id,
        ...(why ? { why } : {}),
        created_by: scope.userId,
        updated_by: scope.userId,
      };
      const { data: saved, error: saveError } = await client.from("day_pack_items").insert(insert).select("id");
      if (saveError || !saved?.length) throw new ToolError(`${label(row)} could not be added to the day pack. Nothing was saved.`);
      return {
        summary: `Put ${label(row)} in the day pack ${when} on ${trip.name}.`,
        trip: tripRef(trip),
        date: day,
        item: row.item,
        for: row.assignee || "Shared",
        why: why || null,
        changed: true,
      };
    },
  };
}

// Shared with moreTools.js, which holds the rest of the primary-only writes to
// the same rules.
export { norm, clip, given, isoDate, oneOf, amount, text, noHealth, tripPrimary, onlyPrimaryFamily, people, onePerson };
