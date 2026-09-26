// The household-context tools: preferences, budget, expiration dates, wallet,
// day packs, reminders, house tasks, deadlines, trip essentials, nearby tips,
// the bucket list, fare alerts, pets, insurance and the trip log.
//
// Same governing rule as tools.js: return what is already saved, never
// generate, never write. What these tools are held to, on top of RLS:
//
//   - Nothing about a child. Rows owned by, assigned to, or naming a minor are
//     dropped whole; a minor is never counted, named or described.
//   - Nothing about health. Any free text that reads as health, allergy,
//     medical, mobility or religious diet is dropped whole rather than edited.
//   - No numbers that identify anything: document, member, policy, microchip
//     and confirmation numbers are never selected, so they cannot leak.
//   - No typed notes, no files, no email bodies, no Ask Aly conversations.
//   - A secondary traveler sees only their own rows, and none of the
//     household's money, wallet offers, bucket list, fares or house tasks.
//
// Columns are listed explicitly in every select so a new column added to a
// table later does not start flowing to an assistant by default.

import { familyOf } from "./scope";
import { windowOpensOn } from "@/lib/tips/rules";
import { arrangementLabel, isComing } from "@/lib/pets/pets";

// Health, allergy, medical, mobility and religious-diet wording. Deliberately
// broad: a food preference that trips this is withheld, not reworded.
const HEALTH =
  /\b(allerg\w*|celiac|coeliac|gluten|diabet\w*|insulin|lactose|intoleran\w*|epi-?pens?|anaphyla\w*|medical\w*|medic(ine|ation)s?|meds|prescription\w*|health\w*|disab\w*|wheelchair\w*|mobility|walker|cane|pregnan\w*|asthma\w*|inhaler\w*|kosher|halal|religio\w*|peanuts?|tree nuts?|nut-free|shellfish|dairy-free|sensitiv\w*|therap\w*|anxiety|autis\w*|adhd|seizure\w*|cpap|dialysis|doctor\w*|hospital\w*)\b/i;

export function readsAsHealth(...texts) {
  return texts.some((t) => typeof t === "string" && HEALTH.test(t));
}

function mentionsName(text, names) {
  if (typeof text !== "string" || !text) return false;
  for (const name of names) {
    if (!name) continue;
    const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${esc}\\b`, "i").test(text)) return true;
  }
  return false;
}

/** Whether a row belongs to, is assigned to, or names a child in this household. */
export function touchesMinor(fam, { ids = [], assignee = null, texts = [] } = {}) {
  if (!fam) return true;
  if (ids.some((id) => id && fam.minorIds.has(id))) return true;
  if (assignee && fam.minorNames.has(assignee)) return true;
  return texts.some((t) => mentionsName(t, fam.minorNames));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const money = (n) => (n == null ? null : Math.round(Number(n) * 100) / 100);

function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function ownerIdsOf(row) {
  const many = Array.isArray(row?.traveler_ids) ? row.traveler_ids.filter(Boolean) : [];
  if (many.length) return [...new Set(many)];
  return row?.traveler_id ? [row.traveler_id] : [];
}

function nameOf(scope, id) {
  return scope.travelers.find((t) => t.id === id)?.name || null;
}

function householdFamilies(scope) {
  return scope.families.filter((f) => !f.secondary);
}

function primaryOnly(ToolError, scope, what) {
  const fams = householdFamilies(scope);
  if (!fams.length) throw new ToolError(`${what} is shown to the household's primary travelers only.`);
  return fams;
}

async function rows(query, what) {
  const { data, error } = await query;
  if (error) throw new Error(`${what} unavailable`);
  return data || [];
}

const dateArg = (description) => ({ type: "string", description, pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

export function householdTools(READ, tripArg) {
  const t = (name, title, description, properties = {}, required) => ({
    name,
    title,
    description,
    inputSchema: { type: "object", properties, ...(required ? { required } : {}), additionalProperties: false },
    annotations: { title, ...READ },
  });
  const optionalTrip = { ...tripArg, description: `${tripArg.description} Leave out for the whole household.` };
  return [
    t("get_preferences", "Get travel preferences",
      "How the household likes to travel, in their own words: food, lodging, pace, excursions, getting around, money. Pass a trip to get only what applies to the people going.",
      { trip: optionalTrip, topic: { type: "string", description: "Only preferences on this topic, e.g. Food or Accommodations." } }),
    t("get_budget", "Get trip budget",
      "A trip's budget target and its planned and actual spending, by category.",
      { trip: tripArg }),
    t("get_expiration_dates", "Get expiration dates",
      "When the adults' passports, Global Entry and driver's licenses expire, and the pets' travel records. Pass a trip to check each against it, including passports valid six months past a trip abroad. Never returns document numbers.",
      { trip: optionalTrip }),
    t("get_insurance", "Get travel insurance",
      "Travel insurance policies: provider, plan, coverage dates, what is covered and the limits, and whether coverage spans a trip. Never returns policy numbers.",
      { trip: optionalTrip }),
    t("get_wallet", "Get rewards and cards",
      "Loyalty programs and credit cards: balances, status, how points are earned, perks, credits and fees, plus card offers still open. Never returns member numbers.",
      { traveler: { type: "string", description: "A traveler's first name, to see only their programs." } }),
    t("get_day_pack", "Get a day pack",
      "What goes in the bag for one day of a trip, and what is already packed.",
      { trip: tripArg, date: dateArg("The day, as YYYY-MM-DD. Defaults to today.") }),
    t("get_reminders", "Get reminders",
      "A trip's to-do reminders before departure, with due dates and whether each is done.",
      { trip: tripArg, include_done: { type: "string", enum: ["yes", "no"], description: "Include finished reminders. Defaults to no." } }),
    t("get_house_tasks", "Get house tasks",
      "The household's standing list of things to do at home before any trip, such as holding mail or setting the thermostat.",
      {}),
    t("get_deadlines", "Get deadlines",
      "Dates that must not be missed: when booking windows open for a trip, when fare deals must be booked by, and when card offers end.",
      { trip: optionalTrip }),
    t("get_trip_essentials", "Get trip essentials",
      "Saved facts for a trip: entry requirements, plugs and voltage, currencies, languages, and per-booking advice such as when to arrive, what to wear and what to bring.",
      { trip: tripArg }),
    t("get_nearby_tips", "Get nearby tips",
      "Location-aware pro tips already saved for you on a trip. Returns only your own tips.",
      { trip: tripArg }),
    t("get_bucket_list", "Get bucket list",
      "Places the household wants to go someday, with why, the best months, how long, priority and a fare ceiling.",
      {}),
    t("get_fare_alerts", "Get fare alerts",
      "Open fare deals the household saved, with price, dates and book-by date, and the home airports fares should leave from.",
      {}),
    t("get_pets", "Get pets",
      "The household's pets and how they travel. Pass a trip for who is coming and the arrangement for the rest. Never returns microchip numbers, vets or medications.",
      { trip: optionalTrip }),
    t("get_trip_log", "Get favorite moments",
      "Favorite travel moments the adults have written down, which say what the household values in a trip.",
      {}),
  ];
}

export function householdHandlers({ ToolError, pickTrip, tripRef, tripTravelers, visibleTrips }) {
  async function maybeTrip(client, scope, wanted) {
    return wanted ? pickTrip(client, scope, wanted) : null;
  }

  return {
    async get_preferences(client, scope, args) {
      const trip = await maybeTrip(client, scope, args.trip);
      const fams = trip ? [familyOf(scope, trip.family_id)] : scope.families;
      let going = null;
      if (trip) going = new Set((await tripTravelers(client, scope, trip)).map((p) => p.id));
      const out = [];
      for (const fam of fams) {
        const list = await rows(
          client.from("travel_preferences")
            .select("id, family_id, traveler_id, traveler_ids, topic, topics, body, reason, slot, sort_order")
            .eq("family_id", fam.familyId),
          "preferences",
        );
        for (const p of list) {
          const owners = ownerIdsOf(p);
          if (touchesMinor(fam, { ids: owners, texts: [p.body, p.reason] })) continue;
          if (readsAsHealth(p.body, p.reason)) continue;
          if (fam.secondary && owners.length && !owners.some((id) => fam.travelerIds.includes(id))) continue;
          if (going && going.size && owners.length && !owners.some((id) => going.has(id))) continue;
          const topics = [...new Set([...(Array.isArray(p.topics) ? p.topics : []), p.topic].filter(Boolean))];
          if (args.topic && !topics.some((x) => x.toLowerCase().includes(String(args.topic).toLowerCase()))) continue;
          out.push({
            preference: p.body,
            why: p.reason || null,
            topics,
            whose: owners.length ? owners.map((id) => nameOf(scope, id)).filter(Boolean) : ["Shared"],
            order: p.sort_order ?? 0,
          });
        }
      }
      out.sort((a, b) => String(a.topics[0] || "").localeCompare(String(b.topics[0] || "")) || a.order - b.order);
      const prefs = out.map(({ order, ...p }) => p);
      return {
        summary: prefs.length
          ? `${plural(prefs.length, "preference")}${trip ? ` for ${trip.name}` : ""}: ${prefs.map((p) => p.preference).join(" | ")}`
          : `No preferences saved${args.topic ? ` on ${args.topic}` : ""}.`,
        ...(trip ? { trip: tripRef(trip) } : {}),
        preferences: prefs,
      };
    },

    async get_budget(client, scope, args) {
      const trip = await pickTrip(client, scope, args.trip);
      const fam = familyOf(scope, trip.family_id);
      if (!fam || fam.secondary) throw new ToolError("The budget is shown to the household's primary travelers only.");
      const [target] = await rows(client.from("trips").select("id, budget_target").eq("id", trip.id), "budget");
      const costs = await rows(
        client.from("trip_costs").select("label, category, cost_estimate, cost_actual, sort_order").eq("trip_id", trip.id),
        "budget",
      );
      const items = await rows(
        client.from("itinerary_items").select("title, category, cost_estimate, cost_actual").eq("trip_id", trip.id),
        "budget",
      );
      const byCat = {};
      const lines = [];
      for (const r of [...costs.map((c) => ({ ...c, title: c.label, from: "cost" })), ...items.map((i) => ({ ...i, from: "plan" }))]) {
        if (r.cost_estimate == null && r.cost_actual == null) continue;
        if (touchesMinor(fam, { texts: [r.title] })) continue;
        const cat = r.category || "Other";
        const c = (byCat[cat] ||= { category: cat, planned: 0, actual: 0 });
        c.planned += Number(r.cost_estimate || 0);
        c.actual += Number(r.cost_actual || 0);
        lines.push({ what: r.title, category: cat, planned: money(r.cost_estimate), actual: money(r.cost_actual) });
      }
      const categories = Object.values(byCat).map((c) => ({ ...c, planned: money(c.planned), actual: money(c.actual) }));
      const planned = money(categories.reduce((s, c) => s + c.planned, 0));
      const actual = money(categories.reduce((s, c) => s + c.actual, 0));
      const budgetTarget = money(target?.budget_target);
      return {
        summary: lines.length || budgetTarget != null
          ? `${trip.name}: ${budgetTarget != null ? `target ${budgetTarget}, ` : ""}planned ${planned}, spent ${actual}.`
          : `No budget or costs saved for ${trip.name}.`,
        trip: tripRef(trip),
        budget_target: budgetTarget,
        planned,
        actual,
        categories,
        lines,
      };
    },

    async get_expiration_dates(client, scope, args) {
      const trip = await maybeTrip(client, scope, args.trip);
      const fams = trip ? [familyOf(scope, trip.family_id)] : scope.families;
      let going = null;
      let abroad = null;
      let comingPets = null;
      if (trip) {
        going = new Set((await tripTravelers(client, scope, trip)).map((p) => p.id));
        const [facts] = await rows(client.from("trip_facts").select("trip_id, leaves_country").eq("trip_id", trip.id), "trip facts");
        abroad = facts ? facts.leaves_country === true : null;
        const tp = await rows(client.from("trip_pets").select("pet_id, arrangement").eq("trip_id", trip.id), "pets");
        comingPets = new Set(tp.filter((p) => isComing(p.arrangement)).map((p) => p.pet_id));
      }
      const end = trip ? trip.end_date || trip.start_date : null;
      const start = trip ? trip.start_date : null;
      const documents = [];
      const pets = [];
      for (const fam of fams) {
        const adults = scope.travelers.filter(
          (t) => t.family_id === fam.familyId && t.is_person && !fam.minorIds.has(t.id) &&
            (!fam.secondary || fam.travelerIds.includes(t.id)) && (!going || going.has(t.id)),
        );
        if (adults.length) {
          const docs = await rows(
            client.from("traveler_documents").select("traveler_id, doc_type, expiration_date").in("traveler_id", adults.map((a) => a.id)),
            "documents",
          );
          for (const d of docs) {
            if (fam.minorIds.has(d.traveler_id)) continue;
            const row = { whose: nameOf(scope, d.traveler_id), type: d.doc_type, expires: d.expiration_date || null };
            if (trip && row.expires && start) {
              if (row.expires < start) row.check = "Expires before the trip starts.";
              else if (end && row.expires < end) row.check = "Expires during the trip.";
              else if (d.doc_type === "passport" && abroad && end && row.expires < addMonths(end, 6))
                row.check = "Less than six months left after the trip ends; many countries refuse entry.";
              else row.check = "Valid for the trip.";
            }
            documents.push(row);
          }
        }
        if (!fam.secondary) {
          const list = await rows(
            client.from("pets")
              .select("id, family_id, name, species, rabies_expiration, health_certificate_expiration, coggins_expiration")
              .eq("family_id", fam.familyId),
            "pets",
          );
          for (const p of list) {
            if (comingPets && !comingPets.has(p.id)) continue;
            for (const [key, label] of [["rabies_expiration", "rabies"], ["health_certificate_expiration", "health certificate"], ["coggins_expiration", "Coggins test"]]) {
              if (!p[key]) continue;
              const row = { pet: p.name, species: p.species || null, record: label, expires: p[key] };
              if (trip && end) row.check = p[key] < end ? "Expires before the trip ends." : "Valid for the trip.";
              pets.push(row);
            }
          }
        }
      }
      documents.sort((a, b) => String(a.expires || "9").localeCompare(String(b.expires || "9")));
      pets.sort((a, b) => String(a.expires).localeCompare(String(b.expires)));
      const flagged = [...documents, ...pets].filter((r) => r.check && r.check !== "Valid for the trip.");
      return {
        summary: documents.length || pets.length
          ? trip
            ? flagged.length
              ? `${plural(flagged.length, "problem")} for ${trip.name}: ${flagged.map((r) => `${r.whose || r.pet}'s ${r.type || r.record} (${r.expires}) ${r.check}`).join(" ")}`
              : `Everything on file is valid for ${trip.name}.`
            : `${documents.map((d) => `${d.whose}'s ${d.type} expires ${d.expires || "(no date)"}`).concat(pets.map((p) => `${p.pet}'s ${p.record} expires ${p.expires}`)).join("; ")}.`
          : "No expiration dates on file.",
        ...(trip ? { trip: tripRef(trip), leaves_country: abroad } : {}),
        documents,
        pets,
      };
    },

    async get_insurance(client, scope, args) {
      const trip = await maybeTrip(client, scope, args.trip);
      const fams = primaryOnly(ToolError, scope, "Insurance").filter((f) => !trip || f.familyId === trip.family_id);
      if (!fams.length) throw new ToolError("Insurance is shown to the household's primary travelers only.");
      const out = [];
      for (const fam of fams) {
        const policies = await rows(
          client.from("insurance_policies")
            .select("id, family_id, kind, provider, plan_name, coverage_start, coverage_end, covers, deductible, medical_limit, evacuation_limit, emergency_phone, claims_phone, claims_url")
            .eq("family_id", fam.familyId),
          "insurance",
        );
        if (!policies.length) continue;
        const ids = policies.map((p) => p.id);
        const who = await rows(client.from("insurance_policy_travelers").select("policy_id, traveler_id").in("policy_id", ids), "insurance");
        const onTrips = trip
          ? new Set((await rows(client.from("trip_insurance_policies").select("policy_id, trip_id").eq("trip_id", trip.id), "insurance")).map((l) => l.policy_id))
          : null;
        for (const p of policies) {
          const coversTrip = trip && p.coverage_start && p.coverage_end && trip.start_date
            ? p.coverage_start <= trip.start_date && p.coverage_end >= (trip.end_date || trip.start_date)
            : null;
          if (trip && !onTrips.has(p.id) && !(p.kind === "annual" && coversTrip)) continue;
          out.push({
            provider: p.provider,
            plan: p.plan_name || null,
            kind: p.kind,
            coverage_start: p.coverage_start || null,
            coverage_end: p.coverage_end || null,
            covers: Array.isArray(p.covers) ? p.covers : [],
            deductible: money(p.deductible),
            medical_limit: money(p.medical_limit),
            evacuation_limit: money(p.evacuation_limit),
            emergency_phone: p.emergency_phone || null,
            claims_phone: p.claims_phone || null,
            claims_url: p.claims_url || null,
            adults_covered: who.filter((w) => w.policy_id === p.id && !fam.minorIds.has(w.traveler_id)).map((w) => nameOf(scope, w.traveler_id)).filter(Boolean),
            ...(trip ? { spans_trip: coversTrip } : {}),
          });
        }
      }
      return {
        summary: out.length
          ? `${out.length} ${out.length === 1 ? "policy" : "policies"}${trip ? ` for ${trip.name}` : ""}: ${out.map((p) => `${p.provider}${p.plan ? ` ${p.plan}` : ""} (${p.coverage_start || "?"} to ${p.coverage_end || "?"})${trip && p.spans_trip === false ? " does not span the trip" : ""}`).join("; ")}.`
          : `No travel insurance saved${trip ? ` for ${trip.name}` : ""}.`,
        ...(trip ? { trip: tripRef(trip) } : {}),
        policies: out,
      };
    },

    async get_wallet(client, scope, args) {
      const programs = [];
      const offers = [];
      const who = String(args.traveler || "").trim().toLowerCase();
      for (const fam of scope.families) {
        const list = await rows(
          client.from("rewards_programs")
            .select("family_id, traveler_id, kind, brand, program_name, currency_label, points_balance, points_checked_on, status_tier, earn_rules, perks, point_value_cents, annual_fee, credits, expiry_note, opened_on, closed_on, is_active, sort_order")
            .eq("family_id", fam.familyId),
          "wallet",
        );
        for (const p of list) {
          if (p.is_active === false || p.closed_on) continue;
          if (touchesMinor(fam, { ids: [p.traveler_id] })) continue;
          if (fam.secondary && !fam.travelerIds.includes(p.traveler_id)) continue;
          const whose = p.traveler_id ? nameOf(scope, p.traveler_id) : "Shared";
          if (who && !String(whose || "").toLowerCase().startsWith(who)) continue;
          programs.push({
            program: p.program_name || p.brand,
            brand: p.brand || null,
            kind: p.kind,
            whose,
            balance: p.points_balance ?? null,
            unit: p.currency_label || null,
            balance_checked_on: p.points_checked_on || null,
            status: p.status_tier || null,
            point_value_cents: p.point_value_cents == null ? null : Number(p.point_value_cents),
            earns: Array.isArray(p.earn_rules) ? p.earn_rules.map((r) => ({ on: r.on, rate: r.rate })) : [],
            perks: readsAsHealth(p.perks) ? null : p.perks || null,
            credits: Array.isArray(p.credits) ? p.credits.map((c) => ({ on: c.on, amount: c.amount, resets: c.resets || null })) : [],
            annual_fee: money(p.annual_fee),
            expiry: p.expiry_note || null,
            opened_on: p.opened_on || null,
          });
        }
        if (!fam.secondary && !who) {
          const list2 = await rows(
            client.from("card_offers")
              .select("family_id, issuer, card_name, bonus_text, bonus_amount, bonus_unit, min_spend, spend_window_days, annual_fee, offer_ends_on, source_title, source_url, verified_on, status")
              .eq("family_id", fam.familyId)
              .eq("status", "open"),
            "card offers",
          );
          for (const o of list2) {
            if (o.offer_ends_on && o.offer_ends_on < scope.today) continue;
            offers.push({
              card: o.card_name, issuer: o.issuer || null, bonus: o.bonus_text || null,
              bonus_amount: o.bonus_amount == null ? null : Number(o.bonus_amount), bonus_unit: o.bonus_unit || null,
              min_spend: money(o.min_spend), spend_window_days: o.spend_window_days ?? null,
              annual_fee: money(o.annual_fee), ends_on: o.offer_ends_on || null,
              source: o.source_title || null, source_url: o.source_url || null, verified_on: o.verified_on || null,
            });
          }
        }
      }
      return {
        summary: programs.length || offers.length
          ? `${plural(programs.length, "program")}: ${programs.map((p) => `${p.program} (${p.whose}${p.balance != null ? `, ${p.balance}${p.unit ? ` ${p.unit}` : ""}` : ""}${p.status ? `, ${p.status}` : ""})`).join("; ")}.${offers.length ? ` ${plural(offers.length, "open card offer")}.` : ""}`
          : "No rewards programs or cards saved.",
        programs,
        card_offers: offers,
      };
    },

    async get_day_pack(client, scope, args) {
      const date = args.date || scope.today;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolError("date must be YYYY-MM-DD.");
      const trip = await pickTrip(client, scope, args.trip);
      const fam = familyOf(scope, trip.family_id);
      const list = await rows(
        client.from("day_pack_items").select("item_date, item, why, assignee, is_packed, sort_order").eq("trip_id", trip.id).eq("item_date", date),
        "day pack",
      );
      const items = list
        // A parent sees their children's day pack lines; a secondary never does.
        .filter((i) => !fam.secondary || !touchesMinor(fam, { assignee: i.assignee, texts: [i.item, i.why] }))
        .filter((i) => !readsAsHealth(i.item, i.why))
        .filter((i) => !fam.secondary || !i.assignee || i.assignee === fam.travelerName)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((i) => ({ item: i.item, why: i.why || null, for: i.assignee || null, packed: !!i.is_packed }));
      const left = items.filter((i) => !i.packed);
      return {
        summary: items.length
          ? `Day pack for ${trip.name}, ${date}: ${items.length - left.length} of ${items.length} packed.${left.length ? ` Still to pack: ${left.map((i) => i.item).join(", ")}.` : ""}`
          : `No day pack for ${trip.name} on ${date}.`,
        trip: tripRef(trip),
        date,
        items,
      };
    },

    async get_reminders(client, scope, args) {
      if (args.include_done && !["yes", "no"].includes(args.include_done)) throw new ToolError("include_done must be yes or no.");
      const trip = await pickTrip(client, scope, args.trip);
      const fam = familyOf(scope, trip.family_id);
      const list = await rows(
        client.from("predeparture_tasks").select("title, detail, assignee, due_date, timing, priority, is_done, sort_order").eq("trip_id", trip.id),
        "reminders",
      );
      const items = list
        .filter((r) => args.include_done === "yes" || !r.is_done)
        .filter((r) => !touchesMinor(fam, { assignee: r.assignee, texts: [r.title, r.detail] }))
        .filter((r) => !readsAsHealth(r.title, r.detail))
        .filter((r) => !fam.secondary || !r.assignee || r.assignee === fam.travelerName)
        .sort((a, b) => String(a.due_date || "9").localeCompare(String(b.due_date || "9")) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((r) => {
          const out = { reminder: r.title, detail: r.detail || null, for: r.assignee || null, due: r.due_date || null, timing: r.timing || null, priority: r.priority || null, done: !!r.is_done };
          if (!r.is_done && r.due_date) out.overdue = r.due_date < scope.today;
          return out;
        });
      const overdue = items.filter((r) => r.overdue).length;
      return {
        summary: items.length
          ? `${plural(items.length, args.include_done === "yes" ? "reminder" : "open reminder")} for ${trip.name}${overdue ? `, ${overdue} overdue` : ""}: ${items.map((r) => `${r.reminder}${r.due ? ` (due ${r.due})` : ""}`).join("; ")}.`
          : `No open reminders for ${trip.name}.`,
        trip: tripRef(trip),
        reminders: items,
      };
    },

    async get_house_tasks(client, scope) {
      const fams = primaryOnly(ToolError, scope, "The house list");
      const out = [];
      for (const fam of fams) {
        const list = await rows(
          client.from("house_tasks").select("title, detail, timing, assignee, only_when_empty, sort_order").eq("family_id", fam.familyId),
          "house tasks",
        );
        for (const h of list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
          if (touchesMinor(fam, { assignee: h.assignee, texts: [h.title, h.detail] })) continue;
          if (readsAsHealth(h.title, h.detail)) continue;
          out.push({ task: h.title, detail: h.detail || null, when: h.timing || null, for: h.assignee || null, only_when_house_empty: !!h.only_when_empty });
        }
      }
      return {
        summary: out.length ? `${plural(out.length, "house task")}: ${out.map((h) => h.task).join("; ")}.` : "No house tasks saved.",
        tasks: out,
      };
    },

    async get_deadlines(client, scope, args) {
      const trip = await maybeTrip(client, scope, args.trip);
      const trips = trip ? [trip] : (await visibleTrips(client, scope)).filter((x) => (x.end_date || x.start_date || "9") >= scope.today && x.status !== "draft");
      const out = [];
      for (const tr of trips) {
        const [facts] = await rows(client.from("trip_facts").select("trip_id, booking_windows").eq("trip_id", tr.id), "trip facts");
        const windows = Array.isArray(facts?.booking_windows) ? facts.booking_windows : [];
        if (!windows.length) continue;
        const items = await rows(client.from("itinerary_items").select("item_date, title, category").eq("trip_id", tr.id), "itinerary");
        for (const w of windows) {
          const { opensOn } = windowOpensOn(w, tr, items);
          if (!opensOn || opensOn < scope.today) continue;
          out.push({ kind: "booking window", what: w.name || w.applies_to || "Booking window", trip: tr.name, date: opensOn, time: w.opens_time || null, note: w.note || null });
        }
      }
      for (const fam of householdFamilies(scope)) {
        if (trip && fam.familyId !== trip.family_id) continue;
        const deals = await rows(
          client.from("flight_deals").select("family_id, origin, destination, price, currency, book_by, trip_id, status").eq("family_id", fam.familyId).eq("status", "open"),
          "fares",
        );
        for (const d of deals) {
          if (!d.book_by || d.book_by < scope.today) continue;
          if (trip && d.trip_id !== trip.id) continue;
          out.push({ kind: "fare", what: `${d.origin || "?"} to ${d.destination || "?"}${d.price != null ? ` at ${Number(d.price)} ${d.currency || ""}`.trimEnd() : ""}`, date: d.book_by });
        }
        if (!trip) {
          const offers = await rows(
            client.from("card_offers").select("family_id, card_name, offer_ends_on, status").eq("family_id", fam.familyId).eq("status", "open"),
            "card offers",
          );
          for (const o of offers) if (o.offer_ends_on && o.offer_ends_on >= scope.today) out.push({ kind: "card offer", what: `${o.card_name} offer ends`, date: o.offer_ends_on });
        }
      }
      out.sort((a, b) => a.date.localeCompare(b.date));
      for (const d of out) d.days_away = daysBetween(scope.today, d.date);
      return {
        summary: out.length
          ? `${plural(out.length, "upcoming deadline")}: ${out.map((d) => `${d.date} ${d.what}${d.trip ? ` (${d.trip})` : ""}`).join("; ")}.`
          : `No upcoming deadlines${trip ? ` for ${trip.name}` : ""}.`,
        ...(trip ? { trip: tripRef(trip) } : {}),
        deadlines: out,
      };
    },

    async get_trip_essentials(client, scope, args) {
      const trip = await pickTrip(client, scope, args.trip);
      const fam = familyOf(scope, trip.family_id);
      const [f] = await rows(
        client.from("trip_facts").select("trip_id, leaves_country, countries, entry_note, mains_voltage, plug_types, currencies, languages, coverage_note").eq("trip_id", trip.id),
        "trip facts",
      );
      const items = await rows(client.from("itinerary_items").select("id, item_date, title").eq("trip_id", trip.id), "itinerary");
      const byId = new Map(items.map((i) => [i.id, i]));
      const insights = await rows(
        client.from("item_insights").select("item_id, trip_id, dress_code, arrive_minutes, arrive_why, heads_up, bring").eq("trip_id", trip.id),
        "booking advice",
      );
      const bookings = insights
        .filter((i) => byId.has(i.item_id) && (i.dress_code || i.arrive_minutes || i.heads_up || i.bring))
        .filter((i) => !touchesMinor(fam, { texts: [i.heads_up, i.bring, i.arrive_why] }) && !readsAsHealth(i.heads_up, i.bring, i.arrive_why))
        .map((i) => ({
          booking: byId.get(i.item_id).title,
          date: byId.get(i.item_id).item_date || null,
          arrive_minutes_early: i.arrive_minutes ?? null,
          arrive_why: i.arrive_why || null,
          dress_code: i.dress_code || null,
          bring: i.bring || null,
          heads_up: i.heads_up || null,
        }))
        .sort((a, b) => String(a.date || "9").localeCompare(String(b.date || "9")));
      const facts = f
        ? {
            leaves_country: f.leaves_country ?? null,
            countries: f.countries || [],
            entry: f.entry_note || null,
            voltage: f.mains_voltage || null,
            plugs: f.plug_types || [],
            currencies: f.currencies || [],
            languages: f.languages || [],
            phone_coverage: f.coverage_note || null,
          }
        : null;
      return {
        summary: facts || bookings.length
          ? `${trip.name}: ${facts ? `${(facts.countries || []).join(", ") || "destination"}${facts.entry ? `. Entry: ${facts.entry}` : ""}${facts.plugs?.length ? `. Plugs ${facts.plugs.join("/")}` : ""}.` : ""} ${bookings.length ? `Advice saved for ${plural(bookings.length, "booking")}.` : ""}`.trim()
          : `No essentials saved for ${trip.name} yet.`,
        trip: tripRef(trip),
        facts,
        bookings,
      };
    },

    async get_nearby_tips(client, scope, args) {
      const trip = await pickTrip(client, scope, args.trip);
      const fam = familyOf(scope, trip.family_id);
      const list = await rows(
        client.from("location_tips").select("user_id, trip_id, content, status, checked_at").eq("user_id", scope.userId).eq("trip_id", trip.id).eq("status", "active"),
        "nearby tips",
      );
      const tips = list
        .filter((x) => x.user_id === scope.userId && x.content && x.content.title)
        .filter((x) => !touchesMinor(fam, { texts: [x.content.title, x.content.body, x.content.because] }) && !readsAsHealth(x.content.title, x.content.body, x.content.because))
        .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))
        .slice(0, 20)
        .map((x) => ({ title: x.content.title, detail: x.content.body || null, because: x.content.because || null, urgency: x.content.urgency || null, act_by: x.content.act_by || null, checked_at: x.checked_at, sources: (Array.isArray(x.content.sources) ? x.content.sources : []).map((s) => ({ title: s.title || null, url: s.url })) }));
      return {
        summary: tips.length ? `${plural(tips.length, "nearby tip")} for ${trip.name}: ${tips.map((x) => x.title).join("; ")}.` : `No nearby tips saved for ${trip.name}.`,
        trip: tripRef(trip),
        tips,
      };
    },

    async get_bucket_list(client, scope) {
      const fams = primaryOnly(ToolError, scope, "The bucket list");
      const out = [];
      for (const fam of fams) {
        const list = await rows(
          client.from("someday_places")
            .select("family_id, place, region, why, months, months_reason, nights, fare_ceiling, traveler_ids, watch, status, priority")
            .eq("family_id", fam.familyId),
          "bucket list",
        );
        for (const p of list) {
          if (p.status === "retired") continue;
          if (touchesMinor(fam, { texts: [p.place, p.why, p.months_reason] }) || readsAsHealth(p.why, p.months_reason)) continue;
          out.push({
            place: p.place,
            region: p.region || null,
            why: p.why || null,
            best_months: Array.isArray(p.months) ? p.months : [],
            months_why: p.months_reason || null,
            nights: p.nights ?? null,
            fare_ceiling: money(p.fare_ceiling),
            priority: p.priority === 1 ? "high" : p.priority === 2 ? "medium" : p.priority === 3 ? "low" : null,
            who: (p.traveler_ids || []).filter((id) => !fam.minorIds.has(id)).map((id) => nameOf(scope, id)).filter(Boolean),
            watching_fares: !!p.watch,
            status: p.status,
          });
        }
      }
      const rank = { high: 0, medium: 1, low: 2 };
      out.sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || a.place.localeCompare(b.place));
      return {
        summary: out.length ? `${plural(out.length, "place")} on the bucket list: ${out.map((p) => p.place).join("; ")}.` : "The bucket list is empty.",
        places: out,
      };
    },

    async get_fare_alerts(client, scope) {
      const fams = primaryOnly(ToolError, scope, "Fare alerts");
      const deals = [];
      const airports = [];
      for (const fam of fams) {
        const list = await rows(
          client.from("flight_deals")
            .select("family_id, origin, destination, destination_code, price, currency, cabin, airline, book_by, travel_start, travel_end, travel_months, price_basis, award_pricing, source_name, source_url, status, created_at")
            .eq("family_id", fam.familyId)
            .eq("status", "open"),
          "fares",
        );
        for (const d of list) {
          if (d.book_by && d.book_by < scope.today) continue;
          deals.push({
            from: d.origin || null, to: d.destination || null, to_code: d.destination_code || null,
            price: d.price == null ? null : Number(d.price), currency: d.currency || null, price_basis: d.price_basis || null,
            points: Array.isArray(d.award_pricing) ? d.award_pricing.map((a) => ({ points: a.points ?? null, program: a.program ?? null, cash: a.cash ?? null })) : null,
            cabin: d.cabin || null, airline: d.airline || null, book_by: d.book_by || null,
            travel_start: d.travel_start || null, travel_end: d.travel_end || null, travel_months: d.travel_months || [],
            source: d.source_name || null, source_url: d.source_url || null, received: d.created_at ? String(d.created_at).slice(0, 10) : null,
          });
        }
        const ap = await rows(
          client.from("home_airports").select("family_id, code, name, city, drive_minutes, is_primary").eq("family_id", fam.familyId),
          "airports",
        );
        for (const a of ap) airports.push({ code: a.code, name: a.name || null, city: a.city || null, drive_minutes: a.drive_minutes ?? null, primary: !!a.is_primary });
      }
      deals.sort((a, b) => String(a.book_by || "9").localeCompare(String(b.book_by || "9")));
      airports.sort((a, b) => Number(b.primary) - Number(a.primary));
      return {
        summary: `${plural(deals.length, "open fare")}${deals.length ? `: ${deals.map((d) => `${d.from} to ${d.to}${d.price != null ? ` ${d.price} ${d.currency || ""}`.trimEnd() : ""}`).join("; ")}` : ""}. Home airports: ${airports.map((a) => a.code).join(", ") || "none saved"}.`,
        fares: deals,
        home_airports: airports,
      };
    },

    async get_pets(client, scope, args) {
      const trip = await maybeTrip(client, scope, args.trip);
      const fams = primaryOnly(ToolError, scope, "Pets").filter((f) => !trip || f.familyId === trip.family_id);
      if (!fams.length) throw new ToolError("Pets are shown to the household's primary travelers only.");
      const plans = trip ? await rows(client.from("trip_pets").select("pet_id, arrangement").eq("trip_id", trip.id), "pets") : [];
      const out = [];
      for (const fam of fams) {
        const list = await rows(
          client.from("pets")
            .select("id, family_id, name, species, breed, travel_style, carrier_size, rabies_expiration, health_certificate_expiration, coggins_expiration, sort_order")
            .eq("family_id", fam.familyId),
          "pets",
        );
        for (const p of list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
          out.push({
            name: p.name, species: p.species || null, breed: p.breed || null,
            travel_style: p.travel_style || null, carrier_size: p.carrier_size || null,
            rabies_expires: p.rabies_expiration || null, health_certificate_expires: p.health_certificate_expiration || null,
            coggins_expires: p.coggins_expiration || null,
            ...(trip ? { arrangement: arrangementLabel(plans.find((x) => x.pet_id === p.id)?.arrangement || "undecided", p.species) } : {}),
          });
        }
      }
      return {
        summary: out.length
          ? `${plural(out.length, "pet")}: ${out.map((p) => `${p.name}${p.species ? ` (${p.species})` : ""}${trip && p.arrangement ? `, ${p.arrangement}` : ""}`).join("; ")}.`
          : "No pets saved.",
        ...(trip ? { trip: tripRef(trip) } : {}),
        pets: out,
      };
    },

    async get_trip_log(client, scope) {
      const out = [];
      for (const fam of scope.families) {
        const list = await rows(
          client.from("favorite_moments").select("family_id, traveler_id, body, sort_order").eq("family_id", fam.familyId),
          "trip log",
        );
        for (const m of list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
          if (touchesMinor(fam, { ids: [m.traveler_id], texts: [m.body] }) || readsAsHealth(m.body)) continue;
          if (fam.secondary && m.traveler_id && !fam.travelerIds.includes(m.traveler_id)) continue;
          out.push({ moment: m.body, whose: m.traveler_id ? nameOf(scope, m.traveler_id) : "Shared" });
        }
      }
      return {
        summary: out.length ? `${plural(out.length, "favorite moment")}: ${out.map((m) => m.moment).join(" | ")}` : "No favorite moments written down yet.",
        moments: out,
      };
    },
  };
}
