import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import People from "./People";

export const metadata = { title: "People · Alyeska" };

export default async function PeoplePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  if (!memberships || memberships.length === 0) redirect("/join");
  const familyId = memberships[0].family_id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: travelers } = await supabase
    .from("travelers")
    .select("id, name, color, sort_order, is_person, date_of_birth, notes")
    .eq("is_person", true)
    .order("sort_order", { ascending: true });

  const { data: documents } = await supabase
    .from("traveler_documents")
    .select(
      "id, traveler_id, doc_type, label, number, issuing_authority, issue_date, expiration_date, notes, sort_order",
    )
    .order("sort_order", { ascending: true });

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-7">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold">People</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Passports, licenses, Known Traveler and Global Entry numbers — kept
            in one place so nobody is digging through a drawer at booking time.
            Numbers stay hidden until you tap to show them, and only our family
            group can open this page.
          </p>
        </div>
        <People
          familyId={familyId}
          travelers={travelers || []}
          documents={documents || []}
        />
      </main>
      <AskAlyGeneral />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
