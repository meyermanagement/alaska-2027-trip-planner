import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import ProTips from "@/components/ProTips";
import { WALLET_SCOPES } from "@/lib/tips/tip";
import RewardsBoard from "./RewardsBoard";

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

  const [{ data: travelers }, { data: programs }] = await Promise.all([
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
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-7">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold">Wallet</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every program the family belongs to, what the balances are, and what
            each credit card earns. Aly reads all of it when she plans, so she
            can say when a stay is worth paying for with points and which card
            to put a booking on.
          </p>
        </div>
        <ProTips
          tips={tips || []}
          today={today}
          scope="wallet"
          canLook
          everLooked={Boolean(everLooked)}
          heading="Pro tips"
          chain={[{ scope: "wallet" }, { scope: "offers" }]}
          emptyLooked="Nothing worth telling you about the Wallet right now. Tips appear when a credit is going unused, points are about to lapse, a fee is coming round, or a welcome bonus on a card you do not hold is worth the spending you already have planned."
          emptyFresh={
            programs?.length
              ? "Nothing here yet. Ask for a look and Aly will go through what you hold — expiring points, unspent credits, fees against the perks you actually use — and check what today's welcome offers are on cards you do not have."
              : "Nothing saved here yet, which is fine — ask for a look anyway. With an empty Wallet Aly answers the beginner's question instead: which travel card to open first, why that one, what the bonus is today and what it costs to keep, read off the issuer's own page rather than remembered."
          }
        />
        <RewardsBoard
          familyId={familyId}
          travelers={travelers || []}
          programs={programs || []}
        />
        {/* Said once, at the bottom, rather than on every card. A welcome offer
            is a moving target and the only page that is authoritative about it is
            the issuer's own. */}
        <p className="mt-6 text-[0.78rem] leading-relaxed text-ink-faint">
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
