// The assistant tools that change something, beyond check_off_packing_item.
//
// What they may do: tick a day pack line or a reminder, and add a packing
// item, a reminder or a bucket-list place. Nothing here edits a line's words,
// deletes anything, touches the itinerary or money, or changes a preference:
// those go through Ask Aly's review cards, where a planning question and an
// instruction to change the trip stay apart.
//
// Every write runs through the signed-in person's own client, so row-level
// security and the secondary guard triggers decide what it may touch -- the
// same rules the app's own checkboxes and forms run under. On top of that:
//
//   - A tick only reaches a line the matching read tool would show this reader.
//   - Adding is for primary travelers. A secondary checks things off; they do
//     not add to the household's lists (RLS refuses it too).
//   - Nothing is added that reads as health: the assistant does not handle
//     health details, and it could not read the line back afterwards.
//   - A line already on the list is not added twice.
//   - An ambiguous name changes nothing and lists the candidates.

import { familyOf } from "./scope";
import { readsAsHealth, touchesMinor } from "./householdTools";
import { looksLastMinute } from "@/lib/packing/lastMinute";
import { parseMonths } from "@/lib/someday/months";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const norm = (s) => String(s || "").trim().toLowerCase();
const clip = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, n) : null;
};

function yesNo(ToolError, value, field) {
  if (value == null || value === "") return true;
  if (value === "yes") return true;
  if (value === "no") return false;
  throw new ToolError(`${field} must be "yes" or "no".`);
}

/**
 * One line out of a visible set, by name. Exact match first, then contains.
 * Several matches with exactly one not yet in the wanted state picks that one;
 * otherwise nothing changes and the candidates are listed.
 */
export function pickLine(ToolError, items, { want, what, where, isDone, target, label }) {
  let match = items.filter((i) => norm(i.name) === norm(want));
  if (!match.length) match = items.filter((i) => norm(i.name).includes(norm(want)));
  if (!match.length) throw new ToolError(`No ${what} matching "${want}" ${where}. Nothing was changed.`);
  if (match.length > 1) {
    const pending = match.filter((i) => isDone(i) !== target);
    if (pending.length === 1) return pending[0];
    throw new ToolError(
      `More than one ${what} matches "${want}" ${where}: ${match.slice(0, 6).map(label).join("; ")}. Nothing was changed; say which one, or whose.`,
    );
  }
  return match[0];
}

function mustBePrimary(ToolError, fam, what) {
  if (!fam || fam.secondary) throw new ToolError(`Only the household's primary travelers can add ${what}. Nothing was added.`);
}

/** Who a new line can be for: an adult going on the trip, a child (for a
 * parent), or Shared. Returns the stored name. */
function resolveAssignee(ToolError, fam, adults, said) {
  const want = norm(said);
  if (!want || want === "shared" || want === "everyone" || want === "everybody") return "Shared";
  const names = [...adults.map((p) => p.name), ...fam.minorNames];
  const exact = names.filter((n) => norm(n) === want);
  const hits = exact.length ? exact : names.filter((n) => norm(n).startsWith(want));
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new ToolError(`"${said}" is not going on this trip. Say one of: ${[...names, "Shared"].join(", ")}. Nothing was added.`);
  throw new ToolError(`"${said}" could be ${hits.join(" or ")}. Nothing was added.`);
}

export function writeTools(CHECK_OFF, ADD, tripArg) {
  const t = (name, title, description, properties, required, annotations) => ({
    name,
    title,
    description,
    inputSchema: { type: "object", properties, ...(required ? { required } : {}), additionalProperties: false },
    annotations: { title, ...annotations },
  });
  const date = (description) => ({ type: "string", description, pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
  return [
    t("check_off_day_pack_item", "Check off a day pack item",
      "Marks one line in a day's day pack as packed, or unpacked. Matches by name; if more than one line matches, it changes nothing and lists them.",
      {
        trip: tripArg,
        item: { type: "string", description: "The line's name as it appears in the day pack." },
        date: date("The day, YYYY-MM-DD. Defaults to today."),
        traveler: { type: "string", description: "Whose line it is, by first name, when more than one person has it." },
        packed: { type: "string", enum: ["yes", "no"], description: "yes to check it off (the default), no to uncheck it." },
      },
      ["item"], CHECK_OFF),
    t("complete_reminder", "Complete a reminder",
      "Marks one of a trip's reminders as done, or not done. Matches by name; if more than one matches, it changes nothing and lists them.",
      {
        trip: tripArg,
        reminder: { type: "string", description: "The reminder's name as it appears on the list." },
        traveler: { type: "string", description: "Whose reminder it is, by first name, when more than one person has it." },
        done: { type: "string", enum: ["yes", "no"], description: "yes to mark it done (the default), no to reopen it." },
      },
      ["reminder"], CHECK_OFF),
    t("add_packing_item", "Add a packing item",
      "Adds one item to a trip's packing list, for one traveler or Shared. Primary travelers only. Will not add an item already on that person's list, or anything about health.",
      {
        trip: tripArg,
        item: { type: "string", description: "What to pack, such as Rain jacket." },
        traveler: { type: "string", description: "Whose it is, by first name, or Shared. Defaults to Shared." },
        quantity: { type: "string", description: "How many, if more than one." },
        category: { type: "string", description: "The list's category, such as Clothes or Gear." },
      },
      ["item"], ADD),
    t("add_reminder", "Add a reminder",
      "Adds one to-do reminder to a trip, optionally with a due date and who it is for. Primary travelers only. Will not add a reminder already open on that trip, or anything about health.",
      {
        trip: tripArg,
        reminder: { type: "string", description: "What needs doing, such as Print boarding passes." },
        detail: { type: "string", description: "A short note about it." },
        due: date("When it is due, YYYY-MM-DD."),
        traveler: { type: "string", description: "Who it is for, by first name, or Shared. Defaults to Shared." },
        priority: { type: "string", enum: ["high", "normal", "low"], description: "Defaults to normal." },
      },
      ["reminder"], ADD),
    t("add_bucket_list_place", "Add a bucket-list place",
      "Adds a place the household wants to go someday, with why and the best months. Primary travelers only. Will not add a place already on the list.",
      {
        place: { type: "string", description: "The place, such as Iceland or Kyoto." },
        why: { type: "string", description: "What would make it worth doing." },
        months: { type: "string", description: "Best months, comma-separated, such as Feb, Mar." },
        nights: { type: "string", description: "How many nights it would take, 1 to 365." },
      },
      ["place"], ADD),
  ];
}

export function writeHandlers({ ToolError, pickTrip, tripRef, tripTravelers }) {
  return {
    async check_off_day_pack_item(client, scope, args) {
      const want = String(args.item || "").trim();
      if (!want) throw new ToolError("Say which day pack line to check off.");
      const packed = yesNo(ToolError, args.packed, "packed");
      const day = args.date || scope.today;
      if (!ISO.test(day)) throw new ToolError("date must be YYYY-MM-DD.");
      const trip = await pickTrip(client, scope, args.trip);
      const fam = familyOf(scope, trip.family_id);
      const { data, error } = await client
        .from("day_pack_items")
        .select("id, item, why, assignee, is_packed, item_date")
        .eq("trip_id", trip.id)
        .eq("item_date", day);
      if (error) throw new Error("day pack unavailable");
      const who = norm(args.traveler);
      // The same set get_day_pack shows this reader.
      const items = (data || [])
        .filter((i) => !fam.secondary || !touchesMinor(fam, { assignee: i.assignee, texts: [i.item, i.why] }))
        .filter((i) => !readsAsHealth(i.item, i.why))
        .filter((i) => !fam.secondary || !i.assignee || i.assignee === "Shared" || i.assignee === fam.travelerName)
        .filter((i) => !who || norm(i.assignee).startsWith(who))
        .map((i) => ({ ...i, name: i.item }));
      const label = (i) => `${i.item}${i.assignee ? ` (${i.assignee})` : ""}`;
      const row = pickLine(ToolError, items, {
        want, what: "day pack line", where: `on ${trip.name}, ${day}`,
        isDone: (i) => !!i.is_packed, target: packed, label,
      });
      const base = { trip: tripRef(trip), date: day, item: row.item, for: row.assignee || null, packed };
      if (!!row.is_packed === packed) return { summary: `${label(row)} was already ${packed ? "checked off" : "unchecked"} for ${day}.`, ...base, changed: false };
      const now = new Date().toISOString();
      const { data: saved, error: saveError } = await client
        .from("day_pack_items")
        .update({ is_packed: packed, packed_by: packed ? scope.userId : null, packed_at: packed ? now : null, updated_by: scope.userId, updated_at: now })
        .eq("id", row.id)
        .eq("trip_id", trip.id)
        .select("id");
      if (saveError || !saved?.length) throw new ToolError(`${label(row)} could not be changed. Nothing was saved.`);
      return { summary: `${packed ? "Checked off" : "Unchecked"} ${label(row)} in the day pack for ${day}.`, ...base, changed: true };
    },

    async complete_reminder(client, scope, args) {
      const want = String(args.reminder || "").trim();
      if (!want) throw new ToolError("Say which reminder to mark done.");
      const done = yesNo(ToolError, args.done, "done");
      const trip = await pickTrip(client, scope, args.trip);
      const fam = familyOf(scope, trip.family_id);
      const { data, error } = await client
        .from("predeparture_tasks")
        .select("id, title, detail, assignee, is_done")
        .eq("trip_id", trip.id);
      if (error) throw new Error("reminders unavailable");
      const who = norm(args.traveler);
      // The same set get_reminders shows, narrowed for a secondary to the rows
      // the database lets them tick: their own, not Shared.
      const items = (data || [])
        .filter((r) => !touchesMinor(fam, { assignee: r.assignee, texts: [r.title, r.detail] }))
        .filter((r) => !readsAsHealth(r.title, r.detail))
        .filter((r) => !fam.secondary || r.assignee === fam.travelerName)
        .filter((r) => !who || norm(r.assignee).startsWith(who))
        .map((r) => ({ ...r, name: r.title }));
      const label = (r) => `${r.title}${r.assignee ? ` (${r.assignee})` : ""}`;
      const row = pickLine(ToolError, items, {
        want, what: "reminder", where: `on ${trip.name}`,
        isDone: (r) => !!r.is_done, target: done, label,
      });
      const base = { trip: tripRef(trip), reminder: row.title, for: row.assignee || null, done };
      if (!!row.is_done === done) return { summary: `${label(row)} was already ${done ? "done" : "open"}.`, ...base, changed: false };
      const { data: saved, error: saveError } = await client
        .from("predeparture_tasks")
        .update({ is_done: done, done_by: done ? scope.userId : null, done_at: done ? new Date().toISOString() : null })
        .eq("id", row.id)
        .select("id");
      if (saveError || !saved?.length) throw new ToolError(`${label(row)} could not be changed. Nothing was saved.`);
      return { summary: `${done ? "Marked done" : "Reopened"}: ${label(row)} on ${trip.name}.`, ...base, changed: true };
    },

    async add_packing_item(client, scope, args) {
      const item = clip(args.item, 200);
      if (!item) throw new ToolError("Say what to pack.");
      const trip = await pickTrip(client, scope, args.trip);
      const fam = familyOf(scope, trip.family_id);
      mustBePrimary(ToolError, fam, "packing items");
      if (readsAsHealth(item, args.category)) throw new ToolError("Health items are added in the app, not through an assistant. Nothing was added.");
      const assignee = resolveAssignee(ToolError, fam, await tripTravelers(client, scope, trip), args.traveler);
      const { data, error } = await client.from("packing_items").select("item, assignee, category, sort_order, stashed_at").eq("trip_id", trip.id);
      if (error) throw new Error("packing unavailable");
      const base = { trip: tripRef(trip), item, for: assignee };
      if ((data || []).some((r) => !r.stashed_at && norm(r.item) === norm(item) && (r.assignee || "Shared") === assignee)) {
        return { summary: `${item} is already on ${assignee === "Shared" ? "the shared list" : `${assignee}'s list`} for ${trip.name}.`, ...base, changed: false };
      }
      // Top of its heading, as the Packing screen's own add does: one smaller
      // than the smallest sort_order already under that category.
      const category = clip(args.category, 60) || "General";
      const key = norm(category);
      const top = (data || []).reduce(
        (min, r) => (norm(r.category || "General") === key ? Math.min(min, r.sort_order ?? 0) : min),
        1,
      );
      const row = {
        trip_id: trip.id,
        item,
        assignee,
        quantity: clip(args.quantity, 40),
        category,
        sort_order: top - 1,
        last_minute: looksLastMinute(item),
      };
      const { data: saved, error: saveError } = await client.from("packing_items").insert(row).select("id");
      if (saveError || !saved?.length) throw new ToolError(`${item} could not be added. Nothing was saved.`);
      return { summary: `Added ${row.quantity ? `${row.quantity} ` : ""}${item} for ${assignee} on ${trip.name}.`, ...base, changed: true };
    },

    async add_reminder(client, scope, args) {
      const title = clip(args.reminder, 200);
      if (!title) throw new ToolError("Say what the reminder is.");
      if (args.due && !ISO.test(args.due)) throw new ToolError("due must be YYYY-MM-DD.");
      const priority = args.priority || "normal";
      if (!["high", "normal", "low"].includes(priority)) throw new ToolError("priority must be high, normal or low.");
      const trip = await pickTrip(client, scope, args.trip);
      const fam = familyOf(scope, trip.family_id);
      mustBePrimary(ToolError, fam, "reminders");
      const detail = clip(args.detail, 1000);
      if (readsAsHealth(title, detail)) throw new ToolError("Health reminders are added in the app, not through an assistant. Nothing was added.");
      const assignee = resolveAssignee(ToolError, fam, await tripTravelers(client, scope, trip), args.traveler);
      const { data, error } = await client.from("predeparture_tasks").select("title, is_done").eq("trip_id", trip.id);
      if (error) throw new Error("reminders unavailable");
      const base = { trip: tripRef(trip), reminder: title, for: assignee, due: args.due || null };
      if ((data || []).some((r) => !r.is_done && norm(r.title) === norm(title))) {
        return { summary: `"${title}" is already an open reminder on ${trip.name}.`, ...base, changed: false };
      }
      const row = { trip_id: trip.id, title, detail, assignee, due_date: args.due || null, priority };
      const { data: saved, error: saveError } = await client.from("predeparture_tasks").insert(row).select("id");
      if (saveError || !saved?.length) throw new ToolError(`"${title}" could not be added. Nothing was saved.`);
      return { summary: `Added the reminder "${title}" for ${assignee} on ${trip.name}${args.due ? `, due ${args.due}` : ""}.`, ...base, changed: true };
    },

    async add_bucket_list_place(client, scope, args) {
      const place = clip(args.place, 120);
      if (!place) throw new ToolError("Say which place to add.");
      const fams = scope.families.filter((f) => !f.secondary);
      if (!fams.length) throw new ToolError("Only the household's primary travelers can add to the bucket list. Nothing was added.");
      if (fams.length > 1) throw new ToolError("You belong to more than one household, so this has to be added in the app. Nothing was added.");
      const fam = fams[0];
      const why = clip(args.why, 600);
      if (readsAsHealth(why)) throw new ToolError("Leave health details out of the reason; add them in the app if they matter. Nothing was added.");
      let months;
      if (args.months) {
        months = parseMonths(String(args.months).split(/[,;/]|\band\b/i));
        if (!months.length) throw new ToolError(`"${args.months}" are not months. Nothing was added.`);
      }
      let nights = null;
      if (args.nights) {
        nights = Number(args.nights);
        if (!Number.isInteger(nights) || nights < 1 || nights > 365) throw new ToolError("nights must be a whole number from 1 to 365.");
      }
      const { data, error } = await client.from("someday_places").select("place, status").eq("family_id", fam.familyId);
      if (error) throw new Error("bucket list unavailable");
      if ((data || []).some((p) => p.status !== "retired" && norm(p.place) === norm(place))) {
        return { summary: `${place} is already on the bucket list.`, place, changed: false };
      }
      const row = {
        family_id: fam.familyId,
        place,
        why,
        nights,
        created_by: scope.userId,
        updated_by: scope.userId,
        ...(months ? { months } : {}),
      };
      const { data: saved, error: saveError } = await client.from("someday_places").insert(row).select("id");
      if (saveError || !saved?.length) throw new ToolError(`${place} could not be added. Nothing was saved.`);
      return { summary: `Added ${place} to the bucket list.`, place, why, best_months: months || [], nights, changed: true };
    },
  };
}
