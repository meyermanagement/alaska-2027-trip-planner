import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";

/**
 * Whether the person asking is in the beta.
 *
 * The report button hangs at the bottom of every screen while the app is being
 * tested, and it should not hang there for anybody else. It has to be a route
 * rather than a check inside the layout: the layout is shared by every page in
 * the app and reads nothing from the database on purpose, so putting a query in
 * it would make every page in the app wait on this one answer.
 *
 * Why service role: signup_codes has no policy letting a signed-in person read
 * it, and it must not get one -- a table of unspent ways into a closed beta is
 * not something a tester should be able to list. So the read is done with the
 * key and the answer given back is a single boolean about the caller themselves,
 * which tells them nothing they did not already know.
 *
 * A household counts, not just the person who typed the code. Steph and Veda
 * never redeemed anything -- they were invited into a family that did -- and
 * they are testing the app exactly as much as the person who let them in.
 */

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  if (!me) return NextResponse.json({ tester: false });

  // Whoever runs the beta always has it, whether or not they ever spent a code
  // on themselves.
  if (isAdminUser(me)) return NextResponse.json({ tester: true });

  let admin = null;
  try {
    admin = createAdminClient();
  } catch {
    // No key configured. Nobody gets the button rather than everybody: a
    // misconfigured deployment showing a bug reporter to the public is the
    // worse of the two failures.
    return NextResponse.json({ tester: false });
  }

  // Their own code first, which is one indexed lookup and answers for most
  // people.
  const { data: mine } = await admin
    .from("signup_codes")
    .select("code")
    .eq("used_by", me.id)
    .limit(1)
    .maybeSingle();
  if (mine) return NextResponse.json({ tester: true });

  // Otherwise: does anybody in their household hold one? The family is read
  // through the caller's own session, so row-level security decides which
  // household this is and this route never has to.
  const { data: mates } = await supabase
    .from("travelers")
    .select("user_id")
    .not("user_id", "is", null);
  const ids = Array.from(
    new Set((mates || []).map((one) => one.user_id).filter(Boolean)),
  );
  if (!ids.length) return NextResponse.json({ tester: false });

  const { data: theirs } = await admin
    .from("signup_codes")
    .select("code")
    .in("used_by", ids)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ tester: Boolean(theirs) });
}
