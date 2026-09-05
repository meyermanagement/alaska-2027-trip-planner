import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import Preferences from "./Preferences";
import { isDraftTrip, isPastTrip } from "@/lib/format";

export const metadata = { title: "Travel preferences · Alyeska" };

// Reviews used to be the bottom half of this screen. They have their own page
// again -- /reviews -- because how the family likes to travel and what they
// thought of one hotel are two different questions, and the second half was
// pushing the first one off the top of a phone.
export default async function PreferencesPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  if (!memberships || memberships.length === 0) redirect("/join");

  // A secondary traveler has no read access to what this screen is made of, so
  // the page would render as a set of empty panels. Sending them somewhere real
  // is kinder than showing them a room they cannot enter.
  const access = await resolveAccess(supabase, user);
  if (access?.can.isSecondary) redirect("/trips");
  const familyId = memberships[0].family_id;

  const [{ data: preferences }, { data: people }] = await Promise.all([
    supabase
      .from("travel_preferences")
      .select("*")
      .order("topic", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("travelers")
      .select("id, name, sort_order")
      .eq("is_person", true)
      .order("sort_order", { ascending: true }),
  ]);

  const [{ data: trips }, { data: rosters }] = await Promise.all([
    supabase
      .from("trips")
      .select(
        "id, name, slug, public_id, start_date, end_date, cover_emoji, status",
      )
      // Scoped to the household this screen is showing. Row-level security
      // already keeps other people's trips out; this keeps the reader's *other*
      // household out, which matters as soon as anybody belongs to two.
      .eq("family_id", familyId),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
  ]);

  // The trips worth filtering preferences by are the ones still to come, soonest
  // first: the question this answers is "what will Aly plan Alaska with", and a
  // trip already taken cannot be planned.
  const prefTrips = (trips || [])
    .filter((t) => !isPastTrip(t) && !isDraftTrip(t))
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-7">
        <h1 className="mb-6 font-display text-3xl font-semibold">
          Travel preferences
        </h1>

        <Preferences
          familyId={familyId}
          travelers={people || []}
          preferences={preferences || []}
          trips={prefTrips}
          rosters={rosters || []}
        />
      </main>
      <AskAlyGeneral />
    </>
  );
}
