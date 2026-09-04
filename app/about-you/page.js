import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import TopBar from "@/components/TopBar";
import { SETTINGS_FOCUS } from "@/lib/agent/context";
import AboutYouForm from "./AboutYouForm";

export const metadata = { title: "About you · Alyeska" };

/**
 * The question that is worth asking before anything else, on a screen of its own.
 *
 * Reached two ways. On a first sign-in the Trips page sends people here, because
 * an account with no trips and no preferences in it gives Aly nothing to work
 * with and every answer she gives comes out generic. After that it is the first
 * thing on Settings, above the look and the sign-in address, because it is the
 * one of the three somebody actually comes back to change.
 *
 * A primary traveler can also reach this paragraph, and everything else about
 * themselves, on the Family tab. A secondary traveler cannot open that tab, and
 * this paragraph is the only thing about themselves the database will let them
 * change, so it is the whole of their own record rather than one field of it, and
 * the screen says so out loud.
 */
export default async function AboutYouPage({ searchParams }) {
  const params = await searchParams;
  const first = params?.first === "1";

  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");

  // Matched on the account rather than the name: a name is not an identity, and
  // two Marks would both be handed the same paragraph to write.
  const { data: mine } = await supabase
    .from("travelers")
    .select("id, name, about_me, access_level")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  // Somebody whose seat has not been claimed has no row to write this on. Sending
  // them to a box that cannot save is worse than not asking.
  if (!mine) redirect("/trips");

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-7">
        <AboutYouForm
          travelerId={mine.id}
          name={mine.name || ""}
          about={mine.about_me || ""}
          first={first}
          secondary={mine.access_level === "secondary"}
        />
      </main>
      {/* Aly is good at drafting the paragraph this screen is for, which makes
        her absence here the worst place to be missing. Same subject as Settings:
        the person, not a trip. */}
      <AskAlyGeneral focus={SETTINGS_FOCUS} />
    </>
  );
}
