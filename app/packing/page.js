import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import { TEMPLATES_FOCUS } from "@/lib/agent/context";
import Templates from "./Templates";

export const metadata = { title: "Packing templates · Alyeska" };

export default async function PackingTemplatesPage() {
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

  const [{ data: profile }, { data: travelers }, { data: templates }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("travelers")
        .select("id, name, sort_order, is_person")
        .order("sort_order", { ascending: true }),
      supabase
        .from("packing_templates")
        .select("id, name, description, is_base")
        .eq("family_id", familyId)
        .order("is_base", { ascending: false })
        .order("name", { ascending: true }),
    ]);

  // The items for every template at once: there are a few hundred at most, and
  // one read means switching between lists is instant rather than a spinner.
  const ids = (templates || []).map((t) => t.id);
  const { data: items } = ids.length
    ? await supabase
        .from("packing_template_items")
        .select(
          "id, template_id, category, item, assignee, quantity, sort_order",
        )
        .in("template_id", ids)
        .order("sort_order", { ascending: true })
    : { data: [] };

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-5 pb-28 pt-7">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold">
            Packing templates
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            The packing templates every trip starts from, sorted by who packs
            what. Change something here and it applies to the next trip you
            create — trips already on the board keep the lists they have, so
            nothing you have already ticked off gets rewritten underneath you.
          </p>
        </div>
        <Templates
          travelers={(travelers || [])
            .filter((t) => t.is_person)
            .map((t) => t.name)}
          templates={templates || []}
          items={items || []}
        />
      </main>
      <AskAlyGeneral focus={TEMPLATES_FOCUS} />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
