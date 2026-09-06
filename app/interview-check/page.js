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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, full_name")
    .eq("id", user.id)
    .maybeSingle();
  const myName =
    profile?.display_name ||
    (profile?.full_name ? profile.full_name.split(" ")[0] : "") ||
    (user.email ? user.email.split("@")[0] : "");

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-7">
        <h1 className="font-display text-3xl font-semibold">
          Practice the first login
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          The same three questions the welcome screen asks a brand-new account,
          followed by the interview Aly would run against it. Answer everything
          in your own words. Nothing here is written down.
        </p>
        <RehearsalBody myName={myName || ""} />
      </main>
    </>
  );
}
