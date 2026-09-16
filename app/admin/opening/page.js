import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import OpeningWatch from "./OpeningWatch";

export const metadata = { title: "Opening · Alyeska" };

/**
 * The openings, held up so they can be watched.
 *
 * This lived at /login/opening, which put it under the one path prefix the
 * middleware lets through without a session -- so a page that exists to judge an
 * animation was readable by anybody who guessed the address. It is a workshop
 * screen and now sits with the rest of them, behind the same allowlist the beta
 * desk uses.
 *
 * The watch itself is a client component: it writes the skin, the crossing and
 * the boot kind onto the document and puts them all back on the way out. Nothing
 * here reads the database, so the gate is the whole of the server half.
 */
export default async function OpeningPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  // The same not-found a misspelt address gets, for the same reason as the desk:
  // a refusal that admits the page is there is an invitation to come back.
  if (!isAdminUser(user)) notFound();
  return <OpeningWatch />;
}
