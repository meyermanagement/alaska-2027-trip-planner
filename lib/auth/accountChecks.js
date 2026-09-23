import { accountAge } from "@/lib/beta/accountAge";

/**
 * The two account questions middleware asks on every signed-in request, asked
 * together rather than one after the other.
 *
 * They are independent: whether this session may still be used (not handed off
 * to a child view, account not banned) and whether the account belongs to a
 * minor. Asked in series, every navigation and prefetch paid two database
 * round-trips before the page began; asked at once it pays one. Nothing is
 * remembered between requests -- both answers are fresh every time, which is
 * what lets a handed-off or banned session be refused on its very next request.
 *
 * The caller still judges them in the same order as before: a session that is
 * refused is refused, whatever the age check said (a handed-off session makes
 * account_is_minor raise, and that error must not be read as "try again").
 */
export async function accountChecks(supabase, userId) {
  const [session, age] = await Promise.all([
    supabase.rpc("account_session_allowed"),
    accountAge(supabase, userId),
  ]);
  return { allowed: session.data, sessionError: session.error, age };
}
