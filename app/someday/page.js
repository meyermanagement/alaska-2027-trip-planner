import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import { SOMEDAY_FOCUS } from "@/lib/agent/context";
import SomedayList from "./SomedayList";
import Deals from "@/components/Deals";
import ForwardFares from "@/components/ForwardFares";
import { inboxAddressFor } from "@/lib/inbox/address";
import { judged, readDealWorld } from "@/lib/deals/world";

export const metadata = { title: "Bucket list · Alyeska" };

/**
 * The places this household wants to go, and what would make each one worth it.
 *
 * Every travel app asks for a wish list on the way in and then does nothing with
 * it, which is why the list here is not a list of place names. A place name alone
 * cannot be acted on: knowing that a family likes the idea of Japan tells you
 * nothing about whether the fare in front of you is good news. The months they
 * could actually go and who it is for are what turn a wish into something a fare
 * can be judged against. That is what the line under the heading now says out
 * loud, because the one thing this screen does that no other wish list does was
 * being described as the difference between a wish and something Aly can tell
 * you about, which names no capability anybody would go looking for. The nights and the airfare ceiling are still columns and
 * Aly still fills them from what people say, but the form stopped asking: nothing
 * checks fares on a schedule yet, so the screen was collecting numbers that
 * changed nothing.
 *
 * It also lives one door from the trips it becomes. A bucket-list place that gets
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

  const [
    { data: places },
    { data: people },
    { data: trips },
    { data: household },
  ] = await Promise.all([
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
    // The household's own forwarding address, so the drawer at the foot of this
    // screen can hand it over without a trip to /inbox first.
    supabase
      .from("families")
      .select("inbox_local_part")
      .eq("id", familyId)
      .maybeSingle(),
  ]);

  // Only households who have had a fare forwarded pay for the reading behind a
  // verdict.
  // The verdicts themselves are worked out here, on every load, rather than
  // stored: a fare that was under budget in September is not under budget after
  // the hotel goes on, and a card that says otherwise is worse than no card.
  const { data: deals } = await supabase
    .from("flight_deals")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });
  const world = deals?.length ? await readDealWorld(supabase, familyId) : null;
  const fares = world ? judged(deals, world) : [];

  return (
    <>
      <TopBar />
      <main className="screen px-5 pb-16 pt-7">
        <h1 className="mb-1 font-display text-3xl font-semibold">
          Bucket list
        </h1>
        <p className="mb-6 max-w-2xl text-sm text-ink-soft">
          Places you want to go, and the months you could actually go in.
          Forward the flight deal emails you already get and Aly reads every
          fare in them, keeps the ones leaving from your airports for a place on
          this list in a month that suits you, and says here whether the price
          is worth it.
        </p>

        {fares.some((deal) => deal.status === "open") ? (
          <div className="mb-8">
            <Deals deals={fares} trips={trips || []} />
          </div>
        ) : null}

        <SomedayList
          familyId={familyId}
          places={places || []}
          travelers={people || []}
          trips={trips || []}
        />

        {fares.some((deal) => deal.status === "open") ? null : (
          <div className="mt-8">
            <Deals deals={fares} trips={trips || []} />
          </div>
        )}

        <ForwardFares address={inboxAddressFor(household?.inbox_local_part)} />
      </main>
      <AskAlyGeneral focus={SOMEDAY_FOCUS} />
    </>
  );
}
