import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import TripView from "@/components/TripView";
import { todayISO } from "@/lib/reminders";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("trips")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  return { title: `${data?.name || "Trip"} · Alyeska` };
}

export default async function TripPage({ params }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!trip) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const [
    itinerary,
    packing,
    tasks,
    notes,
    travelers,
    roster,
    tips,
    facts,
    templates,
    templateItems,
  ] = await Promise.all([
    supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", trip.id)
      .order("item_date", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("packing_items")
      .select("*")
      .eq("trip_id", trip.id)
      .is("stashed_at", null)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("predeparture_tasks")
      .select("*")
      .eq("trip_id", trip.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_notes")
      .select("*")
      .eq("trip_id", trip.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("travelers")
      .select("id, name, color, is_person, sort_order")
      .eq("family_id", trip.family_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_travelers")
      .select("traveler_id")
      .eq("trip_id", trip.id),
    // Pro tips for this trip, and whether the place has ever been researched.
    // The second one is what lets the screen say "nothing yet" rather than
    // "nothing", which are different claims.
    supabase
      .from("pro_tips")
      .select("*")
      .eq("trip_id", trip.id)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    supabase
      .from("trip_facts")
      .select("checked_at")
      .eq("trip_id", trip.id)
      .maybeSingle(),
    // The packing templates, so an item invented while packing for this trip
    // can be sent to the list every future trip starts from without leaving
    // the suitcase.
    supabase
      .from("packing_templates")
      .select("id, name, is_base")
      .eq("family_id", trip.family_id)
      .order("is_base", { ascending: false })
      .order("name", { ascending: true }),
    // And what those templates already hold, so a packing row can say which one
    // it is kept on. Names and people only — enough to recognize the same item
    // without reading every field of every template. Row-level security limits
    // these to the family's own templates.
    supabase
      .from("packing_template_items")
      .select("template_id, item, assignee"),
  ]);

  return (
    <>
      <TopBar />
      <TripView
        trip={trip}
        initialItinerary={itinerary.data || []}
        initialPacking={packing.data || []}
        initialTasks={tasks.data || []}
        initialNotes={notes.data || []}
        travelers={(travelers.data || []).map((t) => t.name)}
        people={(travelers.data || []).filter((t) => t.is_person)}
        initialGoing={(roster.data || []).map((r) => r.traveler_id)}
        tips={tips.data || []}
        everLooked={Boolean(facts.data?.checked_at)}
        packingTemplates={templates.data || []}
        packingTemplateItems={templateItems.data || []}
        today={todayISO()}
        userId={user.id}
        userName={profile?.display_name || "Family member"}
      />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
