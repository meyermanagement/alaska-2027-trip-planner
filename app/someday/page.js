import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import PageHeader from "@/components/PageHeader";
import { SCREEN_INTROS } from "@/lib/screenCopy";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import { SOMEDAY_FOCUS } from "@/lib/agent/context";
import SomedayList from "./SomedayList";
import SomedayTabs from "./SomedayTabs";
import Deals from "@/components/Deals";
import ForwardFares from "@/components/ForwardFares";
import { inboxAddressFor } from "@/lib/inbox/address";
import { FARE_SELECT, judged, readDealWorld } from "@/lib/deals/world";
import { fittingMentions } from "@/lib/deals/mentions";

export const metadata = { title: "Bucket list & fares · Alyeska" };

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
      .select("id, name, slug, public_id, status, start_date, end_date")
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
    .select(FARE_SELECT)
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });
  const world = deals?.length ? await readDealWorld(supabase, familyId) : null;
  const fares = world ? judged(deals, world) : [];

  // Alerts that saved no fare but still name a place on this list in a season
  // this list asked for. Nothing here is a fare -- no price was printed, so none
  // is claimed -- but a match on place and month is what the family would have
  // judged anyway, and it belongs on the fares list rather than only in history.
  const { data: noted } = await supabase
    .from("inbox_messages")
    .select("id, subject, from_name, from_email, received_at, text_body")
    .eq("family_id", familyId)
    .eq("status", "noted")
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(60);
  // The airports they fly from, so a card can price the one departure in the
  // email that is theirs rather than every city the newsletter quotes.
  const { data: homeAirports } = await supabase
    .from("home_airports")
    .select("code")
    .eq("family_id", familyId);
  const priced = new Set();
  if (noted?.length) {
    const { data: rows } = await supabase
      .from("flight_deals")
      .select("message_id")
      .eq("family_id", familyId)
      .in("message_id", noted.map((row) => row.id));
    for (const row of rows || []) if (row.message_id) priced.add(row.message_id);
  }
  const mentions = (noted || [])
    .filter((row) => row.text_body && !priced.has(row.id))
    .map((row) => {
      const match = fittingMentions(row.text_body, places || [], { airports: homeAirports || [] });
      return match ? {
        id: row.id,
        subject: row.subject || "A fare alert",
        sourceName: row.from_name || row.from_email || "",
        receivedAt: row.received_at,
        places: match.places,
        monthsSaid: match.monthsSaid,
        fare: match.fare,
      } : null;
    })
    .filter(Boolean);

  return (
    <>
      <TopBar />
      <main className="screen px-5 pb-16 pt-7">
        <PageHeader
          title="Bucket list & fares"
          count={(places || []).length || undefined}
          subtitle={SCREEN_INTROS.bucketList}
        />

        <SomedayTabs
          fareCount={fares.filter((deal) => deal.status === "open").length + mentions.length}
          places={<SomedayList familyId={familyId} places={places || []}
            travelers={people || []} trips={trips || []} />}
          fares={<>
            {fares.length || mentions.length ? <Deals deals={fares} trips={trips || []} places={places || []} mentions={mentions} />
              : <div className="card p-5">
                <h2 className="font-display text-lg font-semibold">No fare alerts yet</h2>
                <p className="mt-1 text-sm text-ink-soft">Forward a flight deal to Aly. Matching fares will appear here.</p>
              </div>}
            <ForwardFares address={inboxAddressFor(household?.inbox_local_part)} />
          </>}
        />
      </main>
      <AskAlyGeneral focus={SOMEDAY_FOCUS} />
    </>
  );
}
