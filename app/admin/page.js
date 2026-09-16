import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import TopBar from "@/components/TopBar";
import AdminHub from "./AdminHub";

export const metadata = { title: "Admin · Alyeska" };

/**
 * One door to the screens that are about the app rather than about a trip.
 *
 * Six of them had accumulated, and the only way between any two was a pair of
 * buttons on the beta desk: the opening watch, the model check and the practice
 * run were reachable by typing an address and by nothing else. This is the index,
 * and the beta desk that used to live at this address is now one of the rows.
 *
 * Who sees it is settled by lib/auth/admin.js, which reads an allowlist of
 * account ids from the environment and falls back to the owner's. Adding a second
 * person is a variable rather than a release, which is what "could be other
 * users" needs to mean. Every page listed here checks that same list for itself,
 * and so does each route behind them: a row that is not drawn is not a door that
 * is locked.
 */

export default async function AdminPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  // The same not-found a misspelt address gets. A refusal that admits the page
  // is there is an invitation to come back with a session.
  if (!isAdminUser(user)) notFound();

  return (
    <>
      <TopBar />
      <AdminHub />
    </>
  );
}
