import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import WelcomeForm from "./WelcomeForm";

export const metadata = { title: "Welcome · Alyeska" };

/**
 * The first-login screen.
 *
 * Before Aly asks anything about how somebody travels, this collects the parts
 * that never come out of an interview well: where the family lives, who is in
 * it, and which animals belong to it. Aly can and does ask about all three, but
 * an interview that opens by asking "who else is here" spends its first two
 * minutes on questions the family could have answered in a form in twenty
 * seconds, and gets less honest answers because the shape of the answer is not
 * obvious.
 *
 * The form saves as it goes: the home address writes to the families row, each
 * person writes a travelers row, each animal writes a pets row. Once at least
 * the home and the primary traveler are set, the button jumps to the Family
 * screen where the Get to know button is waiting.
 *
 * A user who has already filled this in (they have travelers, or they have set
 * a home) is redirected onward. This screen is for a brand-new account.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");
  const access = await resolveAccess(supabase, user);
  if (access?.can?.isSecondary) redirect("/trips");
  if (!access?.familyId) {
    // No family row on this account. Not a bug this screen can fix -- signup
    // never created one -- so hand back a plain sentence rather than a broken
    // form. The primary way to reach a family is an invite code today.
    return (
      <>
        <main className="mx-auto max-w-2xl px-5 pb-16 pt-7">
          <h1 className="font-display text-3xl font-semibold">Welcome</h1>
          <p className="mt-3 text-sm text-ink">
            This account is not attached to a family yet. Ask whoever invited
            you for the invite code, or reach out to support.
          </p>
        </main>
      </>
    );
  }

  const [{ data: family }, { data: travelers }, { data: pets }] =
    await Promise.all([
      supabase
        .from("families")
        .select("id, name, home_address, home_lat, home_lon, home_precise")
        .eq("id", access.familyId)
        .maybeSingle(),
      supabase
        .from("travelers")
        .select("id, name, is_person, sort_order")
        .eq("family_id", access.familyId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("pets")
        .select("id, name, species, sort_order")
        .eq("family_id", access.familyId)
        .order("sort_order", { ascending: true }),
    ]);

  const people = (travelers || []).filter(
    (t) => t.is_person && t.name !== "Shared",
  );
  const nothingHere =
    !family?.home_address && people.length === 0 && (pets?.length || 0) === 0;
  // Somebody who has already filled a home and named a person does not need
  // this screen again. Send them where they were going.
  if (!nothingHere) redirect("/family");

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-7">
        <h1 className="font-display text-3xl font-semibold">
          Welcome to Alyeska
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Three quick things and Aly can start being useful right away: where
          you live, who else travels with you, and any animals that are part of
          the family.
        </p>
        <WelcomeForm
          familyId={access.familyId}
          familyName={family?.name || ""}
          myName={access.travelerName || ""}
          myUserId={user.id}
          myEmail={user.email || ""}
        />
      </main>
    </>
  );
}
