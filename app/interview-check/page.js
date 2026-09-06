import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import RehearsalBody from "./RehearsalBody";

export const metadata = { title: "Interview rehearsal · Alyeska" };

/**
 * Run the whole interview, on the record, and write none of it down.
 *
 * The first interview was conducted from a script outside the app, which is how
 * three separate faults were found in it -- a reply that saved an answer and
 * asked nothing, a question retired that had never been put, one answer filed
 * under three blanks -- and none of them were visible from a single turn. This
 * puts that run inside the app, where it can be re-run after any change to the
 * prompt and read as a page instead of a terminal.
 */
export default async function InterviewCheckPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");
  const access = await resolveAccess(supabase, user);
  if (access?.can?.isSecondary) redirect("/trips");

  const { data: travelers } = await supabase
    .from("travelers")
    .select("id, name, color")
    .eq("is_person", true)
    .order("sort_order", { ascending: true });

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-7">
        <h1 className="font-display text-3xl font-semibold">
          Interview rehearsal
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          A whole interview against the real record, the real prompt and the
          real model — with every save diverted into memory, so nothing here
          reaches anybody&apos;s file. Write the answers you want to test, one
          per line, and read what Aly would have written down.
        </p>
        <RehearsalBody travelers={travelers || []} />
      </main>
    </>
  );
}
