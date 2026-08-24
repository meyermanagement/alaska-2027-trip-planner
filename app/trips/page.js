import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import { formatRange, daysUntil } from "@/lib/format";
import NewTripButton from "./NewTripButton";
import AskAlyGeneral from "./AskAlyGeneral";

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

  function progress(rows, tripId, doneKey) {
    const mine = (rows || []).filter((r) => r.trip_id === tripId);
    const done = mine.filter((r) => r[doneKey]).length;
    return { done, total: mine.length };
  }

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
          {(trips || []).map((trip) => {
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
                <div className="mt-4 flex flex-wrap gap-2 border-t border-sand-deep pt-3 text-xs font-semibold text-ink-soft">
                  <span>
                    Packing {packing.done}/{packing.total}
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    Tasks {tasks.done}/{tasks.total}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      <AskAlyGeneral />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
