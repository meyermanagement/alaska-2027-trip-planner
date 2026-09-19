import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { accountAge } from "@/lib/beta/accountAge";
import MinorReview from "./MinorReview";

export const dynamic = "force-dynamic";
export const metadata = { title: "My trips · Alyeska", robots: { index: false, follow: false } };
export default async function ChildPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");
  const age = await accountAge(supabase, user.id);
  if (!age.minor && !age.unavailable) redirect("/trips");
  // Fetch in the client so private trip data never enters a prefetched RSC payload.
  return <MinorReview />;
}
