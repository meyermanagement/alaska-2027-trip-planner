import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import AboutYouForm from "./AboutYouForm";

export const metadata = { title: "About you · Alyeska" };

/**
 * The question that is worth asking before anything else, on a screen of its own.
 *
 * Reached three ways. On a first sign-in the Trips page sends people here, because
 * an account with no trips and no preferences in it gives Aly nothing to work
 * with and every answer she gives comes out generic. After that it is a quiet
 * link in the footer, which is the right weight for a primary traveler -- the
 * same paragraph, and everything else about them, is also on the Family tab.
 *
 * For a secondary traveler it is a named place in the menu instead. They cannot
 * open the Family tab, and this paragraph is the only thing about themselves the
 * database will let them change, so it is the whole of their own record rather
 * than one field of it, and the screen says so out loud.
 */
export default async function AboutYouPage({ searchParams }) {
  const params = await searchParams;
  const first = params?.first === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: mine }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    // Matched on the account rather than the name: a name is not an identity, and
    // two Marks would both be handed the same paragraph to write.
    supabase
      .from("travelers")
      .select("id, name, about_me, access_level")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);

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
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
