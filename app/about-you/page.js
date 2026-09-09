import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveHomePoint } from "@/lib/places/homePoint";
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
  // Where the first-run chain wants to go next. Defaults to /trips (the
  // original behaviour) so nothing on the Settings-driven visit changes. The
  // first-login chain from /welcome hands us `next=/interview` so the
  // paragraph flows straight into the interview.
  const rawNext = String(params?.next || "").trim();
  const nextHref =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/trips";

  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");

  // Matched on the account rather than the name: a name is not an identity, and
  // two Marks would both be handed the same paragraph to write.
  const { data: mine } = await supabase
    .from("travelers")
    .select("id, name, about_me, access_level, family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  // Somebody whose seat has not been claimed has no row to write this on. Sending
  // them to a box that cannot save is worse than not asking.
  if (!mine) redirect("/trips");

  // Where home is, which is what powers the local-teams chips. The address the
  // family typed on the welcome screen decides this: its stored coordinates
  // when it has them, or the words themselves sent to the geocoder when the
  // welcome screen saved an address it could not place. Only a family with no
  // usable address falls back to the coarse position of this request.
  const { data: family } = mine.family_id
    ? await supabase
        .from("families")
        .select("home_address, home_lat, home_lon")
        .eq("id", mine.family_id)
        .maybeSingle()
    : { data: null };
  const home = await resolveHomePoint(family, await headers());

  // Chromeless: no TopBar (compass menu, tip strip, current-trip banner) and
  // no Ask Aly. This screen is entered from the first-run chain -- welcome,
  // then here, then interview -- and the compass and the drawer belong to the
  // app you land in once the chain is done, not the chain itself. The Family
  // screen and Settings still hand you a way back here later, with the
  // chrome, when you return to edit the paragraph.
  return (
    <main className="mx-auto max-w-3xl px-5 pb-16 pt-7">
      <AboutYouForm
        travelerId={mine.id}
        name={mine.name || ""}
        first={first}
        secondary={mine.access_level === "secondary"}
        homeLat={home?.lat ?? null}
        homeLon={home?.lon ?? null}
        nextHref={nextHref}
      />
    </main>
  );
}
