import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import { SOMEDAY_FOCUS } from "@/lib/agent/context";
import SomedayList from "./SomedayList";

export const metadata = { title: "Someday list · Alyeska" };

/**
 * The places this household wants to go, and what would make each one worth it.
 *
 * Every travel app asks for a wish list on the way in and then does nothing with
 * it, which is why the list here is not a list of place names. A place name alone
 * cannot be acted on: knowing that a family likes the idea of Japan tells you
 * nothing about whether the fare in front of you is good news. The months they
 * could actually go, how many nights it is worth, and the most they would pay per
 * person are what turn a wish into something an app can watch for.
 *
 * It also lives one door from the trips it becomes. A someday place that gets
 * booked is not deleted -- it is marked, and it keeps the trip it turned into, so
 * the list slowly becomes a record of the ideas that happened as well as the ones
 * still waiting.
 */
export default async function SomedayPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  if (!memberships || memberships.length === 0) redirect("/join");

  // A secondary traveler cannot read the household's wish list under the
  // policies, so this screen would be a set of empty panels for them.
  const access = await resolveAccess(supabase, user);
  if (access?.can.isSecondary) redirect("/trips");
  const familyId = memberships[0].family_id;

  const [{ data: places }, { data: people }, { data: trips }] =
    await Promise.all([
      supabase
        .from("someday_places")
        .select("*")
        .eq("family_id", familyId)
        .order("status", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("travelers")
        .select("id, name, sort_order")
        .eq("is_person", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("trips")
        .select("id, name, slug")
        .eq("family_id", familyId)
        .order("start_date", { ascending: true }),
    ]);

  return (
    <>
      <TopBar />
      <main className="screen px-5 pb-16 pt-7">
        <h1 className="mb-1 font-display text-3xl font-semibold">
          Someday list
        </h1>
        <p className="mb-6 max-w-2xl text-sm text-ink-soft">
          Places you want to go, and what would make each one worth doing. The
          months, the length and the fare you would pay are the difference
          between a wish and something Aly can tell you about when it happens.
        </p>

        <SomedayList
          familyId={familyId}
          places={places || []}
          travelers={people || []}
          trips={trips || []}
        />
      </main>
      <AskAlyGeneral focus={SOMEDAY_FOCUS} />
    </>
  );
}
