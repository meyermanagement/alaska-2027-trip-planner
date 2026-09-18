import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import PageHeader from "@/components/PageHeader";
import { SCREEN_INTROS } from "@/lib/screenCopy";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import ProTips from "@/components/ProTips";
import ClearedTips from "@/components/ClearedTips";
import { WALLET_SCOPES } from "@/lib/tips/tip";
import RewardsBoard from "./RewardsBoard";
import DeclinedOffers from "./DeclinedOffers";
import WalletTabs from "./WalletTabs";

export const metadata = { title: "Wallet · Alyeska" };

export default async function RewardsPage() {
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

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: travelers }, { data: programs, error: programsError }] =
    await Promise.all([
      supabase
        .from("travelers")
        .select("id, name, sort_order, is_person")
        .eq("is_person", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("rewards_programs")
        .select("*")
        .order("kind", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("brand", { ascending: true }),
    ]);

  // A read that failed and a wallet that is empty are not the same thing, and
  // until now they looked identical on screen: the error was dropped on the
  // floor and the board was handed an empty list, so twenty-one saved programs
  // read as "Nothing added yet". Pass the failure through and let the board say
  // so. Logged as well, because the cause is usually in the request.
  if (programsError) {
    console.error("[wallet] could not read rewards_programs", {
      family: familyId,
      code: programsError.code,
      message: programsError.message,
    });
  }

  // The Wallet's own advice: what to do about the programs they hold, and which
  // welcome offer is worth opening for. Both scopes into one list, because a
  // reader does not care which pass produced a tip, and the sort puts whatever is
  // most pressing first regardless.
  const { data: tips } = await supabase
    .from("pro_tips")
    .select("*")
    .eq("family_id", familyId)
    .in("scope", WALLET_SCOPES)
    .eq("status", "active");

  // The terms behind any offer tip, and the refusals. Both come from one read:
  // the open rows go to the tips so each one can say where it was read and when
  // it ends, and the turned-down rows get their own quiet list further down with
  // a way to put them back on the table.
  const { data: offerRows } = await supabase
    .from("card_offers")
    .select("*")
    .eq("family_id", familyId)
    .in("status", ["open", "declined"])
    .order("verified_on", { ascending: false });
  const openOffers = (offerRows || []).filter((row) => row.status === "open");
  const declinedOffers = (offerRows || []).filter(
    (row) => row.status === "declined",
  );

  // When a look last ran here. Two things read it: the card, to decide whether
  // opening the Wallet should run the look on its own rather than waiting to be
  // asked, and nothing else. The comparison against midnight happens in the
  // browser, because the midnight that matters is the reader's.
  const { data: family } = await supabase
    .from("families")
    .select("wallet_looked_at")
    .eq("id", familyId)
    .maybeSingle();

  // Has anybody ever asked? "No tips" and "not looked yet" want different words,
  // and a cleared tip still counts as having looked.
  const { count: everLooked } = await supabase
    .from("pro_tips")
    .select("id", { count: "exact", head: true })
    .eq("family_id", familyId)
    .in("scope", WALLET_SCOPES);

  return (
    <>
      <TopBar />
      <main className="screen px-5 pb-16 pt-7">
        {/* Passport numbers, Global Entry, licenses and the membership numbers
            themselves are kept on each person rather than here, and this is the
            screen people come to looking for them. Phrased as the question they
            arrived with rather than as a place name, because somebody who
            already knew documents lived on Family would not be standing here.

            It used to carry a count of the documents on file. A question and a
            number answer two different things, and the number needed a whole
            extra read of traveler_documents to say something nobody was asking
            on this screen, so both are gone. */}
        <PageHeader
          title="Wallet"
          subtitle={SCREEN_INTROS.wallet}
          action={
            <Link href="/family" className="btn btn-ghost w-full sm:w-auto">
              Looking for travel documents?
            </Link>
          }
        />
        {/* autoLook: the Wallet is the one screen whose whole job is noticing
            things nobody asked about -- a credit going unused, points about to
            lapse, a fee coming round -- so opening it runs the look, the way
            opening a trip does. Once a day, judged against wallet_looked_at,
            because it is two grounded model calls and the family opens this
            screen more often than the answers change. */}
        <ProTips
          tips={tips || []}
          offers={openOffers}
          today={today}
          scope="wallet"
          canLook
          everLooked={Boolean(everLooked)}
          autoLook
          lastLookedAt={family?.wallet_looked_at || null}
          heading="Pro tips"
          chain={[{ scope: "wallet" }, { scope: "offers" }]}
          emptyLooked="Nothing worth telling you about the Wallet right now. Tips appear when a credit is going unused, points are about to lapse, a fee is coming round, or a welcome bonus on a card you do not hold is worth the spending you already have planned."
          emptyFresh={
            programs?.length
              ? "Nothing here yet. Ask for a look and Aly will go through what you hold — expiring points, unspent credits, fees against the perks you actually use — and check what today's welcome offers are on cards you do not have."
              : "Nothing saved here yet, which is fine — ask for a look anyway. With an empty Wallet Aly answers the beginner's question instead: which travel card to open first, why that one, what the bonus is today and what it costs to keep, read off the issuer's own page rather than remembered."
          }
        />
        {/* The live advice stays above the tabs, because it is the answer to the
            question people open this screen with, and a tab strip over the top of
            it would put a press between them and it. Everything below the strip
            is either what you hold or what you have already dealt with, which is
            a real fork and worth two doors.

            historyCount counts only the refusals, which are read on the server
            here. The cleared tips are fetched by the browser the first time the
            tab is opened, so counting them would mean a second read of pro_tips
            on every load of a screen most people never take that turning on. A
            number that is sometimes short is better than a read nobody uses. */}
        <WalletTabs
          historyCount={declinedOffers.length}
          cards={
            <RewardsBoard
              familyId={familyId}
              travelers={travelers || []}
              programs={programs || []}
              unreadable={Boolean(programsError)}
            />
          }
          history={
            <div className="space-y-8">
              <DeclinedOffers offers={declinedOffers} bare />
              <ClearedTips wallet bare />
            </div>
          }
        />
        {/* Said once, at the bottom, rather than on every card. A welcome offer
            is a moving target and the only page that is authoritative about it is
            the issuer's own. */}
        <p className="mt-6 text-xs leading-relaxed text-ink-faint">
          Anything above about a card&rsquo;s welcome bonus was read off a page
          on the day it was found, and offers change without notice. Check the
          issuer&rsquo;s own application page before you apply. Aly is a travel
          planner, not a financial advisor, and none of this is advice about
          your credit.
        </p>
      </main>
      <AskAlyGeneral focus="rewards" />
    </>
  );
}
