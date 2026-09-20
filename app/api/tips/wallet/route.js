// Looking for pro tips about the Wallet.
//
// Separate from /api/tips/refresh rather than another scope inside it, because
// that route is built around a trip: it takes a trip id, reads that trip's
// itinerary and packing list, researches the destination and keeps a fact sheet
// per trip. None of that applies here. A wallet tip belongs to the family, and
// what it reads is the programs, the calendar, and the open web.
//
// One model call per request, same as the trip route and for the same reason: a
// grounded look-up takes tens of seconds and the platform stops listening. The
// browser asks each question separately: owned-program tips on open (daily),
// current offers only on demand. The loop is also used by the trip button.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/reminders";
import { resolveAccess } from "@/lib/travelers/access";
import { WALLET_SCOPES } from "@/lib/tips/tip";
import { walletTips } from "@/lib/tips/wallet";
import { claimWalletLook } from "@/lib/tips/walletAuto";
import { ledgerRow, staleOffers } from "@/lib/rewards-offers";

export const runtime = "nodejs";
export const maxDuration = 120;

// What the model may have of the request. The rest pays for the five reads
// before it and the writes after, and for answering in words rather than being
// cut off mid-sentence by the platform, which the browser can only report as a
// failed load.
// Raised from 55 for the reason set out at length in the tips refresh route: the
// real window is the 110 seconds lib/tips/run.js waits, not the platform's 120,
// and half of it was going unspent while grounded calls with a long tail lost
// their search and fell back to unverified answers.
const MODEL_BUDGET_MS = 95000;

const bad = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

// Successful manual held-program checks also postpone the next automatic check.
// Automatic requests claim atomically before research; offers never stamp this.
async function stampLooked(supabase, familyId) {
  const { error } = await supabase
    .from("families")
    .update({ wallet_looked_at: new Date().toISOString() })
    .eq("id", familyId);
  if (error) {
    console.error(
      `[tips/wallet] wallet_looked_at NOT saved family=${familyId}: ${error.message}`,
    );
  }
}

export async function POST(request) {
  const startedAt = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const scope = WALLET_SCOPES.includes(String(body?.scope))
    ? String(body.scope)
    : "wallet";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Sign in first.", 401);

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  const familyId = memberships?.[0]?.family_id;
  if (!familyId) return bad("Join a family first.", 403);

  // A secondary traveler cannot reach the Wallet screen and cannot read the
  // programs a tip would be about, so a look would produce advice from an empty
  // record and the insert would be refused anyway. Said properly here rather than
  // left to fail somewhere less legible.
  const access = await resolveAccess(supabase, user);
  if (!access || access.can.isSecondary)
    return bad("Only a primary traveler can look for wallet tips.", 403);

  const automatic = body?.automatic === true;
  if (automatic && scope === "offers")
    return bad("Offers are only checked when you choose See offers.");
  if (automatic) {
    try {
      if (!await claimWalletLook(supabase, familyId)) {
        return NextResponse.json({
          step: scope, done: true, added: 0,
          note: "The daily Wallet check has already started or run. You can check again manually.",
        });
      }
    } catch (error) {
      return bad(error.message, 503);
    }
  }

  const today = todayISO();

  const [
    { data: programs, error: programsError },
    { data: travelers },
    { data: trips },
    { data: preferences },
    { data: existing },
    { data: ledger },
  ] = await Promise.all([
    supabase
      .from("rewards_programs")
      .select("*")
      .eq("family_id", familyId)
      .order("kind", { ascending: true }),
    supabase
      .from("travelers")
      .select("id, name, is_person, about_me")
      .eq("family_id", familyId),
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, status")
      .eq("family_id", familyId)
      .neq("status", "archived")
      .or(`end_date.gte.${today},end_date.is.null`)
      .order("start_date", { ascending: true }),
    supabase.from("travel_preferences").select("*").eq("family_id", familyId),
    // Every wallet tip ever offered, whatever became of it. Cleared ones are in
    // here on purpose: advice they waved off should not come back next month.
    supabase
      .from("pro_tips")
      .select("fingerprint, title, about, scope, status")
      .eq("family_id", familyId)
      .in("scope", WALLET_SCOPES),
    // Every offer ever put to them, and what they did about it. The refusals are
    // the point: an offer they passed on in September should not arrive again in
    // November wearing the same terms.
    supabase.from("card_offers").select("*").eq("family_id", familyId),
  ]);
  if (programsError)
    return bad("Your saved cards and programs could not be read. Please try again.", 503);

  // Offers whose end date has gone by are no longer open, whatever the ledger
  // says. Done before the model is asked so the brief does not present a dead
  // offer as one still on the table.
  const expired = staleOffers(ledger, today);
  if (expired.length) {
    await supabase
      .from("card_offers")
      .update({ status: "expired", decided_on: today })
      .in("id", expired);
  }
  const liveLedger = (ledger || []).filter((row) => !expired.includes(row.id));

  // Closed programs are not holdings. Offers are a separate, explicit request.
  if (!programs?.some((program) => program.is_active !== false) && scope === "wallet") {
    if (!automatic) await stampLooked(supabase, familyId);
    return NextResponse.json({
      step: scope,
      done: true,
      added: 0,
      considered: 0,
      dropped: [],
      note: "Add an active card or program to get tips about what you have. Current offers are only checked when you choose See offers.",
    });
  }

  // What is actually booked, because a spending requirement is only realistic
  // against money that is going to be spent anyway.
  const tripIds = (trips || []).map((t) => t.id);
  const { data: items } = tripIds.length
    ? await supabase
        .from("itinerary_items")
        .select("title, category, location, status, trip_id")
        .in("trip_id", tripIds)
    : { data: [] };

  const sameScope = (existing || []).filter((row) => row.scope === scope);
  // Card names from BOTH scopes, not just this one. A card suggested last month
  // should not be suggested again because the earlier tip was filed under the
  // other heading, and a card they hold should not be suggested at all.
  const namedAlready = [
    ...new Set(
      (existing || [])
        .map((row) => row.about)
        .filter(Boolean)
        .map((name) => `their existing advice about ${name}`),
    ),
  ];

  let produced;
  try {
    produced = await walletTips({
      deadline: startedAt + MODEL_BUDGET_MS,
      place: { family_id: familyId, scope },
      avoid: [...sameScope.map((row) => row.title), ...namedAlready],
      known: (existing || []).map((row) => row.fingerprint),
      // Same subject filter as the trip refresh: earlier wallet titles are
      // matched by subject-word overlap, not just normalised title, so
      // "Chase Sapphire Preferred welcome bonus" and "Sapphire Preferred
      // 60k point offer" collapse to one.
      subjects: sameScope.map((row) => row.title),
      already: sameScope.map((row) => row.title),
      scope,
      today,
      programs: programs || [],
      travelers: (travelers || []).filter((t) => t.is_person !== false),
      trips: trips || [],
      items: items || [],
      preferences: preferences || [],
      offers: liveLedger,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.timedOut
          ? `${error.message} ${
              scope === "offers"
                ? "Checking today's welcome offers means reading the issuers' own pages, which can run past what one request is allowed. Press See offers to try again."
                : "Press Check for pro tips again — anything already found is saved."
            }`
          : error?.message || "The assistant could not be reached.",
        step: scope,
      },
      { status: error?.status || 502 },
    );
  }

  let added = 0;
  if (produced.tips.length) {
    const { data: inserted, error } = await supabase
      .from("pro_tips")
      .insert(produced.tips)
      .select("id, title");
    if (error) {
      return NextResponse.json(
        { error: "Found tips but could not save them.", step: scope },
        { status: 500 },
      );
    }
    added = (inserted || []).length;

    // File the terms beside the tip that carried them, so the advice has a page
    // and a date behind it rather than a claim. An offer we have seen before is
    // refreshed rather than filed twice -- and a decision already recorded
    // against those terms is never written over, because the whole reason for
    // keeping the row is to remember what they said.
    const seen = new Map((ledger || []).map((row) => [row.terms_key, row]));
    const fresh = [];
    for (const row of inserted || []) {
      const offer = produced.offers?.get(row.title);
      if (!offer) continue;
      const prior = seen.get(offer.terms_key);
      if (!prior) {
        fresh.push(ledgerRow({ offer, familyId, tipId: row.id, today }));
        continue;
      }
      // Already answered on exactly these terms. The tip has just been written,
      // so it would otherwise sit on the board carrying a decision the family
      // made months ago, with no button on it -- an offer is answered with "Not
      // this card", and that button needs a live offer behind it. So the new tip
      // inherits the old answer and never appears.
      if (prior.status === "declined" || prior.status === "taken") {
        const { error: settledError } = await supabase
          .from("pro_tips")
          .update({
            status: prior.status === "taken" ? "cleared" : "declined",
            resolved_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (settledError)
          console.error("[tips/wallet] settled tip", settledError.message);
        added = Math.max(0, added - 1);
        continue;
      }
      const { error: touchError } = await supabase
        .from("card_offers")
        .update({
          verified_on: today,
          offer_ends_on: offer.offer_ends_on,
          source_url: offer.source_url,
          source_title: offer.source_title,
          status: "open",
          tip_id: row.id,
        })
        .eq("id", prior.id);
      if (touchError)
        console.error("[tips/wallet] offer touch", touchError.message);
    }
    if (fresh.length) {
      const { error: ledgerError } = await supabase
        .from("card_offers")
        .insert(fresh);
      // Not fatal. The tips are saved and readable; what is lost is the app's
      // memory of having asked, which the next look can rebuild.
      if (ledgerError)
        console.error("[tips/wallet] ledger", ledgerError.message);
    }
  }

  // One line per pass in the platform's log. The question the next time a look
  // appears to do nothing is always the same: was the model asked, did it search,
  // and did anything survive the bar.
  console.log(
    `[tips/wallet] scope=${scope} family=${familyId} model=${
      produced.model || "none"
    } searched=${produced.searched} kept=${added} dropped=${
      produced.dropped.length
    } ms=${Date.now() - startedAt}`,
  );

  if (scope === "wallet" && !automatic) await stampLooked(supabase, familyId);

  return NextResponse.json({
    step: scope,
    done: true,
    added,
    considered: produced.tips.length + produced.dropped.length,
    dropped: produced.dropped,
    searched: produced.searched,
    model: produced.model,
  });
}
