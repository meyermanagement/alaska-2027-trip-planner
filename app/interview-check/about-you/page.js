import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { resolveHomePoint } from "@/lib/places/homePoint";
import AboutYouForm from "../../about-you/AboutYouForm";

export const metadata = { title: "About you · Alyeska" };

/**
 * The About you paragraph, rehearsed, saving nothing.
 *
 * The real /about-you writes to travelers.about_me and Aly reads that on
 * every question she answers. In practice mode the same form appears but
 * Save shows the paragraph back with a note that nothing was written; the
 * real paragraph on the primary's own page is unchanged either way. Reached
 * from the practice hub at /interview-check.
 */
export default async function InterviewCheckAboutYouPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check/about-you");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/trips");

  // The form still needs a travelerId so the surrounding shape stays honest;
  // its onClick short-circuits before Supabase is touched.
  const { data: mine } = await supabase
    .from("travelers")
    .select("id, name")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!mine) redirect("/trips");

  // Where home is powers the local-teams chips on the real form. Practice uses
  // the same form and the same resolution, so the rehearsed version is
  // identical to what the primary will see when they open the real screen.
  const { data: family } = await supabase
    .from("families")
    .select("home_address, home_lat, home_lon")
    .eq("id", access.familyId)
    .maybeSingle();
  const home = await resolveHomePoint(family, await headers());

  return (
    <main className="mx-auto max-w-3xl px-5 pb-16 pt-7">
      <AboutYouForm
        travelerId={mine.id}
        name={mine.name || ""}
        first={false}
        secondary={false}
        homeLat={home?.lat ?? null}
        homeLon={home?.lon ?? null}
        practice
      />
    </main>
  );
}
