import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import ProofClient from "../../interview/proof/ProofClient";

export const metadata = { title: "Practice \u00b7 Interview proof \u00b7 Alyeska" };

/**
 * The interview proof step, mounted for the practice hub.
 *
 * The real /interview/proof route only shows itself after the primary
 * has answered the ten interview questions and needs actual preferences
 * to compare against. In practice, the ProofClient is mounted with
 * demo=true, which asks the API to run the same side-by-side against a
 * stand-in family (the Riveras and their Reykjavik long weekend --
 * same shape the Meet Aly intro used, so the rehearsal reads as one
 * continuous demo). Nothing on the primary's file is read or written.
 */
export default async function InterviewCheckProofPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check/proof");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/trips");

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-4xl px-5 pb-16 pt-7">
        <h1 className="font-display text-3xl font-semibold">
          Practice: interview proof
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          The screen that appears right after the ten interview questions.
          One real question about your next trip, answered twice by the
          same model -- once with your interview folded in, once without.
        </p>
        <div className="mt-6">
          <ProofClient demo backHref="/interview-check" />
        </div>
      </main>
    </>
  );
}
