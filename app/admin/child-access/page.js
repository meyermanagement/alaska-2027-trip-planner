import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import TopBar from "@/components/TopBar";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "Parent verification · Alyeska" };
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await whoIs(await createClient());
  if (!isAdminUser(user)) notFound();
  const { data, error } = await createAdminClient().from("child_access_requests")
    .select("id,status,requested_at,travelers(name)")
    .order("requested_at", { ascending: false }).limit(100);
  return <>
    <TopBar />
    <main className="screen px-5 pb-16 pt-7">
      <a href="/admin" className="text-sm text-ink-soft underline">Back to Admin</a>
      <PageHeader title="Archived child requests" subtitle="Historical requests only. These records do not activate access." />
      <p className="card mt-6 p-5">Child AI access is unavailable. Parents now manage read-only itinerary and packing access from Family &amp; pets → Child access.</p>
      {error ? <p role="alert" className="card mt-6 p-5">Parent verification is not available yet. No requests were changed.</p>
        : <ul className="card mt-5 divide-y divide-line">{(data || []).map(row => <li key={row.id} className="p-4">
          <p className="font-semibold">{row.travelers?.name || "Removed profile"}</p>
          <p className="mt-1 text-sm text-ink-soft">Archived request · {row.status} at retirement</p>
        </li>)}</ul>}
    </main>
  </>;
}
