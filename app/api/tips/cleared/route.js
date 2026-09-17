// The list of tips you have put away, fetched only when somebody asks for it.
//
// Its own route rather than part of a page load, because the list is shut by
// default and most days nobody opens it. Making every visit pay for a query
// nobody reads would be the wrong trade.
//
// It takes a filter now, because the record moved. It used to sit once, at the
// bottom of Reminders, listing everything the household had ever cleared with
// the trip named beside each line -- which meant the one place you could look
// something up was the one screen it had nothing to do with. The record now sits
// where the advice itself sits: the trip's own Tips tab for that trip, and the
// Wallet for the Wallet's. So the query is asked for a trip, or for the Wallet,
// rather than for everything.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WALLET_SCOPES } from "@/lib/tips/tip";

export const runtime = "nodejs";

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const tripId = params.get("trip");
  const wallet = params.get("wallet") === "1";

  // One of the two, never neither. An unfiltered fetch is the behavior this
  // route just stopped having, and answering it anyway would let a caller
  // quietly rebuild the list in the wrong place.
  if (!tripId && !wallet) {
    return NextResponse.json(
      { error: "Ask about a trip or the Wallet." },
      { status: 400 },
    );
  }

  let query = supabase
    .from("pro_tips")
    .select(
      "id, title, body, because, urgency, act_by, scope, about, sources, resolved_at, trip_id, trips (name, slug, public_id)",
    )
    // Ignore was retired, but rows that were ignored while it existed are the same
    // kind of thing as a cleared one and belong in the same list rather than
    // disappearing along with the button.
    .in("status", ["cleared", "ignored"])
    .order("resolved_at", { ascending: false })
    .limit(60);

  if (wallet) {
    // The Wallet has no trip behind it, and the database refuses a wallet tip
    // with a trip on it, so the scope filter is enough on its own.
    query = query.in("scope", WALLET_SCOPES);
  } else {
    // Everything cleared on this trip, whatever screen it was cleared on. A tip
    // about the ferry and a tip about the suitcase were both judgements about
    // this holiday, and somebody wondering six months on what the app stopped
    // mentioning is wondering about the holiday, not about a tab.
    query = query.eq("trip_id", tripId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Could not fetch those." },
      { status: 500 },
    );
  }
  return NextResponse.json({ tips: data || [] });
}
