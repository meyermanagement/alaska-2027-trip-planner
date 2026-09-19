import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import TopBar from "@/components/TopBar";
import PageHeader from "@/components/PageHeader";
import ChildAccessReviews from "./ChildAccessReviews";

export const metadata = { title: "Parent verification · Alyeska" };
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await whoIs(await createClient());
  if (!isAdminUser(user)) notFound();
  const { data, error } = await createAdminClient().from("child_access_requests")
    .select("id,ai_requested,requested_at,travelers(name)")
    .eq("status", "pending").gt("expires_at", new Date().toISOString()).order("requested_at");
  return <>
    <TopBar />
    <main className="screen px-5 pb-16 pt-7">
      <a href="/admin" className="text-sm text-ink-soft underline">Back to Admin</a>
      <PageHeader title="Parent verification" subtitle="Review parent-managed child access requests." />
      {error ? <p role="alert" className="card mt-6 p-5">Parent verification is not available yet. No requests were changed.</p>
        : <ChildAccessReviews requests={data || []} />}
    </main>
  </>;
}
