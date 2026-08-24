import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import { formatRange, daysUntil, isPastTrip } from "@/lib/format";
import NewTripButton from "./NewTripButton";
import AskAlyGeneral from "@/components/AskAlyGeneral";

export const metadata = { title: "Trips · Alyeska" };

export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id, families(id, name, invite_code)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/join");

  const family = memberships[0].families;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: trips } = await supabase
    .from("trips")
    .select(
      "id, name, slug, destination, start_date, end_date, cover_emoji, summary, status",
    )
    .order("start_date", { ascending: true });

  const { data: counts } = await supabase
    .from("packing_items")
    .select("trip_id, is_packed");
  const { data: taskRows } = await supabase
    .from("predeparture_tasks")
    .select("trip_id, is_done");
  const { data: itineraryRows } = await supabase
    .from("itinerary_items")
    .select("trip_id");
  const { data: people } = await supabase
    .from("travelers")
    .select("id, name, sort_order, is_person")
    .eq("is_person", true)
    .order("sort_order", { ascending: true });
  const { data: rosters } = await supabase
    .from("trip_travelers")
    .select("trip_id, traveler_id");

  function progress(rows, tripId, doneKey) {
    const mine = (rows || []).filter((r) => r.trip_id === tripId);
    const done = mine.filter((r) => r[doneKey]).length;
    return { done, total: mine.length };
  }

  const isPast = (trip) => isPastTrip(trip);

  // Who is on each trip, in the family's usual order.
  function travelerNames(tripId) {
    const ids = (rosters || [])
      .filter((r) => r.trip_id === tripId)
      .map((r) => r.traveler_id);
    return (people || []).filter((p) => ids.includes(p.id)).map((p) => p.name);
  }

  const upcoming = (trips || []).filter((t) => !isPast(t));
  // Most recently finished first, so the last trip is the one you see.
  const past = (trips || [])
    .filter(isPast)
    .sort((a, b) => (b.end_date || "").localeCompare(a.end_date || ""));

  return (
    <>
      {/* No askHref: the button opens the drawer here, in general context. */}
      <TopBar />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-7">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">Our trips</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Everything below is shared live with everyone in the family group.
            </p>
          </div>
          <NewTripButton familyId={family.id} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {upcoming.map((trip) => {
            const packing = progress(counts, trip.id, "is_packed");
            const tasks = progress(taskRows, trip.id, "is_done");
            const countdown = daysUntil(trip.start_date);
            return (
              <Link
                key={trip.id}
                href={`/trips/${trip.slug}`}
                className="card group flex flex-col p-5 transition hover:border-teal/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-3xl">{trip.cover_emoji}</span>
                  {countdown !== null && countdown >= 0 && (
                    <span className="chip bg-teal-soft text-teal">
                      {countdown} days away
                    </span>
                  )}
                </div>
                <h2 className="font-display mt-3 text-xl font-semibold group-hover:text-teal">
                  {trip.name}
                </h2>
                <p className="mt-0.5 text-sm font-medium text-ink-soft">
                  {formatRange(trip.start_date, trip.end_date)}
                </p>
                {trip.destination && (
                  <p className="mt-2 text-sm text-ink-soft">
                    {trip.destination}
                  </p>
                )}
                {trip.summary && (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-soft">
                    {trip.summary}
                  </p>
                )}
                <div className="mt-4 border-t border-sand-deep pt-3 text-xs font-semibold text-ink-soft">
                  <div className="flex flex-wrap gap-2">
                    <span>
                      Packing {packing.done}/{packing.total}
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      Tasks {tasks.done}/{tasks.total}
                    </span>
                  </div>
                  <p className="mt-1.5 font-normal">
                    {travelerNames(trip.id).length
                      ? `Going: ${travelerNames(trip.id).join(", ")}`
                      : "Nobody added yet"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {upcoming.length === 0 && (
          <p className="card p-5 text-sm text-ink-soft">
            No trips coming up. Start one whenever you are ready.
          </p>
        )}

        {past.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg font-semibold text-ink-soft">
                Past trips
              </h2>
              <span className="h-px flex-1 bg-sand-deep" aria-hidden="true" />
              <span className="text-xs font-semibold text-ink-soft">
                {past.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              Kept for the record — itineraries, packing lists and notes are all
              still here.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((trip) => {
                const stops = (itineraryRows || []).filter(
                  (r) => r.trip_id === trip.id,
                ).length;
                const packing = progress(counts, trip.id, "is_packed");
                return (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.slug}`}
                    className="group flex flex-col rounded-2xl border border-sand-deep bg-sand/60 p-4 transition hover:border-teal/40 hover:bg-white hover:shadow-md"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl opacity-80">
                        {trip.cover_emoji}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display truncate text-base font-semibold group-hover:text-teal">
                          {trip.name}
                        </h3>
                        <p className="text-xs font-medium text-ink-soft">
                          {formatRange(trip.start_date, trip.end_date)}
                        </p>
                      </div>
                    </div>
                    {trip.destination && (
                      <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                        {trip.destination}
                      </p>
                    )}
                    <div className="mt-3 border-t border-sand-deep pt-2.5 text-[0.7rem] font-semibold text-ink-soft">
                      <div className="flex flex-wrap gap-2">
                        <span>
                          {stops} {stops === 1 ? "stop" : "stops"}
                        </span>
                        {packing.total > 0 && (
                          <>
                            <span aria-hidden>·</span>
                            <span>{packing.total} things packed</span>
                          </>
                        )}
                      </div>
                      {travelerNames(trip.id).length > 0 && (
                        <p className="mt-1 font-normal">
                          Went: {travelerNames(trip.id).join(", ")}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
      <AskAlyGeneral />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
