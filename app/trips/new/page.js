import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import { tripPath } from "@/lib/trips/route";
import { whenText } from "@/lib/trips/basics";
import { ideaFromPlace } from "@/lib/someday/idea";
import TripBuilderStart from "./TripBuilderStart";

export const metadata = { title: "Trip builder · Alyeska" };

/**
 * A screen of its own, rather than the modal it used to be.
 *
 * The old New trip form was a sheet over the trips list, which is the right shape
 * for a short confirmation and the wrong one for a conversation. It could not show
 * the examples at full length, it could not show the six things a trip is made of,
 * and on a phone it covered the whole screen anyway -- so it was a screen already,
 * pretending not to be.
 *
 * A secondary traveler cannot create a trip. The database refuses the insert
 * outright, so this sends them back rather than showing them a box that would
 * spend a conversation and then fail at the last step.
 */
export default async function NewTripPage({ searchParams }) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  if (!memberships || memberships.length === 0) redirect("/join");

  const access = await resolveAccess(supabase, user);

  if (access?.can?.isSecondary) redirect("/trips");

  // The drafts this household already has, named on this screen above the box.
  //
  // This is the guard against the same trip being started twice. Somebody who
  // opens the builder to carry on with Portugal has no way of telling from an
  // empty box that Portugal is already in here -- so the drafts are listed
  // first, each one a link into the trip it belongs to, and only under them is
  // there a box for something new. Ordered by when they were last touched, so
  // the one being worked on is at the top.
  const { data: draftRows } = await supabase
    .from("trips")
    .select(
      "id, name, slug, public_id, cover_emoji, destination, date_note, start_date, end_date, updated_at",
    )
    .eq("family_id", access?.familyId || "")
    .eq("status", "draft")
    .order("updated_at", { ascending: false });

  const drafts = (draftRows || []).map((trip) => ({
    key: trip.id,
    name: trip.name,
    emoji: trip.cover_emoji,
    href: tripPath(trip),
    when: whenText(trip),
    destination: trip.destination,
  }));

  // A place carried in from the bucket list, as a sentence rather than a set of
  // query parameters. The card links here with the row's id and the paragraph is
  // built on the server, so the text cannot be edited in the address bar and it
  // cannot go stale between the two screens. Read through the same family scope
  // as everything else: an id from somebody else's household finds nothing and
  // the box simply opens empty.
  const from = (await searchParams)?.from;
  let seed = "";
  let fromPlace = "";
  if (typeof from === "string" && from) {
    const { data: place } = await supabase
      .from("someday_places")
      .select(
        "place, why, months, nights, fare_ceiling, traveler_ids, priority",
      )
      .eq("id", from)
      .eq("family_id", access?.familyId || "")
      .maybeSingle();
    if (place) {
      const { data: people } = await supabase
        .from("travelers")
        .select("id, name")
        .eq("is_person", true);
      seed = ideaFromPlace(place, people || []);
      fromPlace = place.place;
    }
  }

  return (
    <>
      <TopBar />
      <main className="screen px-5 pb-24 pt-7">
        <TripBuilderStart drafts={drafts} seed={seed} fromPlace={fromPlace} />
      </main>
      {/* The conversation opens here, on this screen, so the answer arrives where
          the question was asked. */}
      <AskAlyGeneral focus="new_trip" />
    </>
  );
}
