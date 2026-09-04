import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import TripBuilderStart from "./TripBuilderStart";

export const metadata = { title: "Trip builder · Alyeska" };

/**
 * A screen of its own, rather than the modal it used to be.
 *
 * The old New trip form was a sheet over the trips list, which is the right shape
 * for a short confirmation and the wrong one for a conversation. It could not show
 * the examples at full length, it could not show the six things a trip is made of,
 * and on a phone it covered the whole screen anyway -- so it was a screen already,
 * pretending not to be.
 *
 * A secondary traveler cannot create a trip. The database refuses the insert
 * outright, so this sends them back rather than showing them a box that would
 * spend a conversation and then fail at the last step.
 */
export default async function NewTripPage() {
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

  const access = await resolveAccess(supabase, user);

  if (access?.can?.isSecondary) redirect("/trips");

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-7">
        <TripBuilderStart />
      </main>
      {/* The conversation opens here, on this screen, so the answer arrives where
          the question was asked. */}
      <AskAlyGeneral focus="new_trip" />
    </>
  );
}
