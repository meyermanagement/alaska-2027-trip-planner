// Turning a fare down, or putting it on a trip.
//
// The two things a family does with a fare that has been judged, and the reason
// the row is not deleted in either case. A refusal is a fact about them that is
// still true next month -- they saw $412 to Lisbon in April and said no -- and an
// app that forgets it will put the same fare in front of them again in a week.
// Taking one is the other half: the fare stops being a question and becomes part
// of a trip, and the row keeps which trip so the answer to "what did we decide
// about that Lisbon fare" is still in here.
//
// No verdict is written down here either. A taken fare keeps its price and its
// dates, and everything said about it is worked out again from the trips, budget
// and roster as they stand whenever somebody looks.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import { canAttachFare, canAttachFareToPlace } from "@/lib/deals/targets";
import { tripPath } from "@/lib/trips/route";

export const runtime = "nodejs";

const ALLOWED = new Set(["open", "dismissed", "taken"]);

export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId || access.can.isSecondary)
    return NextResponse.json({ error: "You cannot change fares." }, { status: 403 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const status = typeof body?.status === "string" ? body.status : "";
  if (!ALLOWED.has(status))
    return NextResponse.json(
      { error: "That is not something a fare can become." },
      { status: 400 },
    );

  const reason =
    typeof body?.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 300)
      : null;
  const tripId = typeof body?.trip_id === "string" ? body.trip_id : null;
  const placeId = typeof body?.someday_id === "string" ? body.someday_id : null;
  let destinationUrl = null;
  if (status === "taken") {
    if (Boolean(tripId) === Boolean(placeId))
      return NextResponse.json({ error: "Choose one trip or bucket-list place." }, { status: 400 });
    if (tripId) {
      const { data: trip } = await supabase.from("trips")
        .select("id, name, slug, public_id, status, start_date, end_date")
        .eq("id", tripId).eq("family_id", access.familyId).maybeSingle();
      if (!canAttachFare(trip))
        return NextResponse.json({ error: "Choose a draft or upcoming trip. Past and current trips cannot receive this fare." }, { status: 400 });
      destinationUrl = `${tripPath(trip, "overview")}#fares`;
    } else {
      const { data: place } = await supabase.from("someday_places")
        .select("id, status").eq("id", placeId).eq("family_id", access.familyId).maybeSingle();
      if (!canAttachFareToPlace(place))
        return NextResponse.json({ error: "Choose an open bucket-list place." }, { status: 400 });
      destinationUrl = "/someday#saved-fares";
    }
  }

  // Row-level security does the ownership check, the same way the offers route
  // relies on it: for a household this person is not in, the update matches no
  // rows and comes back empty rather than saving anything.
  const patch =
    status === "open"
      ? { status, dismissed_reason: null, trip_id: null }
      : status === "dismissed"
        ? { status, dismissed_reason: reason }
        : { status, trip_id: tripId, ...(placeId ? { someday_id: placeId } : {}), dismissed_reason: null };

  const { data: deal, error } = await supabase
    .from("flight_deals")
    .update({ ...patch, updated_by: user.id })
    .eq("id", id)
    .eq("family_id", access.familyId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("deal update failed", error);
    return NextResponse.json({ error: "That did not save." }, { status: 500 });
  }
  if (!deal)
    return NextResponse.json({ error: "That fare is gone." }, { status: 404 });

  return NextResponse.json({ deal, destinationUrl });
}
