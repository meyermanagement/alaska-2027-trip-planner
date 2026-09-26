// The rest of the assistant writes: starting a packing list and choosing its
// add-on templates, the budget, editing a packing line or a reminder, a
// favorite moment, fares, home airports, retiring a bucket-list place, a pet's
// arrangement for a trip, and travel preferences.
//
// The same rules as planTools.js:
//
//   - Primary travelers only, in one household. Row-level security does not
//     stop a secondary on every table these touch (flight_deals, home_airports,
//     someday_places, favorite_moments and trip_templates have permissive
//     policies that let any member write), so the refusal here is the wall.
//   - Nothing is deleted. Retiring a place, turning a fare down and taking it
//     onto a trip are statuses. Choosing a trip's templates removes the link
//     rows for any template dropped from the choice (never a template or a
//     packing line); that is the one delete here.
//   - Nothing that reads as health is written; typed notes and a reminder's
//     detail are never written or returned.
//   - A child is not the subject of anything written here except their own
//     packing lines, which are the parent's list.
//   - An ambiguous name changes nothing and lists the candidates.
//
// start_packing_list runs lib/packing/fillFromBase.js and set_pet_trip runs
// lib/pets/packing.js, the same code an approved Ask Aly card runs.

import { readsAsHealth, touchesMinor } from "./householdTools";
import { pickLine } from "./writeTools";
import {
  norm, clip, given, isoDate, oneOf, amount, text, noHealth,
  tripPrimary, onlyPrimaryFamily, people, onePerson,
} from "./planTools";
import { fillPackingFromBase } from "@/lib/packing/fillFromBase";
import { syncPackingForPet } from "@/lib/pets/packing";
import { ARRANGEMENTS, arrangementLabel } from "@/lib/pets/pets";
import { COST_CATEGORIES } from "@/lib/budget/budget";
import { TASK_PRIORITIES, TASK_TIMINGS } from "@/lib/agent/tools";
import { topicPatch } from "@/lib/preferences/topics";
import { airportByCode } from "@/lib/airports/index";
import { driveMinutesFrom } from "@/lib/airports/drive";

const ARRANGEMENT_KEYS = ARRANGEMENTS.map((a) => a.id).filter((id) => id !== "undecided");
const nowIso = () => new Date().toISOString();
const list = (s) => String(s || "").split(/[,;]|\band\b/i).map((x) => x.trim()).filter(Boolean);
const commas = (s) => String(s || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
const yes = (ToolError, v, field) => {
  if (!given(v)) return undefined;
  if (v === "yes") return true;
  if (v === "no") return false;
  throw new ToolError(`${field} must be "yes" or "no".`);
};
const saved = (ToolError, res, what) => {
  if (res.error || !res.data?.length) throw new ToolError(`${what} could not be saved. Nothing was changed.`);
};
async function read(query, what) {
  const { data, error } = await query;
  if (error) throw new Error(`${what} unavailable`);
  return data || [];
}

/** Adults in the household, never a child: the people a preference or a
 * favorite moment can be about. */
const adults = (scope, fam) => people(scope, fam).filter((p) => !fam.minorIds.has(p.id));

/** Who a packing line or reminder can be for: someone going, a child for a
 * parent, or Shared. */
function assigneeFor(ToolError, fam, going, said, verb) {
  const want = norm(said);
  if (want === "shared" || want === "everyone" || want === "everybody") return "Shared";
  const pool = [...going.map((p) => ({ name: p.name })), ...[...fam.minorNames].map((name) => ({ name }))];
  return onePerson(ToolError, [...new Map(pool.map((p) => [p.name, p])).values()], said, verb).name;
}

const costOut = (c) => ({
  label: c.label,
  category: c.category || "other",
  estimate: c.cost_estimate == null ? null : Number(c.cost_estimate),
  actual: c.cost_actual == null ? null : Number(c.cost_actual),
});
const dealName = (d) => `${d.origin || "?"} to ${d.destination || "?"}`;
const dealLabel = (d) => `${dealName(d)}${d.price != null ? ` ${Number(d.price)} ${d.currency || ""}`.trimEnd() : ""}${d.book_by ? `, book by ${d.book_by}` : ""}`;

export function moreTools(ADD, UPDATE, tripArg) {
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
  const yn = (description) => e(["yes", "no"], description);
  return [
    t("start_packing_list", "Start a trip's packing list",
      "Fills an empty packing list for a trip from the household's base list, for the people going and Shared, plus lines for any pet coming. Primary travelers only. Refuses a draft trip and a trip that already has a list. Ask before calling it.",
      { trip: tripArg },
      null, ADD),
    t("set_trip_templates", "Choose a trip's add-on packing templates",
      "Saves which add-on packing templates (such as Beach or Cruise) a trip uses, replacing the earlier choice. Say none for the base list only. Primary travelers only. It does not change the packing list already on the trip.",
      {
        trip: tripArg,
        templates: s("Template names, comma-separated, or none."),
      },
      ["templates"], UPDATE),
    t("add_trip_cost", "Add a cost to a trip's budget",
      "Adds one line to a trip's budget, with an estimate, an actual amount or both. Primary travelers only. Will not add a line with the same name twice.",
      {
        trip: tripArg,
        label: s("What it is, such as Rental car or Glacier tour."),
        category: e(COST_CATEGORIES, "The budget group. Defaults to other."),
        estimate: s("The expected cost in dollars."),
        actual: s("What was actually paid, in dollars."),
        note: s("A short note, such as Paid on the Sapphire card."),
      },
      ["label"], ADD),
    t("update_trip_cost", "Update a cost on a trip's budget",
      "Changes one budget line's name, group, estimate or actual amount. Primary travelers only. If more than one line matches, it changes nothing and lists them.",
      {
        trip: tripArg,
        cost: s("The budget line's name, as get_budget shows it."),
        label: s("A new name."),
        category: e(COST_CATEGORIES, "A new budget group."),
        estimate: s("A new estimate in dollars."),
        actual: s("A new actual amount in dollars."),
      },
      ["cost"], UPDATE),
    t("update_packing_item", "Update a packing-list line",
      "Changes one line on a trip's packing list: its name, quantity, who it is for, category, bag, or whether it is packed last minute. Primary travelers only. Notes are changed in the app. To tick it, use check_off_packing_item.",
      {
        trip: tripArg,
        item: s("The line's name, as get_packing_list shows it."),
        traveler: s("Whose line it is now, by first name, when more than one person has it."),
        name: s("A new name."),
        quantity: s("A new quantity."),
        assignee: s("Who it is for now, by first name, or Shared."),
        category: s("A new category."),
        bag: s("Which bag it goes in."),
        last_minute: yn("yes for something packed on the last morning."),
      },
      ["item"], UPDATE),
    t("update_reminder", "Update a reminder",
      "Changes one reminder on a trip: its title, who it is for, due date, timing or priority. Its detail is changed in the app. Primary travelers only. To mark it done, use complete_reminder.",
      {
        trip: tripArg,
        reminder: s("The reminder's title, as get_reminders shows it."),
        traveler: s("Whose reminder it is now, by first name, when more than one person has it."),
        title: s("A new title."),
        assignee: s("Who it is for now, by first name, or Shared."),
        due_date: date("A new due date, YYYY-MM-DD."),
        timing: e(TASK_TIMINGS, "When before the trip it belongs."),
        priority: e(TASK_PRIORITIES, "A new priority."),
      },
      ["reminder"], UPDATE),
    t("add_favorite_moment", "Add a favorite travel moment",
      "Saves a favorite travel moment, in the person's own words, for one adult in the household. Primary travelers only. Not for children or Shared, and not for anything about health.",
      {
        whose: s("Whose moment it is, by first name."),
        moment: s("The moment, such as A slow dinner on the terrace in Rome."),
      },
      ["whose", "moment"], ADD),
    t("put_fare_on_trip", "Put a fare alert on a trip",
      "Takes one open fare from get_fare_alerts onto a trip, so it shows there. Primary travelers only. It books nothing. If more than one fare matches, it changes nothing and lists them.",
      {
        fare: s("The fare, by destination or as From to Destination."),
        trip: tripArg,
      },
      ["fare", "trip"], UPDATE),
    t("dismiss_fare", "Turn down a fare alert",
      "Turns down one open fare from get_fare_alerts, so it stops showing. Primary travelers only. The fare is kept in History, not deleted.",
      {
        fare: s("The fare, by destination or as From to Destination."),
        reason: s("Why, in a few words, such as Wrong month."),
      },
      ["fare"], UPDATE),
    t("save_home_airport", "Save a home airport",
      "Adds a US or Canadian airport the household flies from, by its three-letter code, or updates its drive time or whether it is the main one. Primary travelers only.",
      {
        code: s("The airport code, such as STL."),
        drive_time: s("How long the drive is, such as 25 min or 1 hr 30 min."),
        primary: yn("yes if it is the airport the household usually uses."),
      },
      ["code"], ADD),
    t("retire_bucket_list_place", "Take a place off the bucket list",
      "Takes one place off the household's bucket list. It is kept as retired, not deleted. Primary travelers only.",
      { place: s("The place, as get_bucket_list shows it.") },
      ["place"], UPDATE),
    t("set_pet_plan", "Say what a pet is doing for a trip",
      "Saves one pet's arrangement for a trip: coming, boarding, a sitter, or staying with family. Coming adds the pet's packing lines; staying behind sets them aside. Primary travelers only. Taking a pet off a trip is done in the app.",
      {
        trip: tripArg,
        pet: s("The pet's name, as get_pets shows it."),
        arrangement: e(ARRANGEMENT_KEYS, "What is happening to the pet."),
        notes: s("A short note, such as Kennel on Big Bend. Nothing about health."),
      },
      ["pet", "arrangement"], UPDATE),
    t("add_preference", "Add a travel preference",
      "Saves one travel preference the person said, for the whole household or named adults, such as Window seats or We would rather walk than taxi. Primary travelers only. Not for children or anything about health, diet or accessibility; those are added in the app.",
      {
        preference: s("The preference, in the person's own words."),
        whose: s("Whose it is, first names comma-separated, or Shared. Defaults to Shared."),
        why: s("Their reason, if they gave one."),
        topics: s("Topics, comma-separated, such as flights, food."),
      },
      ["preference"], ADD),
    t("update_preference", "Update a travel preference",
      "Changes the words, reason, topics or owners of one saved travel preference. Primary travelers only. If more than one matches, it changes nothing and lists them.",
      {
        preference: s("Words from the saved preference, as get_preferences shows it."),
        new_wording: s("The preference's new words."),
        whose: s("Whose it is now, first names comma-separated, or Shared."),
        why: s("A new reason."),
        topics: s("New topics, comma-separated."),
      },
      ["preference"], UPDATE),
  ];
}

export function moreHandlers({ ToolError, pickTrip, tripRef, visiblePacking }) {
  /** Adults going, for assigning a trip line. */
  async function going(client, trip) {
    const links = await read(client.from("trip_travelers").select("traveler_id").eq("trip_id", trip.id), "travelers");
    return new Set(links.map((l) => l.traveler_id));
  }

  /** Owners of a preference, from comma-separated names. [] is Shared. */
  function owners(ToolError, scope, fam, said, verb) {
    if (!given(said) || ["shared", "everyone", "everybody", "the whole family"].includes(norm(said))) return [];
    const pool = adults(scope, fam);
    const out = [];
    for (const name of list(said)) {
      if (fam.minorNames.has(name) || [...fam.minorNames].some((n) => norm(n) === norm(name))) {
        throw new ToolError(`Preferences about a child are added in the app. Nothing was ${verb}.`);
      }
      const p = onePerson(ToolError, pool, name, verb);
      if (!out.includes(p.id)) out.push(p.id);
    }
    return out;
  }
  const nameOf = (scope, id) => scope.travelers.find((x) => x.id === id)?.name || null;
  const ownerPatch = (ids) => ({ traveler_ids: ids, traveler_id: ids.length === 1 ? ids[0] : null });
  const whoseSaid = (scope, ids) => (ids.length ? ids.map((id) => nameOf(scope, id)).join(", ") : "Shared");

  async function openDeals(client, scope, fam) {
    const rows = await read(
      client.from("flight_deals")
        .select("id, family_id, origin, destination, price, currency, book_by, status")
        .eq("family_id", fam.familyId)
        .eq("status", "open"),
      "fares",
    );
    return rows.filter((d) => !d.book_by || d.book_by >= scope.today).map((d) => ({ ...d, name: dealName(d) }));
  }

  return {
    async start_packing_list(client, scope, args) {
      const trip = await pickTrip(client, scope, args.trip);
      const fam = tripPrimary(ToolError, scope, trip, "start a packing list");
      const outcome = await fillPackingFromBase({ supabase: client, tripId: trip.id, familyId: fam.familyId });
      if (outcome.error) {
        // The draft and already-started refusals are the app's own words; a
        // database error is not passed on.
        const words = !outcome.error.code && outcome.error.message ? outcome.error.message : `${trip.name}'s packing list could not be started.`;
        throw new ToolError(`${words} Nothing was added.`);
      }
      if (!outcome.copied) {
        return { summary: `Nothing was added to ${trip.name}: the base packing list is empty or missing. Add items with add_template_item, or start one in the app.`, trip: tripRef(trip), added: 0, changed: false };
      }
      return {
        summary: `Started ${trip.name}'s packing list with ${outcome.copied} line${outcome.copied === 1 ? "" : "s"} from the base list. The app can tailor it to the destination from the Packing page.`,
        trip: tripRef(trip),
        added: outcome.copied,
        changed: true,
      };
    },

    async set_trip_templates(client, scope, args) {
      const said = String(args.templates || "").trim();
      if (!said) throw new ToolError("Say which templates, or none.");
      const trip = await pickTrip(client, scope, args.trip);
      const fam = tripPrimary(ToolError, scope, trip, "choose a trip's templates");
      const lists = (await read(client.from("packing_templates").select("id, name, is_base").eq("family_id", fam.familyId), "templates"))
        .filter((l) => !l.is_base);
      const ids = [];
      if (!["none", "base", "base only", "the base list", "no"].includes(norm(said))) {
        for (const want of commas(said)) {
          const hit = pickLine(ToolError, lists.map((l) => ({ ...l })), {
            want, what: "add-on template", where: `(the add-on templates are ${lists.map((l) => l.name).join(", ") || "none yet"})`,
            isDone: () => false, target: true, label: (l) => l.name,
          });
          if (!ids.includes(hit.id)) ids.push(hit.id);
        }
      }
      const names = ids.map((id) => lists.find((l) => l.id === id).name);
      const before = (await read(client.from("trip_templates").select("template_id").eq("trip_id", trip.id), "templates")).map((r) => r.template_id);
      const current = await read(client.from("trips").select("templates_chosen_at").eq("id", trip.id), "trip");
      const same = before.length === ids.length && ids.every((id) => before.includes(id));
      const said_ = names.length ? names.join(", ") : "the base list only";
      if (same && current[0]?.templates_chosen_at) {
        return { summary: `${trip.name} already uses ${said_}.`, trip: tripRef(trip), templates: names, changed: false };
      }
      // Only the join rows that differ: the ones dropped from the choice go,
      // the new ones are added, the rest are left alone.
      const adding = ids.filter((id) => !before.includes(id));
      const dropping = before.filter((id) => !ids.includes(id));
      if (adding.length) {
        const ins = await client.from("trip_templates").insert(adding.map((template_id) => ({ trip_id: trip.id, template_id }))).select("trip_id");
        saved(ToolError, ins, "The templates");
      }
      if (dropping.length) {
        const del = await client.from("trip_templates").delete().eq("trip_id", trip.id).in("template_id", dropping);
        if (del.error) throw new ToolError(`The templates were only partly changed${adding.length ? "; the new ones were added" : ""}. Try again, or choose them in the app.`);
      }
      const stamp = await client.from("trips").update({ templates_chosen_at: nowIso() }).eq("id", trip.id).eq("family_id", fam.familyId).select("id");
      saved(ToolError, stamp, "The choice");
      return {
        summary: `${trip.name} now uses ${said_}. The packing list already on the trip is unchanged.`,
        trip: tripRef(trip),
        before: before.map((id) => lists.find((l) => l.id === id)?.name).filter(Boolean),
        templates: names,
        changed: true,
      };
    },

    async add_trip_cost(client, scope, args) {
      const label = text(ToolError, args.label, "label", 120);
      if (!label) throw new ToolError("Say what the cost is for.");
      const category = oneOf(ToolError, args.category, COST_CATEGORIES, "category") || "other";
      const estimate = amount(ToolError, args.estimate, "estimate", 1000000);
      const actual = amount(ToolError, args.actual, "actual", 1000000);
      const note = text(ToolError, args.note, "note", 300);
      noHealth(ToolError, label, note);
      const trip = await pickTrip(client, scope, args.trip);
      const fam = tripPrimary(ToolError, scope, trip, "change the budget");
      if (touchesMinor(fam, { texts: [label, note] })) throw new ToolError("Costs that name a child are added in the app. Nothing was added.");
      const rows = await read(client.from("trip_costs").select("label, category, cost_estimate, cost_actual, sort_order").eq("trip_id", trip.id), "budget");
      const dupe = rows.find((r) => norm(r.label) === norm(label));
      if (dupe) return { summary: `${trip.name}'s budget already has ${dupe.label}. Use update_trip_cost to change it.`, trip: tripRef(trip), cost: costOut(dupe), changed: false };
      const row = {
        trip_id: trip.id, label, category,
        ...(estimate !== undefined ? { cost_estimate: estimate } : {}),
        ...(actual !== undefined ? { cost_actual: actual } : {}),
        ...(note ? { cost_note: note } : {}),
        sort_order: Math.max(0, ...rows.map((r) => r.sort_order ?? 0)) + 1,
        created_by: scope.userId, updated_by: scope.userId,
      };
      saved(ToolError, await client.from("trip_costs").insert(row).select("id"), label);
      return {
        summary: `Added ${label} to ${trip.name}'s budget${estimate !== undefined ? `, estimated $${estimate}` : ""}${actual !== undefined ? `, paid $${actual}` : ""}.`,
        trip: tripRef(trip),
        cost: costOut(row),
        changed: true,
      };
    },

    async update_trip_cost(client, scope, args) {
      const want = String(args.cost || "").trim();
      if (!want) throw new ToolError("Say which budget line to change.");
      const label = text(ToolError, args.label, "label", 120);
      const category = oneOf(ToolError, args.category, COST_CATEGORIES, "category");
      const estimate = amount(ToolError, args.estimate, "estimate", 1000000);
      const actual = amount(ToolError, args.actual, "actual", 1000000);
      noHealth(ToolError, label);
      const trip = await pickTrip(client, scope, args.trip);
      const fam = tripPrimary(ToolError, scope, trip, "change the budget");
      const rows = (await read(client.from("trip_costs").select("id, label, category, cost_estimate, cost_actual").eq("trip_id", trip.id), "budget"))
        .map((r) => ({ ...r, name: r.label }));
      const row = pickLine(ToolError, rows, { want, what: "budget line", where: `on ${trip.name}`, isDone: () => false, target: true, label: (r) => r.label });
      if (label && touchesMinor(fam, { texts: [label] })) throw new ToolError("Costs that name a child are changed in the app. Nothing was changed.");
      const patch = {
        ...(label && label !== row.label ? { label } : {}),
        ...(category && category !== row.category ? { category } : {}),
        ...(estimate !== undefined && estimate !== Number(row.cost_estimate ?? NaN) ? { cost_estimate: estimate } : {}),
        ...(actual !== undefined && actual !== Number(row.cost_actual ?? NaN) ? { cost_actual: actual } : {}),
      };
      if (!given(label) && !category && estimate === undefined && actual === undefined) throw new ToolError("Say what to change: label, category, estimate or actual.");
      if (!Object.keys(patch).length) return { summary: `${row.label} already says that.`, trip: tripRef(trip), cost: costOut(row), changed: false };
      saved(ToolError, await client.from("trip_costs").update({ ...patch, updated_by: scope.userId, updated_at: nowIso() }).eq("id", row.id).eq("trip_id", trip.id).select("id"), row.label);
      return { summary: `Updated ${row.label} on ${trip.name}'s budget.`, trip: tripRef(trip), before: costOut(row), cost: costOut({ ...row, ...patch }), changed: true };
    },

    async update_packing_item(client, scope, args) {
      const want = String(args.item || "").trim();
      if (!want) throw new ToolError("Say which packing-list line to change.");
      const name = text(ToolError, args.name, "name", 200);
      const quantity = text(ToolError, args.quantity, "quantity", 40);
      const category = text(ToolError, args.category, "category", 60);
      const bag = text(ToolError, args.bag, "bag", 60);
      const lastMinute = yes(ToolError, args.last_minute, "last_minute");
      noHealth(ToolError, name, quantity, category, bag);
      const trip = await pickTrip(client, scope, args.trip);
      const fam = tripPrimary(ToolError, scope, trip, "change the packing list");
      const data = await read(client.from("packing_items").select("id, item, assignee, quantity, category, bag, last_minute, stashed_at").eq("trip_id", trip.id), "packing list");
      const who = norm(args.traveler);
      const lines = visiblePacking(fam, data).filter((i) => !who || norm(i.assignee).startsWith(who)).map((i) => ({ ...i, name: i.item }));
      const label = (i) => `${i.item} (${i.assignee || "Shared"})`;
      const row = pickLine(ToolError, lines, { want, what: "packing-list line", where: `on ${trip.name}`, isDone: () => false, target: true, label });
      let assignee;
      if (given(args.assignee)) {
        const ids = await going(client, trip);
        assignee = assigneeFor(ToolError, fam, people(scope, fam).filter((p) => ids.has(p.id)), args.assignee, "changed");
      }
      const patch = {
        ...(name && name !== row.item ? { item: name } : {}),
        ...(quantity && quantity !== row.quantity ? { quantity } : {}),
        ...(category && category !== row.category ? { category } : {}),
        ...(bag && bag !== row.bag ? { bag } : {}),
        ...(assignee && assignee !== (row.assignee || "Shared") ? { assignee } : {}),
        ...(lastMinute !== undefined && lastMinute !== !!row.last_minute ? { last_minute: lastMinute } : {}),
      };
      if (!name && !quantity && !category && !bag && !assignee && lastMinute === undefined) throw new ToolError("Say what to change: name, quantity, assignee, category, bag or last_minute.");
      if (!Object.keys(patch).length) return { summary: `${label(row)} already says that.`, trip: tripRef(trip), changed: false };
      saved(ToolError, await client.from("packing_items").update({ ...patch, updated_by: scope.userId, updated_at: nowIso() }).eq("id", row.id).eq("trip_id", trip.id).select("id"), label(row));
      const after = { ...row, ...patch };
      return {
        summary: `Updated ${label(row)} on ${trip.name}${patch.item || patch.assignee ? `; it is now ${label(after)}` : ""}.`,
        trip: tripRef(trip),
        item: { item: after.item, for: after.assignee || "Shared", quantity: after.quantity || null, category: after.category || null, bag: after.bag || null, last_minute: !!after.last_minute },
        changed: true,
      };
    },

    async update_reminder(client, scope, args) {
      const want = String(args.reminder || "").trim();
      if (!want) throw new ToolError("Say which reminder to change.");
      const title = text(ToolError, args.title, "title", 200);
      const due = isoDate(ToolError, args.due_date, "due_date");
      const timing = oneOf(ToolError, args.timing, TASK_TIMINGS, "timing");
      const priority = oneOf(ToolError, args.priority, TASK_PRIORITIES, "priority");
      noHealth(ToolError, title);
      const trip = await pickTrip(client, scope, args.trip);
      const fam = tripPrimary(ToolError, scope, trip, "change a reminder");
      if (title && touchesMinor(fam, { texts: [title] })) throw new ToolError("Reminders that name a child are changed in the app. Nothing was changed.");
      const data = await read(client.from("predeparture_tasks").select("id, title, detail, assignee, due_date, timing, priority, is_done").eq("trip_id", trip.id), "reminders");
      const who = norm(args.traveler);
      // The same set get_reminders shows this reader.
      const items = data
        .filter((r) => !touchesMinor(fam, { assignee: r.assignee, texts: [r.title, r.detail] }))
        .filter((r) => !readsAsHealth(r.title, r.detail))
        .filter((r) => !who || norm(r.assignee).startsWith(who))
        .map((r) => ({ ...r, name: r.title }));
      const label = (r) => `${r.title}${r.assignee ? ` (${r.assignee})` : ""}`;
      const row = pickLine(ToolError, items, { want, what: "reminder", where: `on ${trip.name}`, isDone: (r) => !!r.is_done, target: false, label });
      let assignee;
      if (given(args.assignee)) {
        const ids = await going(client, trip);
        // A reminder about a child is hidden from the assistant, so it is not
        // made one here either.
        const pool = people(scope, fam).filter((p) => ids.has(p.id) && !fam.minorIds.has(p.id));
        assignee = norm(args.assignee) === "shared" ? "Shared" : onePerson(ToolError, pool, args.assignee, "changed").name;
      }
      const patch = {
        ...(title && title !== row.title ? { title } : {}),
        ...(assignee && assignee !== (row.assignee || "Shared") ? { assignee } : {}),
        ...(due && due !== row.due_date ? { due_date: due } : {}),
        ...(timing && timing !== row.timing ? { timing } : {}),
        ...(priority && priority !== row.priority ? { priority } : {}),
      };
      if (!title && !assignee && !due && !timing && !priority) throw new ToolError("Say what to change: title, assignee, due_date, timing or priority.");
      if (!Object.keys(patch).length) return { summary: `${label(row)} already says that.`, trip: tripRef(trip), changed: false };
      saved(ToolError, await client.from("predeparture_tasks").update({ ...patch, updated_by: scope.userId, updated_at: nowIso() }).eq("id", row.id).eq("trip_id", trip.id).select("id"), label(row));
      const after = { ...row, ...patch };
      return {
        summary: `Updated ${label(row)} on ${trip.name}.`,
        trip: tripRef(trip),
        reminder: { title: after.title, for: after.assignee || "Shared", due_date: after.due_date || null, timing: after.timing || null, priority: after.priority || null, done: !!after.is_done },
        changed: true,
      };
    },

    async add_favorite_moment(client, scope, args) {
      const body = text(ToolError, args.moment, "moment", 1200);
      if (!body) throw new ToolError("Say the moment, in the person's own words.");
      noHealth(ToolError, body);
      const fam = onlyPrimaryFamily(ToolError, scope, "add a favorite moment");
      if (["shared", "everyone", "everybody"].includes(norm(args.whose))) throw new ToolError("A favorite moment belongs to one person. Say whose. Nothing was added.");
      if ([...fam.minorNames].some((n) => norm(n) === norm(args.whose))) throw new ToolError("Favorite moments for a child are added in the app. Nothing was added.");
      if (touchesMinor(fam, { texts: [body] })) throw new ToolError("Moments that name a child are added in the app. Nothing was added.");
      const who = onePerson(ToolError, adults(scope, fam), args.whose, "added");
      const rows = await read(client.from("favorite_moments").select("traveler_id, body, sort_order").eq("family_id", fam.familyId), "trip log");
      if (rows.some((r) => r.traveler_id === who.id && norm(r.body) === norm(body))) {
        return { summary: `${who.name} already has that moment.`, whose: who.name, changed: false };
      }
      saved(ToolError, await client.from("favorite_moments").insert({
        family_id: fam.familyId, traveler_id: who.id, body,
        sort_order: Math.max(0, ...rows.filter((r) => r.traveler_id === who.id).map((r) => r.sort_order ?? 0)) + 1,
        created_by: scope.userId,
      }).select("id"), "The moment");
      return { summary: `Saved a favorite moment for ${who.name}: ${clip(body, 80)}`, whose: who.name, moment: body, changed: true };
    },

    async put_fare_on_trip(client, scope, args) {
      const want = String(args.fare || "").trim();
      if (!want) throw new ToolError("Say which fare.");
      const trip = await pickTrip(client, scope, args.trip);
      const fam = tripPrimary(ToolError, scope, trip, "put a fare on a trip");
      const deals = await openDeals(client, scope, fam);
      const deal = pickLine(ToolError, deals, { want, what: "open fare", where: "in the fare alerts", isDone: () => false, target: true, label: dealLabel });
      saved(ToolError, await client.from("flight_deals")
        .update({ status: "taken", trip_id: trip.id, updated_by: scope.userId, updated_at: nowIso() })
        .eq("id", deal.id).eq("family_id", fam.familyId).select("id"), dealLabel(deal));
      return { summary: `Put the ${dealLabel(deal)} fare on ${trip.name}. Nothing was booked.`, trip: tripRef(trip), fare: dealLabel(deal), changed: true };
    },

    async dismiss_fare(client, scope, args) {
      const want = String(args.fare || "").trim();
      if (!want) throw new ToolError("Say which fare.");
      const reason = text(ToolError, args.reason, "reason", 300);
      noHealth(ToolError, reason);
      const fam = onlyPrimaryFamily(ToolError, scope, "turn down a fare");
      const deals = await openDeals(client, scope, fam);
      const deal = pickLine(ToolError, deals, { want, what: "open fare", where: "in the fare alerts", isDone: () => false, target: true, label: dealLabel });
      saved(ToolError, await client.from("flight_deals")
        .update({ status: "dismissed", dismissed_reason: reason || null, updated_by: scope.userId, updated_at: nowIso() })
        .eq("id", deal.id).eq("family_id", fam.familyId).select("id"), dealLabel(deal));
      return { summary: `Turned down the ${dealLabel(deal)} fare${reason ? ` (${reason})` : ""}. It is kept in History.`, fare: dealLabel(deal), changed: true };
    },

    async save_home_airport(client, scope, args) {
      const code = String(args.code || "").trim().toUpperCase();
      const airport = airportByCode(code);
      if (!airport) throw new ToolError(`${code || "That"} is not a US or Canadian airport code I know. Nothing was saved.`);
      let drive;
      if (given(args.drive_time)) {
        drive = driveMinutesFrom(String(args.drive_time));
        if (drive == null || drive > 1440) throw new ToolError("drive_time should read like 25 min or 1 hr 30 min, under a day. Nothing was saved.");
      }
      const primary = yes(ToolError, args.primary, "primary");
      const fam = onlyPrimaryFamily(ToolError, scope, "change the home airports");
      const rows = await read(client.from("home_airports").select("id, code, drive_minutes, is_primary").eq("family_id", fam.familyId), "airports");
      const existing = rows.find((r) => r.code === code);
      const now = nowIso();
      if (existing) {
        const patch = {
          ...(drive !== undefined && drive !== existing.drive_minutes ? { drive_minutes: drive } : {}),
          ...(primary !== undefined && primary !== !!existing.is_primary ? { is_primary: primary } : {}),
        };
        if (!Object.keys(patch).length) return { summary: `${code} is already saved${existing.is_primary ? " as the main airport" : ""}.`, airport: code, changed: false };
        if (patch.is_primary) await client.from("home_airports").update({ is_primary: false, updated_at: now, updated_by: scope.userId }).eq("family_id", fam.familyId).eq("is_primary", true).neq("id", existing.id);
        saved(ToolError, await client.from("home_airports").update({ ...patch, updated_at: now, updated_by: scope.userId }).eq("id", existing.id).eq("family_id", fam.familyId).select("id"), code);
        return { summary: `Updated ${code}${patch.drive_minutes !== undefined ? `, ${drive} minutes' drive` : ""}${patch.is_primary ? ", now the main airport" : patch.is_primary === false ? ", no longer the main airport" : ""}.`, airport: code, changed: true };
      }
      if (primary) await client.from("home_airports").update({ is_primary: false, updated_at: now, updated_by: scope.userId }).eq("family_id", fam.familyId).eq("is_primary", true);
      saved(ToolError, await client.from("home_airports").insert({
        family_id: fam.familyId, code, name: airport.name, city: airport.city || null, region: airport.region || null,
        lat: airport.lat ?? null, lon: airport.lon ?? null,
        ...(drive !== undefined ? { drive_minutes: drive } : {}),
        is_primary: primary ?? !rows.length,
        created_by: scope.userId, updated_by: scope.userId,
      }).select("id"), code);
      return { summary: `Saved ${code}, ${airport.name}, as a home airport${drive !== undefined ? `, ${drive} minutes' drive` : ""}${primary ?? !rows.length ? ", the main one" : ""}.`, airport: code, changed: true };
    },

    async retire_bucket_list_place(client, scope, args) {
      const want = String(args.place || "").trim();
      if (!want) throw new ToolError("Say which place.");
      const fam = onlyPrimaryFamily(ToolError, scope, "change the bucket list");
      const rows = await read(client.from("someday_places").select("id, place, status").eq("family_id", fam.familyId), "bucket list");
      const open = rows.filter((r) => r.status !== "retired").map((r) => ({ ...r, name: r.place }));
      if (!open.some((r) => norm(r.place).includes(norm(want))) && rows.some((r) => norm(r.place) === norm(want))) {
        return { summary: `${want} is already off the bucket list.`, changed: false };
      }
      const row = pickLine(ToolError, open, { want, what: "place", where: "on the bucket list", isDone: () => false, target: true, label: (r) => r.place });
      saved(ToolError, await client.from("someday_places").update({ status: "retired", updated_by: scope.userId, updated_at: nowIso() }).eq("id", row.id).eq("family_id", fam.familyId).select("id"), row.place);
      return { summary: `Took ${row.place} off the bucket list. It is kept as retired.`, place: row.place, changed: true };
    },

    async set_pet_plan(client, scope, args) {
      const wanted = String(args.pet || "").trim();
      if (!wanted) throw new ToolError("Say which pet.");
      const arrangement = oneOf(ToolError, args.arrangement, ARRANGEMENT_KEYS, "arrangement");
      if (!arrangement) throw new ToolError(`arrangement must be one of ${ARRANGEMENT_KEYS.join(", ")}. Taking a pet off a trip is done in the app.`);
      const notes = text(ToolError, args.notes, "notes", 400);
      noHealth(ToolError, notes);
      const trip = await pickTrip(client, scope, args.trip);
      const fam = tripPrimary(ToolError, scope, trip, "plan for a pet");
      const pets = (await read(client.from("pets").select("id, family_id, name, species, travel_style, medications").eq("family_id", fam.familyId), "pets"))
        .map((p) => ({ ...p }));
      if (!pets.length) throw new ToolError("There are no pets saved in this household. Nothing was changed.");
      const pet = onePerson(ToolError, pets, wanted, "changed");
      const plans = await read(client.from("trip_pets").select("pet_id, arrangement, arrangement_notes").eq("trip_id", trip.id), "pets");
      const before = plans.find((p) => p.pet_id === pet.id);
      const said = arrangementLabel(arrangement, pet.species).toLowerCase();
      if (before && before.arrangement === arrangement && (!notes || notes === before.arrangement_notes)) {
        return { summary: `${pet.name} is already down as ${said} for ${trip.name}.`, trip: tripRef(trip), changed: false };
      }
      const up = await client.from("trip_pets")
        .upsert({ trip_id: trip.id, pet_id: pet.id, arrangement, ...(notes ? { arrangement_notes: notes } : {}) }, { onConflict: "trip_id,pet_id" })
        .select("pet_id");
      saved(ToolError, up, `${pet.name}'s plan`);
      const outcome = await syncPackingForPet({ supabase: client, tripId: trip.id, familyId: fam.familyId, pet, arrangement });
      return {
        summary: `${pet.name} on ${trip.name}: ${said}.${outcome?.message ? ` ${outcome.message.charAt(0).toUpperCase()}${outcome.message.slice(1)}.` : ""}`,
        trip: tripRef(trip),
        pet: pet.name,
        before: before ? arrangementLabel(before.arrangement, pet.species) : null,
        arrangement: arrangementLabel(arrangement, pet.species),
        changed: true,
      };
    },

    async add_preference(client, scope, args) {
      const body = text(ToolError, args.preference, "preference", 1000);
      if (!body) throw new ToolError("Say the preference.");
      const reason = text(ToolError, args.why, "why", 600);
      noHealth(ToolError, body, reason, args.topics);
      const fam = onlyPrimaryFamily(ToolError, scope, "add a travel preference");
      if (touchesMinor(fam, { texts: [body, reason] })) throw new ToolError("Preferences about a child are added in the app. Nothing was added.");
      const ids = owners(ToolError, scope, fam, args.whose, "added");
      const rows = await read(client.from("travel_preferences").select("body, sort_order").eq("family_id", fam.familyId), "preferences");
      if (rows.some((r) => norm(r.body) === norm(body))) return { summary: `That preference is already saved: ${clip(body, 90)}`, changed: false };
      const topics = topicPatch(commas(args.topics).map((x) => clip(x, 60)));
      saved(ToolError, await client.from("travel_preferences").insert({
        family_id: fam.familyId, body, source: "said",
        ...(reason ? { reason } : {}),
        ...ownerPatch(ids),
        ...topics,
        sort_order: Math.max(0, ...rows.map((r) => r.sort_order ?? 0)) + 1,
      }).select("id"), "The preference");
      return {
        summary: `Saved a travel preference for ${whoseSaid(scope, ids)}: ${clip(body, 90)}`,
        preference: { preference: body, why: reason || null, topics: topics.topics, whose: ids.length ? ids.map((id) => nameOf(scope, id)) : ["Shared"] },
        changed: true,
      };
    },

    async update_preference(client, scope, args) {
      const want = String(args.preference || "").trim();
      if (!want) throw new ToolError("Say which preference to change.");
      const body = text(ToolError, args.new_wording, "new_wording", 1000);
      const reason = text(ToolError, args.why, "why", 600);
      noHealth(ToolError, body, reason, args.topics);
      const fam = onlyPrimaryFamily(ToolError, scope, "change a travel preference");
      if (touchesMinor(fam, { texts: [body, reason] })) throw new ToolError("Preferences about a child are changed in the app. Nothing was changed.");
      const rows = await read(client.from("travel_preferences").select("id, traveler_id, traveler_ids, topic, topics, body, reason").eq("family_id", fam.familyId), "preferences");
      const ownersOf = (p) => (Array.isArray(p.traveler_ids) && p.traveler_ids.length ? p.traveler_ids : p.traveler_id ? [p.traveler_id] : []);
      // The same set get_preferences shows.
      const visible = rows
        .filter((p) => !touchesMinor(fam, { ids: ownersOf(p), texts: [p.body, p.reason] }))
        .filter((p) => !readsAsHealth(p.body, p.reason))
        .map((p) => ({ ...p, name: p.body }));
      const row = pickLine(ToolError, visible, { want, what: "preference", where: "saved", isDone: () => false, target: true, label: (p) => clip(p.body, 60) });
      const patch = {
        ...(body && body !== row.body ? { body } : {}),
        ...(reason && reason !== row.reason ? { reason } : {}),
      };
      if (given(args.whose)) {
        const ids = owners(ToolError, scope, fam, args.whose, "changed");
        const was = ownersOf(row);
        if (ids.length !== was.length || ids.some((id) => !was.includes(id))) Object.assign(patch, ownerPatch(ids));
      }
      if (given(args.topics)) {
        const t = topicPatch(commas(args.topics).map((x) => clip(x, 60)));
        const was = Array.isArray(row.topics) ? row.topics : [];
        if (t.topics.length !== was.length || t.topics.some((x, i) => x !== was[i])) Object.assign(patch, t);
      }
      if (!body && !reason && !given(args.whose) && !given(args.topics)) throw new ToolError("Say what to change: new_wording, why, whose or topics.");
      if (!Object.keys(patch).length) return { summary: "That preference already says that.", changed: false };
      saved(ToolError, await client.from("travel_preferences").update({ ...patch, updated_at: nowIso() }).eq("id", row.id).eq("family_id", fam.familyId).select("id"), "The preference");
      const after = { ...row, ...patch };
      return {
        summary: `Updated the preference: ${clip(after.body, 90)}`,
        before: clip(row.body, 200),
        preference: { preference: after.body, why: after.reason || null, topics: Array.isArray(after.topics) ? after.topics : [], whose: ownersOf(after).length ? ownersOf(after).map((id) => nameOf(scope, id)) : ["Shared"] },
        changed: true,
      };
    },
  };
}
