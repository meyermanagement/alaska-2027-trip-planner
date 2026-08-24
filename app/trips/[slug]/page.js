import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import TripView from "@/components/TripView";

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

  const [itinerary, packing, tasks, notes, travelers, roster] = await Promise.all([
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
    supabase.from("trip_travelers").select("traveler_id").eq("trip_id", trip.id),
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
        userId={user.id}
        userName={profile?.display_name || "Family member"}
      />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
