import { isTesterAccount } from "@/lib/beta/tester";
import { accountAge } from "@/lib/beta/accountAge";
import {
  CONSENT_PATH,
  consentIsCurrent,
  readConsent,
} from "@/lib/beta/consent";

/**
 * Where somebody who has just signed in should land.
 *
 * This used to live inside the OAuth callback, which meant it only ran for
 * people who tapped Continue with Google. Signing in with an email and a
 * password never touches that route -- the form gets a session in the browser
 * and pushes straight to the page it was asked for -- so a brand-new household
 * that came in that way was dropped on an empty Trips page and never met Aly.
 * Logging out and back in did the same thing, which is how it was found: the
 * walkthrough was not lost, it had never been reachable from that door.
 *
 * So the decision lives here, and both doors ask the same question. The OAuth
 * callback calls it directly; the password form sends the browser through
 * /auth/land, which is nothing but this function and a redirect.
 *
 * Only asked when the person did not ask for somewhere specific. A deep link
 * into a trip is a person who knows where they are going, and interrupting that
 * with an introduction is worse than a late introduction.
 */

/**
 * The path to send a freshly signed-in person to, or null to honour `next`.
 *
 * Takes a server Supabase client already carrying their session, so every read
 * here is theirs and the database's own policies decide what it can see.
 */
export async function landingPath(supabase, userId) {
  const age = await accountAge(supabase, userId);
  if (age.minor || age.unavailable) return "/child";
  // Before anything else, including the introduction. Meet Aly's demonstration
  // is a live model call, so asking a tester whether their text may be sent to a
  // third-party model after having shown them a screen that already sent some is
  // not asking. The gate is also enforced in middleware, because a bookmark into
  // /trips never comes through this function at all -- this is the part that puts
  // it in the right place in the walkthrough rather than the part that makes it
  // unskippable.
  const consent = await readConsent(supabase, userId);
  if (!consentIsCurrent(consent)) {
    // Only for people who are actually in the beta. A general-release account has
    // no beta terms to accept, and putting a liability waiver in front of one
    // would be the wrong screen rather than a strict one.
    const tester = await isTesterAccount(supabase, { id: userId });
    if (tester) return CONSENT_PATH;
  }

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", userId)
    .maybeSingle();

  // Nobody's household. /trips sends them to /join, which is the right screen
  // for it, so this stays out of the way.
  if (!membership?.family_id) return null;

  const [{ data: fam }, { count: peopleCount }] = await Promise.all([
    supabase
      .from("families")
      .select("home_address")
      .eq("id", membership.family_id)
      .maybeSingle(),
    supabase
      .from("travelers")
      .select("id", { count: "exact", head: true })
      .eq("family_id", membership.family_id)
      .eq("is_person", true),
  ]);

  // A household with nothing in it: no address, nobody named. That is somebody
  // who has just spent a code, and the introduction is the whole point.
  if (!fam?.home_address && (peopleCount || 0) === 0) {
    return "/welcome/meet-aly";
  }

  // A non-owner signing in for the first time meets Aly first, then is walked
  // through their own file: About me, then Favorite moments, then Home. They are
  // as new to the app as the person who created the household -- the only thing
  // they did not do is fill in the family form -- so being handed straight to a
  // form about themselves by a product they have never been introduced to is the
  // wrong opening. Meet Aly sends them onward to About me rather than to the
  // family form, since their family already exists.
  //
  // The owner never comes through this door: their traveler row is stamped
  // welcomed_at at household creation time (see the migration). Everybody else
  // gets the walkthrough once, and skipping stamps welcomed_at anyway so this
  // never runs again for that person.
  const { data: mySeat } = await supabase
    .from("travelers")
    .select("id, welcomed_at")
    .eq("family_id", membership.family_id)
    .eq("user_id", userId)
    .eq("is_person", true)
    .maybeSingle();
  if (mySeat?.id && !mySeat.welcomed_at) return "/welcome/meet-aly";

  return null;
}

/**
 * Is this person still being walked in?
 *
 * Asked by the two legal pages, which are the only screens in the app reachable
 * from inside onboarding and from the finished app both. A tester who taps
 * "privacy policy" from the consent gate is mid-sentence in a decision; handing
 * them the menu, Ask Aly, and a report flag at that moment offers three ways out
 * of a screen they were sent to read, and one of them starts a conversation with
 * the assistant whose permission question they have not answered yet. After
 * onboarding the same page is just a document in an app, and the menu is how you
 * leave it.
 *
 * Defined as "landingPath would send them somewhere", deliberately, rather than
 * as its own set of checks. The walkthrough's shape has already changed twice in
 * this file; a second definition of finished would be wrong the first time it
 * moved. The one case this treats as finished and landingPath also does is
 * somebody with no household at all -- they get the menu here, and /trips sends
 * them to /join.
 */
export async function midOnboarding(supabase, userId) {
  return (await landingPath(supabase, userId)) !== null;
}
