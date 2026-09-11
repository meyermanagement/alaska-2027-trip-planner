import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import ProofClient from "../../interview/proof/ProofClient";

export const metadata = { title: "Interview proof \u00b7 Alyeska" };

/**
 * The interview proof step, mounted for the practice hub.
 *
 * The real /interview/proof route only shows itself after the primary
 * has answered the ten interview questions and needs actual preferences
 * to compare against. In practice, the ProofClient is mounted with
 * demo=true, which asks the API to run the same side-by-side against the
 * family the person typed on the way here -- their practice run, carried in
 * sessionStorage, and no stock family behind it. A rehearsal with nothing
 * typed in it gets a plan built from nothing, and the screen says so.
 * Nothing on the primary's file is read or written.
 */
export default async function InterviewCheckProofPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check/proof");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/trips");

  return (
    <main className="mx-auto max-w-4xl px-5 pb-16 pt-7">
      <ProofClient demo backHref="/interview-check" />
    </main>
  );
}
