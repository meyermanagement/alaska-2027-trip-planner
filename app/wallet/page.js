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
import WalletAddButton from "@/components/WalletAddButton";

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

  // Read together, display separately: owned-program advice is not a new offer.
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

  // Has anybody ever asked? "No tips" and "not looked yet" want different words,
  // and a cleared tip still counts as having looked.
  const { data: family } = await supabase.from("families")
    .select("wallet_looked_at").eq("id", familyId).maybeSingle();
  const hasHeldPrograms = Boolean(programs?.some((program) => program.is_active !== false));

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
            <WalletAddButton />
          }
        />
        <p className="mb-4 text-sm text-ink-soft">
          Passports and travel documents live with each person in{" "}
          <Link href="/family" className="text-teal underline underline-offset-2">Family & pets</Link>.
        </p>
        {/* Only advice about active holdings can run automatically. */}
        <ProTips
          tips={(tips || []).filter((tip) => tip.scope === "wallet")}
          today={today}
          scope="wallet"
          canLook={hasHeldPrograms && !programsError}
          showEmpty
          everLooked={Boolean(family?.wallet_looked_at)}
          lastLookedAt={family?.wallet_looked_at}
          autoLook={hasHeldPrograms && !programsError}
          heading="Pro tips"
          againLabel="Run again"
          description="For cards and programs you already have."
          emptyLooked={hasHeldPrograms ? "" : "Add a card or program to get tips specific to what you have."}
          emptyFresh={programsError ? "Your saved programs could not be loaded. Automatic tips are paused until they can be read." : hasHeldPrograms ? "Aly will check the benefits, points, credits and fees on your saved cards and programs." : "Add a card or program to get tips specific to what you have."}
        />
        <ProTips
          tips={(tips || []).filter((tip) => tip.scope === "offers")}
          offers={openOffers}
          today={today}
          scope="offers"
          canLook={!programsError}
          showEmpty
          autoLook={false}
          heading="Current offers"
          lookLabel="Find offers"
          description="Explore current offers on cards you don’t already have."
          emptyLooked="No new offers worth flagging right now."
          emptyFresh="Choose Find offers to check current welcome bonuses, spending requirements and annual fees."
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
              showAddAction={false}
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
