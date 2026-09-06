import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import RehearsalBody from "./RehearsalBody";

export const metadata = { title: "Practice interview · Alyeska" };

/**
 * The interview, answered by hand, saving nothing.
 *
 * Aly asks one real question at a time -- real context, real prompt, real model
 * -- and whoever is sitting here answers it in their own words, exactly as they
 * would in the drawer. Every save she attempts is drawn under the question that
 * prompted it instead of being written down, so the questions can be judged as
 * questions and the saves as saves without spending anybody's real file to find
 * out that the third one was wrong.
 */
export default async function InterviewCheckPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");
  const access = await resolveAccess(supabase, user);
  if (access?.can?.isSecondary) redirect("/trips");

  const { data: travelers } = await supabase
    .from("travelers")
    .select("id, name, color, user_id, email")
    .eq("is_person", true)
    .order("sort_order", { ascending: true });

  // Which of these people is the person reading the page, so the interview can
  // say "me" rather than talking about them in the third person.
  const mine = (travelers || []).find(
    (t) =>
      t.user_id === user.id ||
      (t.email &&
        user.email &&
        t.email.toLowerCase() === user.email.toLowerCase()),
  );

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-7">
        <h1 className="font-display text-3xl font-semibold">
          Practice interview
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Aly asks the questions she would really ask, and you answer them here.
          Under each question you can see what she would have written down — and
          none of it is written down.
        </p>
        <RehearsalBody
          people={(travelers || []).map((t) => ({ id: t.id, name: t.name }))}
          me={mine?.id || null}
        />
      </main>
    </>
  );
}
