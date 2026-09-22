// Putting an alert's own stated fare on a trip.
//
// Some alerts price their departure cities and then list onward cities with
// nothing against any of them. The fare reader saves nothing from those, and
// rightly: it cannot say what Oslo costs. But the same email says outright that
// every one of those fares is nonstop to one hub at a quoted number of points, so
// departure-to-hub is stated, and a household should be able to keep it.
//
// The pairing is the one thing the email leaves open, so the person supplies it:
// which of the priced airports they are leaving from, and which of the listed
// cities they are going to. Everything else -- the points, the program, the
// airline, the cabin, the months -- is read here, on the server, from the stored
// message. A client that could post its own numbers would be a way to write any
// fare into the household's file and have the app credit the newsletter for it,
// and the chosen airport and city are checked against the email's own lists for
// the same reason.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import { canAttachFare, canAttachFareToPlace } from "@/lib/deals/targets";
import { tripPath } from "@/lib/trips/route";
import { alertMonths, fareChoices } from "@/lib/deals/mentions";
import { fareSourceFor } from "@/lib/deals/senders";

export const runtime = "nodejs";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId || access.can.isSecondary)
    return NextResponse.json({ error: "You cannot change fares." }, { status: 403 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const messageId = typeof body?.message_id === "string" ? body.message_id : "";
  const origin = typeof body?.origin === "string" ? body.origin.toUpperCase() : "";
  const to = typeof body?.destination_code === "string" ? body.destination_code.toUpperCase() : "";
  const tripId = typeof body?.trip_id === "string" ? body.trip_id : null;
  const placeId = typeof body?.someday_id === "string" ? body.someday_id : null;
  const reason = typeof body?.reason === "string" && body.reason.trim()
    ? body.reason.trim().slice(0, 300)
    : null;
  const dismissing = body?.status === "dismissed";
  if (!messageId)
    return NextResponse.json({ error: "Which alert?" }, { status: 400 });
  if (!dismissing && Boolean(tripId) === Boolean(placeId))
    return NextResponse.json({ error: "Choose one trip or bucket-list place." }, { status: 400 });

  const { data: message } = await supabase
    .from("inbox_messages")
    .select("id, family_id, subject, from_email, from_name, received_at, text_body")
    .eq("id", messageId)
    .eq("family_id", access.familyId)
    .maybeSingle();
  if (!message)
    return NextResponse.json({ error: "That email is gone." }, { status: 404 });

  const { data: airports } = await supabase
    .from("home_airports")
    .select("code")
    .eq("family_id", access.familyId);
  const choices = fareChoices(message.text_body || "", airports || []);
  if (!choices)
    return NextResponse.json(
      { error: "This email does not price an airport you fly from." },
      { status: 409 },
    );
  // Turning the alert down needs no pairing: the refusal is about the offer, not
  // about a route they were considering. It is filed against the airport the
  // email prices for them and the city it says those fares fly nonstop to, so
  // the row still reads like the email it came from.
  const fallbackTo = choices.destinations.find((row) => row.code === choices.nonstop)
    || choices.destinations[0];
  const from = choices.departures.find((row) => row.code === origin)
    || (dismissing ? choices.departures.slice().sort((a, b) => a.points - b.points)[0] : null);
  const going = choices.destinations.find((row) => row.code === to)
    || (dismissing ? fallbackTo : null);
  if (!from || !going)
    return NextResponse.json(
      { error: "Choose a departure airport and a city this email lists." },
      { status: 400 },
    );

  // One row per email: pressing the button twice, or on two devices, keeps one
  // fare rather than filling the trip with copies of the same offer.
  const { data: already } = await supabase
    .from("flight_deals")
    .select("id")
    .eq("family_id", access.familyId)
    .eq("message_id", message.id)
    .eq("origin", from.code)
    .eq("destination_code", going.code)
    .maybeSingle();

  let destinationUrl = null;
  if (tripId) {
    const { data: trip } = await supabase
      .from("trips")
      .select("id, name, slug, public_id, status, start_date, end_date")
      .eq("id", tripId).eq("family_id", access.familyId).maybeSingle();
    if (!canAttachFare(trip))
      return NextResponse.json({ error: "Choose a draft or upcoming trip. Past and current trips cannot receive this fare." }, { status: 400 });
    destinationUrl = `${tripPath(trip, "overview")}#fares`;
  } else if (placeId) {
    const { data: place } = await supabase
      .from("someday_places")
      .select("id, status").eq("id", placeId).eq("family_id", access.familyId).maybeSingle();
    if (!canAttachFareToPlace(place))
      return NextResponse.json({ error: "Choose an open bucket-list place." }, { status: 400 });
    destinationUrl = "/someday#saved-fares";
  }

  const row = {
    family_id: access.familyId,
    message_id: message.id,
    origin: from.code,
    destination: going.city,
    destination_code: going.code,
    price: null,
    price_basis: "unspecified",
    award_pricing: {
      options: [{
        program: choices.program || "Points",
        points_min: from.points,
        points_max: from.points,
        points_unit: choices.unit,
        points_basis: "one_way",
        route_text: from.said,
        cash_basis: "unspecified",
        pricing_text: `${from.said} each way. The email prices departure cities and lists ${going.city} as a destination without a price of its own, so this pairing was chosen here, not quoted.`,
      }],
    },
    cabin: choices.cabin,
    airline: choices.airline,
    travel_months: alertMonths(message.text_body || "") || null,
    source_name: fareSourceFor(message.from_email)?.name || message.from_name || "Forwarded fare alert",
    notes: `Points are the ${from.code} price the email prints${choices.nonstop === going.code ? ", quoted nonstop to this city" : `; ${going.city} is listed as a destination without its own price`}. Confirm availability before transferring points.`,
    status: dismissing ? "dismissed" : "taken",
    dismissed_reason: dismissing ? reason : null,
    trip_id: dismissing ? null : tripId,
    someday_id: dismissing ? null : placeId,
    created_by: user.id,
    updated_by: user.id,
  };

  const query = already
    ? supabase.from("flight_deals").update(row).eq("id", already.id).eq("family_id", access.familyId)
    : supabase.from("flight_deals").insert(row);
  const { data: deal, error } = await query.select("*").maybeSingle();
  if (error || !deal) {
    console.error("fare from alert failed", error);
    return NextResponse.json({ error: "That did not save." }, { status: 500 });
  }
  return NextResponse.json({ deal, destinationUrl });
}
