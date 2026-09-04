import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import LogTripStart from "./LogTripStart";

export const metadata = { title: "Log a previous trip · Alyeska" };

/**
 * The trip builder's mirror image: a trip that has already happened.
 *
 * Same shape as /trips/new deliberately -- one screen, boxes, a conversation with
 * Aly behind the button -- because the two jobs are the same job pointed in
 * opposite directions. Everything the builder does forwards (suggest, draft,
 * build a packing list, make tasks) is wrong for a trip that is over, and the one
 * thing this screen wants -- the packing list they really used -- is the one thing
 * the builder would rather propose than ask for.
 *
 * A secondary traveler cannot create a trip, so this redirects them the same way
 * the builder does rather than spending their conversation on an insert the
 * database will refuse.
 */
export default async function LogTripPage() {
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
        <LogTripStart />
      </main>
      {/* The conversation opens on this screen, with the focus that tells Aly the
          trip is finished. */}
      <AskAlyGeneral focus="log_trip" />
    </>
  );
}
