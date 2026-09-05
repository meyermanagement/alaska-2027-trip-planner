// Pricing the blank lines of one trip, and writing the figures in.
//
// This is the rare route that both asks the model and applies the answer without
// a card in between, and that is a deliberate exception rather than a drift in
// policy. Everywhere Aly changes a trip, the change is proposed and a person
// presses it, because those changes move dates, delete things and reach other
// people's lists. This one writes a guess into an empty box, in a column whose
// heading is Estimated, on lines the family can see and retype in a second. The
// cost of being wrong is a wrong number they were going to have to find anyway,
// and the review step would cost more than it protects.
//
// What keeps that honest is the conditions on the write:
//
//   - Only lines with no estimate AND no final figure are ever candidates.
//   - Each update is conditional on the estimate still being null when it lands,
//     so a figure somebody typed while the model was thinking always wins.
//   - Every figure carries a dated note saying it is an estimate and what it was
//     priced as, so no number on this screen is anonymous.
//
// One grounded model call. It is a price question, so it has to be grounded, and
// grounded has a long tail: the budget below is what the model gets, and the rest
// of the platform's minute pays for the reads and the writes around it.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/reminders";
import { resolveAccess } from "@/lib/travelers/access";
import { agesOn } from "@/lib/travelers/ages";
import { buildBudget } from "@/lib/budget/budget";
import { estimatedCosts, estimateNote, MAX_LINES } from "@/lib/budget/estimate";

export const runtime = "nodejs";
export const maxDuration = 90;

const MODEL_BUDGET_MS = 70000;

const bad = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

export async function POST(request) {
  const startedAt = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const tripId = String(body?.tripId || body?.trip_id || "").trim();
  if (!tripId) return bad("Send the trip.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Sign in first.", 401);

  // Row-level security decides whether this trip exists for this person.
  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return bad("That trip is not there.", 404);

  // A secondary traveler cannot see the Money tab at all, so they cannot have
  // pressed this, and an estimate written on their behalf would appear on a
  // screen they will never open.
  const access = await resolveAccess(supabase, user);
  if (access?.can.isSecondary)
    return bad("Only a primary traveler can price a trip.", 403);

  const today = todayISO();

  const [
    { data: itinerary },
    { data: costs },
    { data: going },
    { data: facts },
  ] = await Promise.all([
    supabase.from("itinerary_items").select("*").eq("trip_id", tripId),
    supabase.from("trip_costs").select("*").eq("trip_id", tripId),
    supabase
      .from("trip_travelers")
      .select("travelers (id, name, is_person, date_of_birth)")
      .eq("trip_id", tripId),
    supabase
      .from("trip_facts")
      .select("currency")
      .eq("trip_id", tripId)
      .maybeSingle(),
  ]);

  const travelers = (going || []).map((row) => row.travelers).filter(Boolean);
  const ages = new Map(
    agesOn(travelers, trip.start_date).map((row) => [row.id, row.age]),
  );

  // The same arithmetic the screen does, so the lines offered to the model are
  // exactly the lines showing an empty Estimated box -- cancelled items already
  // dropped, notes without money already left out.
  const budget = buildBudget({
    trip,
    itinerary: itinerary || [],
    costs: costs || [],
  });
  const blank = budget.lines.filter((line) => !line.priced);
  const priced = budget.lines.filter((line) => line.priced);

  if (!blank.length)
    return NextResponse.json({
      applied: 0,
      blank: 0,
      added: 0,
      message: "Everything on this trip already has a figure against it.",
    });

  const byKey = new Map([
    ...(itinerary || []).map((r) => ["item-" + r.id, r]),
    ...(costs || []).map((r) => ["cost-" + r.id, r]),
  ]);

  let produced;
  try {
    produced = await estimatedCosts({
      today,
      trip,
      travelers: travelers.map((t) => ({
        name: t.name,
        is_person: t.is_person,
        age: ages.get(t.id) ?? null,
      })),
      lines: blank.map((line) => ({
        id: `${line.kind}-${line.id}`,
        kind: line.kind,
        label: line.label,
        sub: line.sub,
        date: line.date,
        status: line.status,
        groupId: line.groupId,
        category: byKey.get(`${line.kind}-${line.id}`)?.category || null,
      })),
      priced,
      target: budget.target,
      facts,
      deadline: startedAt + MODEL_BUDGET_MS,
    });
  } catch (error) {
    const status = Number(error?.status) || 502;
    return bad(
      error?.timedOut
        ? `${error.message} Pricing looks up each line for real, which on a full trip takes a while. Press it again — the lines it already filled in are saved.`
        : error?.message || "Could not price the trip just now.",
      status >= 400 && status < 600 ? status : 502,
    );
  }

  // The writes, one line at a time and each one conditional. A batch upsert would
  // be one round trip instead of a dozen, and would also happily overwrite a
  // figure somebody typed in the seconds this took.
  const applied = [];
  const refused = [];
  for (const estimate of produced.estimates) {
    const [kind, ...rest] = String(estimate.id).split("-");
    const id = rest.join("-");
    const table = kind === "item" ? "itinerary_items" : "trip_costs";
    const row = byKey.get(estimate.id);
    const note = row?.cost_note?.trim()
      ? row.cost_note.trim()
      : estimateNote(estimate.basis);
    const { data, error } = await supabase
      .from(table)
      .update({ cost_estimate: estimate.amount, cost_note: note })
      .eq("id", id)
      .is("cost_estimate", null)
      .is("cost_actual", null)
      .select("id")
      .maybeSingle();
    if (error || !data)
      refused.push({
        label: estimate.label,
        why: error?.message || "already had a figure by the time this landed",
      });
    else
      applied.push({
        label: estimate.label,
        amount: estimate.amount,
        basis: estimate.basis,
      });
  }

  const added = applied.reduce((total, row) => total + row.amount, 0);

  console.log(
    `[budget/estimate] trip=${tripId} blank=${blank.length} offered=${
      produced.estimates.length
    } applied=${applied.length} refused=${refused.length} dropped=${
      produced.dropped.length
    } added=${added} searched=${produced.searched} model=${
      produced.model || "none"
    } ms=${Date.now() - startedAt}`,
  );

  return NextResponse.json({
    applied: applied.length,
    lines: applied,
    // How many were blank, and how many stayed blank, because "priced 6 of 9" is
    // the honest headline and "priced 6" is not.
    blank: blank.length,
    truncated: blank.length > MAX_LINES,
    skipped: blank.length - applied.length,
    refused,
    added,
    searched: produced.searched,
    model: produced.model,
  });
}
