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
// browser asks twice — once for the programs they hold, once for the offers on
// cards they do not — and the loop that does the asking is the same one the trip
// button uses.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/reminders";
import { resolveAccess } from "@/lib/travelers/access";
import { WALLET_SCOPES } from "@/lib/tips/tip";
import { walletTips } from "@/lib/tips/wallet";

export const runtime = "nodejs";
export const maxDuration = 120;

// What the model may have of the request. The rest pays for the five reads
// before it and the writes after, and for answering in words rather than being
// cut off mid-sentence by the platform, which the browser can only report as a
// failed load.
const MODEL_BUDGET_MS = 55000;

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
  if (access?.can.isSecondary)
    return bad("Only a primary traveler can look for wallet tips.", 403);

  const today = todayISO();

  const [
    { data: programs },
    { data: travelers },
    { data: trips },
    { data: preferences },
    { data: existing },
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
  ]);

  // An empty Wallet stops only half the question. There is nothing to say about
  // programs they do not have, but "which card should we open first" is exactly
  // the question somebody with nothing asks, and the offers pass answers it -- the
  // brief and the rules switch to a first-card footing rather than refusing.
  if (!programs?.length && scope === "wallet") {
    return NextResponse.json({
      step: scope,
      done: true,
      added: 0,
      considered: 0,
      dropped: [],
      note: "Nothing is saved in the Wallet yet, so there was nothing to say about what you already hold. The card offers were still checked, and nothing on offer today was worth telling you to open — which happens, and is a real answer.",
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
      already: sameScope.map((row) => row.title),
      scope,
      today,
      programs: programs || [],
      travelers: (travelers || []).filter((t) => t.is_person !== false),
      trips: trips || [],
      items: items || [],
      preferences: preferences || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.timedOut
          ? `${error.message} ${
              scope === "offers"
                ? "Checking today's welcome offers means reading the issuers' own pages, which can run past what one request is allowed. Press Look for tips again."
                : "Press Look for tips again — anything already found is saved."
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
      .select("id");
    if (error) {
      return NextResponse.json(
        { error: "Found tips but could not save them.", step: scope },
        { status: 500 },
      );
    }
    added = (inserted || []).length;
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
