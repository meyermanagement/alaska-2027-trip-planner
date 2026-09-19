import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { accountAge } from "@/lib/beta/accountAge";
import AlyWordmark from "@/components/AlyWordmark";
import ParentWait from "./ParentWait";

export const metadata = { title: "Parent-managed access · Alyeska" };
export const dynamic = "force-dynamic";

export default async function ParentAccessPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");
  const age = await accountAge(supabase, user.id);
  if (!age.minor && !age.unavailable) redirect("/welcome/beta");
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
    <AlyWordmark className="text-[24px]" />
    <ParentWait unavailable={age.unavailable} />
  </main>;
}
