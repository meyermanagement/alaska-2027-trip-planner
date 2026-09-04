import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsBody from "./SettingsBody";

export const metadata = { title: "Settings · Alyeska" };

/**
 * The three things that are about the person rather than about a trip, gathered
 * onto one screen with a name on it.
 *
 * All three used to be somewhere else. "About you" and "Signed in as" and "Log
 * out" were a single grey line at the foot of every screen -- underneath the
 * page, in the smallest type in the app, three unlike things separated by
 * interpuncts. Your look was further away still: a section at the bottom of the
 * Family tab, below the pets, on a tab a secondary traveler cannot open at all.
 *
 * The order here is the order of how often somebody means to come: the paragraph
 * Aly reads before she answers anything, then how the app looks, then the
 * account, which most people will open once to check whose it is.
 *
 * Log out stays last and stays quiet. It is the one control on this screen you
 * do not want to hit while reaching for something else.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: mine }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, skin")
      .eq("id", user.id)
      .maybeSingle(),
    // Whether there is a row of their own to write a paragraph on. Without one,
    // About you has nothing to save, so it is stated rather than offered.
    supabase
      .from("travelers")
      .select("id, name, about_me")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <SettingsBody
      email={user.email}
      displayName={profile?.display_name}
      skin={profile?.skin}
      mine={mine}
    />
  );
}
