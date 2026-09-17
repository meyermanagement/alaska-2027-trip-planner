import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import HomeLanding from "./HomeLanding";

export const metadata = {
  // The brand first, then the promise. "Aly has your back" on its own reads as
  // somebody's name with no subject attached, which is no use in a tab strip or
  // a search result; the description underneath is where travel gets said.
  title: "Alyeska · Aly has your back",
  description:
    "Alyeska plans your travel and stays with you on it. Tell Aly roughly where and when, and she builds the days around whoever is going, keeps the bookings, documents, packing lists and points in one place, and answers from the day you are living. She books nothing and sells nothing.",
};

// Read at request time, because which of the two pages below a visitor gets
// depends on whether they are signed in, and a cached answer would show a
// stranger's landing page to a family or send a reviewer to the sign-in.
export const dynamic = "force-dynamic";

/**
 * The root, which is two different things depending on who asks.
 *
 * Signed in, it is what it has always been: a hop to /trips, so opening the app
 * from a home screen icon or a bookmark lands on the family's own trips and not
 * on a page about the product they already bought.
 *
 * Signed out, it is the front door -- see app/HomeLanding.js. This used to be an
 * unconditional redirect to /trips, which middleware then bounced to /login, so
 * the only thing the domain ever showed a stranger was a form. That cost the
 * Google consent screen its brand verification, and it would have cost the same
 * with any reviewer who asks what an app does before granting it anything.
 *
 * The signed-in check runs first and on the server, so a family never sees the
 * landing page flash before the redirect.
 */
export default async function Home() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (user) redirect("/trips");
  return <HomeLanding />;
}
