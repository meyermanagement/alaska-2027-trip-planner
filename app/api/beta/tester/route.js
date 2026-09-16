import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isTesterAccount } from "@/lib/beta/tester";
import { isAdminUser } from "@/lib/auth/admin";

/**
 * Whether the person asking is in the beta, and whether they are on the admin
 * allowlist.
 *
 * The report button hangs at the bottom of every screen while the app is being
 * tested, and the menu draws a row for the beta survey; neither should appear
 * for anybody else. It has to be a route rather than a check inside the layout:
 * the layout is shared by every page in the app and reads nothing from the
 * database on purpose, so putting a query in it would make every page in the app
 * wait on this one answer.
 *
 * The answers given back are two booleans about the caller themselves, which
 * tell them nothing they did not already know. How the beta one is worked out --
 * and why it takes the service-role key to work out -- is in lib/beta/tester.js,
 * which the survey page and its route use directly rather than calling this over
 * HTTP. The admin one is a list of account ids read from the environment.
 */

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  if (!me) return NextResponse.json({ tester: false, admin: false });
  return NextResponse.json({
    tester: await isTesterAccount(supabase, me),
    // The menu row for the workshop screens. Two booleans about the caller
    // themselves, which tell them nothing they did not already know -- and
    // neither is a permission: every page and route behind those rows checks the
    // same lists again for itself.
    admin: isAdminUser(me),
  });
}
