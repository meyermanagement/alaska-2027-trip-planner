import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";

export const metadata = { title: "Practice · Alyeska" };

/**
 * The practice hub.
 *
 * Aly asks the family in three different places and none of them is a chat:
 * a welcome form for the shape of the household, a nine-question interview
 * for how they travel, and a paragraph on each person for what they are like
 * on a trip. Practice used to cover only the middle one, which meant somebody
 * rehearsing had no way to look at the other two without either landing on a
 * screen they had already filled in (welcome redirects away when it is done)
 * or writing over their real About you paragraph.
 *
 * This page is a directory with a tile per practice screen. Each tile links
 * to the real component in a mode where Save is disabled and a recap says
 * what would have been written. That way the practice is faithful -- the same
 * fields, the same wording, the same shape -- without spending the real file
 * to find out that the third question was wrong.
 *
 * Only the primary can rehearse: the real versions of all three are theirs to
 * run, so a practice for anybody else would be practicing something they will
 * not do. A secondary who reaches this URL is sent back to Trips.
 */
export default async function InterviewCheckPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/trips");

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-7">
        <h1 className="font-display text-3xl font-semibold">Practice</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          The three places Aly asks the family things, rehearsed without
          touching your file. Nothing you type here saves.
        </p>

        <div className="mt-6 space-y-3">
          <PracticeTile
            href="/interview-check/welcome"
            title="Welcome form"
            body="Where the family lives, who else is in it, and any animals. The one-time screen a new family sees before any of the other questions."
          />
          <PracticeTile
            href="/interview-check/interview"
            title="Nine-question interview"
            body="How the family travels: pace, days, doing or seeing, where you stay, how you get around, food, crowds, money, and anything Aly should not do. The interview the launcher on Family opens."
          />
          <PracticeTile
            href="/interview-check/about-you"
            title="About you"
            body="A paragraph on the primary's own page for what they are like on a trip. The one thing Aly reads before every answer she writes."
          />
        </div>

        <p className="mt-8 text-xs text-ink-soft">
          Animals travel trip by trip -- the questions about a specific animal
          on a specific trip live on the trip itself, not here.
        </p>
      </main>
    </>
  );
}

function PracticeTile({ href, title, body }) {
  return (
    <Link
      href={href}
      className="card block rounded-2xl p-4 transition hover:border-teal/60 hover:shadow-sm"
    >
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{body}</p>
    </Link>
  );
}
