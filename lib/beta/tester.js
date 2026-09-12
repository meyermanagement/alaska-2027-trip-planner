import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/auth/admin";

/**
 * Is this person in the beta?
 *
 * Lived inside app/api/beta/tester/route.js until the survey needed the same
 * answer -- once on the server, to decide whether the page exists for this
 * caller, and once in the browser, to decide whether the menu draws a row for
 * it. Three places asking the same question through three copies of the same
 * query is how a tester ends up with a menu row that opens a page telling them
 * they are not a tester.
 *
 * Why service role: signup_codes has no policy letting a signed-in person read
 * it, and must not get one -- a table of unspent ways into a closed beta is not
 * something a tester should be able to list. The `supabase` argument is the
 * caller's own session, used only to find out which household is theirs, so
 * row-level security decides that and this file never has to.
 *
 * A household counts, not just the person who typed the code. Steph and Veda
 * never redeemed anything -- they were invited into a family that did -- and
 * they are testing the app exactly as much as the person who let them in.
 *
 * False on any failure. A misconfigured deployment that shows beta instruments
 * to the public is the worse of the two ways to be wrong.
 */
export async function isTesterAccount(supabase, me) {
  if (!me?.id) return false;

  // Whoever runs the beta always has it, whether or not they ever spent a code
  // on themselves.
  if (isAdminUser(me)) return true;

  let admin = null;
  try {
    admin = createAdminClient();
  } catch {
    return false;
  }

  // Their own code first, which is one indexed lookup and answers for most
  // people.
  const { data: mine } = await admin
    .from("signup_codes")
    .select("code")
    .eq("used_by", me.id)
    .limit(1)
    .maybeSingle();
  if (mine) return true;

  // Otherwise: does anybody in their household hold one?
  const { data: mates } = await supabase
    .from("travelers")
    .select("user_id")
    .not("user_id", "is", null);
  const ids = Array.from(
    new Set((mates || []).map((one) => one.user_id).filter(Boolean)),
  );
  if (!ids.length) return false;

  const { data: theirs } = await admin
    .from("signup_codes")
    .select("code")
    .in("used_by", ids)
    .limit(1)
    .maybeSingle();

  return Boolean(theirs);
}
