import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import SettingsBody from "./SettingsBody";
import { readConsent } from "@/lib/beta/consent";
import { resolveAccess } from "@/lib/travelers/access";
import { loadSetupState } from "@/lib/setup/state";
import { todayISO } from "@/lib/reminders";

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
  const user = await whoIs(supabase);
  if (!user) redirect("/login");

  const access = await resolveAccess(supabase, user);
  const secondary = Boolean(access?.can?.isSecondary);

  // What the menu is marking, and whether this household has said it is done.
  // The loader runs first because it stamps the column itself when the last of
  // the five lands, and a read taken alongside it could show a stale null on the
  // very load that finished the job.
  const setup = secondary
    ? null
    : await loadSetupState(supabase, {
        familyId: access?.familyId,
        travelerId: access?.travelerId,
        today: todayISO(),
        secondary,
      });
  const { data: household } = secondary
    ? { data: null }
    : await supabase
        .from("families")
        .select("setup_done_at")
        .eq("id", access?.familyId)
        .maybeSingle();

  const [{ data: profile }, { data: mine }, consent, { data: allowedAssistants }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, skin, text_size")
      .eq("id", user.id)
      .maybeSingle(),
    // Their traveler row, if the seat has been claimed, only to say what name
    // they appear under on trips. About you no longer lives on this screen --
    // it lives on the Family tab where the rest of the record lives -- so
    // there is nothing to write from here.
    supabase
      .from("travelers")
      .select("id, name")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
    // What they agreed to on the way in, so the answers can be taken back from
    // the same screen that shows them. Null for an account with nothing
    // recorded, and the section is simply not drawn.
    readConsent(supabase, user.id),
    // Assistants this person allowed on /oauth/consent, so the promise there
    // ("You can remove this later from Settings") has a control behind it.
    supabase
      .from("assistant_connections")
      .select("client_id, decided_at, assistant_oauth_clients(client_name)")
      .eq("user_id", user.id)
      .eq("status", "allowed")
      .is("revoked_at", null)
      .order("decided_at", { ascending: false }),
  ]);
  const assistants = (allowedAssistants || []).map((r) => ({
    client_id: r.client_id,
    decided_at: r.decided_at,
    name: r.assistant_oauth_clients?.client_name || "An assistant",
  }));

  // What the delete control has to say before it draws a button: the household's
  // own name, how many other people are in it, and whether this person is the
  // last owner of a household others are still using. Read here rather than
  // fetched by the control, so the copy is right on first paint -- a panel that
  // says "this deletes everything" for a moment and then corrects itself to "only
  // your seat" is worse than no panel.
  //
  // The route works all of it out again from the membership before it deletes
  // anything. None of this is a permission.
  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  let deletion = { householdName: "", others: 0, role: null, lastOwner: false };

  if (membership?.family_id) {
    const [{ data: family }, { data: members }] = await Promise.all([
      supabase
        .from("families")
        .select("name")
        .eq("id", membership.family_id)
        .maybeSingle(),
      supabase
        .from("family_members")
        .select("user_id, role")
        .eq("family_id", membership.family_id),
    ]);
    const others = (members || []).filter((m) => m.user_id !== user.id);
    deletion = {
      householdName: family?.name || "",
      others: others.length,
      role: membership.role || null,
      lastOwner:
        membership.role === "owner" &&
        others.length > 0 &&
        others.every((m) => m.role !== "owner"),
    };
  }

  return (
    <SettingsBody
      email={user.email}
      provider={user.provider}
      displayName={profile?.display_name}
      skin={profile?.skin}
      textSize={profile?.text_size}
      mine={mine}
      consent={consent}
      secondary={secondary}
      setupDoneAt={household?.setup_done_at || null}
      setupLeft={setup?.left || 0}
      deletion={deletion}
      assistants={assistants}
    />
  );
}
