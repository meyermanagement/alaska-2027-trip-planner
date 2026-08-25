import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import RewardsBoard from "./RewardsBoard";

export const metadata = { title: "Rewards · Alyeska" };

export default async function RewardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  if (!memberships || memberships.length === 0) redirect("/join");
  const familyId = memberships[0].family_id;

  // Three independent reads, asked for together.
  const [{ data: profile }, { data: travelers }, { data: programs }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
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

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-7">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold">Rewards</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every program the family belongs to, what the balances are, and what
            each credit card earns. Aly reads all of it when she plans, so she
            can say when a stay is worth paying for with points and which card
            to put a booking on. Membership numbers stay hidden until you tap to
            show them.
          </p>
        </div>
        <RewardsBoard
          familyId={familyId}
          travelers={travelers || []}
          programs={programs || []}
        />
      </main>
      <AskAlyGeneral focus="rewards" />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
