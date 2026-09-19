import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import { accountAge } from "@/lib/beta/accountAge";
import TopBar from "@/components/TopBar";
import PageHeader from "@/components/PageHeader";
import ChildAccessPanel from "./ChildAccessPanel";

export const metadata = { title: "Child access · Alyeska" };
export const dynamic = "force-dynamic";

export default async function ChildAccessPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");
  const [access, age] = await Promise.all([
    resolveAccess(supabase, user), accountAge(supabase, user.id),
  ]);
  if (!access || access.can.isSecondary || age.minor) redirect("/welcome/parent");
  return <>
    <TopBar />
    <main className="screen px-5 pb-16 pt-7">
      <a href="/family" className="text-sm text-ink-soft underline">Back to Family &amp; pets</a>
      <PageHeader title="Child access" subtitle="Read-only trip access, managed by a parent or guardian." />
      <ChildAccessPanel />
    </main>
  </>;
}
