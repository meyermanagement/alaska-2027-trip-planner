import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import People from "./People";
import Pets from "./Pets";
import { todayISO } from "@/lib/reminders";
import { passportWarnings } from "@/lib/tips/warnings";

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

  // Seven independent reads, asked for at once rather than in a queue.
  const [
    { data: profile },
    { data: travelers },
    { data: trips },
    { data: rosters },
    { data: documents },
    { data: pets },
    { data: tripPets },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("travelers")
      .select(
        "id, name, color, sort_order, is_person, date_of_birth, notes, email, user_id, invited_at, linked_at, wants_reminders, phone_carrier, phone_device, mobility_aids, accessibility_notes, languages",
      )
      .eq("is_person", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("trips")
      .select(
        "id, name, slug, destination, cover_emoji, start_date, end_date, status, trip_facts (leaves_country, countries)",
      )
      .order("start_date", { ascending: false }),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
    supabase
      .from("traveler_documents")
      .select(
        "id, traveler_id, doc_type, label, number, issuing_authority, issue_date, expiration_date, notes, sort_order",
      )
      .order("sort_order", { ascending: true }),
    supabase
      .from("pets")
      .select(
        "id, name, species, breed, color, sort_order, date_of_birth, weight_lb, travel_style, carrier_size, is_service_animal, microchip_number, rabies_expiration, health_certificate_expiration, vet_name, vet_phone, medications, dietary_notes, temperament_notes, notes",
      )
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_pets")
      .select("trip_id, pet_id, arrangement, arrangement_notes"),
  ]);

  // The passport warning is worked out here rather than fetched, from the trips,
  // the roster and the documents this page has already read. Nothing extra to
  // load, and it cannot disagree with the band in the header because both run the
  // same function over the same two dates.
  const today = todayISO();
  const roster = rosters || [];
  const warnings = passportWarnings({
    trips: (trips || [])
      .filter((trip) => trip.end_date && trip.end_date >= today)
      .map((trip) => ({
        ...trip,
        leavesCountry: trip.trip_facts?.leaves_country === true,
        countries: trip.trip_facts?.countries || [],
        going: roster
          .filter((row) => row.trip_id === trip.id)
          .map((row) => (travelers || []).find((t) => t.id === row.traveler_id))
          .filter(Boolean),
      })),
    documents: (documents || []).filter((d) => d.doc_type === "passport"),
    today,
  });

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
          userId={user.id}
          userEmail={user.email}
          travelers={travelers || []}
          documents={documents || []}
          trips={trips || []}
          rosters={rosters || []}
          warnings={warnings}
        />
        <Pets
          familyId={familyId}
          pets={pets || []}
          trips={trips || []}
          tripPets={tripPets || []}
        />
      </main>
      <AskAlyGeneral />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
