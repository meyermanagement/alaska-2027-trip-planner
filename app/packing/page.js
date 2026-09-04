import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import { TEMPLATES_FOCUS } from "@/lib/agent/context";
import { templateScope } from "@/lib/packing/propagate";
import { loadPropagation, CLOSED } from "@/lib/packing/propagateRun";
import { tripPath } from "@/lib/trips/route";
import { homeToday } from "@/lib/format";
import TripPackingLinks from "@/components/TripPackingLinks";
import Templates from "./Templates";
import PetTemplates from "./PetTemplates";

export const metadata = { title: "Packing templates · Alyeska" };

export default async function PackingTemplatesPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  if (!memberships || memberships.length === 0) redirect("/join");

  // A secondary traveler has no read access to what this screen is made of, so
  // the page would render as a set of empty panels. Sending them somewhere real
  // is kinder than showing them a room they cannot enter.
  const access = await resolveAccess(supabase, user);
  if (access?.can.isSecondary) redirect("/trips");
  const familyId = memberships[0].family_id;

  const [{ data: travelers }, { data: templates }, { data: pets }] =
    await Promise.all([
      supabase
        .from("travelers")
        .select("id, name, sort_order, is_person")
        .order("sort_order", { ascending: true }),
      supabase
        .from("packing_templates")
        .select("id, name, description, is_base, pet_id")
        .eq("family_id", familyId)
        .order("is_base", { ascending: false })
        .order("name", { ascending: true }),
      // The animals, so each one's list can be shown under its own name rather
      // than as another add-on with a person's chip on it.
      supabase
        .from("pets")
        .select("id, name, species, color, sort_order")
        .eq("family_id", familyId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

  // The items for every template at once: there are a few hundred at most, and
  // one read means switching between lists is instant rather than a spinner.
  const ids = (templates || []).map((t) => t.id);
  const { data: items } = ids.length
    ? await supabase
        .from("packing_template_items")
        .select(
          "id, template_id, category, item, assignee, quantity, sort_order, last_minute",
        )
        .in("template_id", ids)
        .order("sort_order", { ascending: true })
    : { data: [] };

  // A pet's list is not an add-on the family picks between: it applies whenever
  // that animal is coming. So it is split out here and shown in its own panel
  // rather than sitting in the same row of chips as the destination add-ons,
  // where the person-by-person grouping would also mark the pet's own name as
  // somebody who is not on the People list.
  const petTemplates = (templates || []).filter((t) => t.pet_id);
  const familyTemplates = (templates || []).filter((t) => !t.pet_id);

  // Which upcoming trips each list actually reaches, worked out from the same
  // rows and the same rule the push button uses -- a link here that disagreed
  // with what the button then did would be worse than no link. Loaded after the
  // templates because it is only used to decorate them, and a failure to read it
  // should cost the links rather than the screen.
  //
  // An animal's list is a different rule and is worked out separately: it applies
  // whenever the animal is coming, so its reach is the trip roster rather than
  // anything about the list itself.
  // With no templates at all, the screen offers to build the first one out of a
  // trip the family has already packed for -- so it has to know which trips those
  // are. Read only in that case, and only the count: a trip with an empty list is
  // not a source, and offering it would end in "I found nothing to copy".
  let packedTrips = [];
  if (familyTemplates.length === 0) {
    const { data: trips } = await supabase
      .from("trips")
      .select("id, name, start_date, packing_items(count)")
      .eq("family_id", familyId)
      .order("start_date", { ascending: false });
    packedTrips = (trips || [])
      .map((t) => ({
        id: t.id,
        name: t.name,
        start_date: t.start_date || null,
        itemCount: t.packing_items?.[0]?.count || 0,
      }))
      .filter((t) => t.itemCount > 0);
  }

  // A quiet line of links above the heading, so the list somebody actually ticks
  // is one tap from here instead of three screens away. A trip
  // that started before today but has not ended yet is the most important one on
  // this screen, so the window is "has not ended" rather than "has not started"
  // -- which is the one place this disagrees with loadPropagation, and it should:
  // a push writes onto trips that have not begun, but you pack for the trip you
  // are on. Drafts are excluded here for the same reason they are excluded there.
  //
  // How many lines each list has, with the same stashed_at filter the trip's own
  // Packing tab uses -- a stashed line is not on the list, so it should not be in
  // the count. It is here only so a link can say whether there is a list at all.
  const today = homeToday();
  const { data: soonTrips } = await supabase
    .from("trips")
    // Only what a link needs: the name to show, the key and slug to build the
    // URL, the status to close it out. Dates are filtered and ordered on without
    // being read back, because nothing here says them out loud any more.
    .select("id, name, status, public_id, slug")
    .eq("family_id", familyId)
    .neq("status", "draft")
    .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`)
    .order("start_date", { ascending: true })
    .limit(8);

  const soonIds = (soonTrips || []).map((t) => t.id);
  const { data: soonItems } = soonIds.length
    ? await supabase
        .from("packing_items")
        .select("trip_id")
        .in("trip_id", soonIds)
        .is("stashed_at", null)
    : { data: [] };

  const counts = new Map();
  for (const row of soonItems || []) {
    counts.set(row.trip_id, (counts.get(row.trip_id) || 0) + 1);
  }
  const upcoming = (soonTrips || [])
    // The same closed-status rule the push uses, imported rather than repeated,
    // so a trip that stops being upcoming stops being both at once.
    .filter((t) => !CLOSED.includes(String(t.status || "").toLowerCase()))
    .map((t) => ({ ...t, total: counts.get(t.id) || 0 }));

  let tripsByTemplate = {};
  let tripsByPet = {};
  // Drafts are not here: nothing packs for a draft, so a draft is not somewhere
  // one of these lists can reach.
  const link = (trip) => ({
    id: trip.id,
    name: trip.name,
    start_date: trip.start_date || null,
    href: tripPath(trip, "packing"),
  });
  try {
    const loaded = await loadPropagation({ supabase, familyId });
    const { byTemplate } = templateScope(loaded);
    const tripById = new Map(loaded.trips.map((t) => [t.id, t]));
    tripsByTemplate = Object.fromEntries(
      Array.from(byTemplate.entries()).map(([templateId, tripIds]) => [
        templateId,
        tripIds
          .map((id) => tripById.get(id))
          .filter(Boolean)
          .map((trip) => link(trip)),
      ]),
    );
    if (loaded.trips.length && petTemplates.length) {
      const { data: petLinks } = await supabase
        .from("trip_pets")
        .select("trip_id, pet_id")
        .in(
          "trip_id",
          loaded.trips.map((t) => t.id),
        );
      const perPet = new Map();
      for (const row of petLinks || []) {
        if (!perPet.has(row.pet_id)) perPet.set(row.pet_id, []);
        perPet.get(row.pet_id).push(row.trip_id);
      }
      tripsByPet = Object.fromEntries(
        Array.from(perPet.entries()).map(([petId, tripIds]) => [
          petId,
          loaded.trips.filter((t) => tripIds.includes(t.id)).map(link),
        ]),
      );
    }
  } catch {
    tripsByTemplate = {};
    tripsByPet = {};
  }

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-5 pb-28 pt-7">
        <TripPackingLinks trips={upcoming} />
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
          templates={familyTemplates}
          items={items || []}
          tripsByTemplate={tripsByTemplate}
          packedTrips={packedTrips}
        />
        <PetTemplates
          pets={pets || []}
          templates={petTemplates}
          items={(items || []).filter((i) =>
            petTemplates.some((t) => t.id === i.template_id),
          )}
          people={(travelers || [])
            .filter((t) => t.is_person)
            .map((t) => t.name)}
          tripsByPet={tripsByPet}
        />
      </main>
      <AskAlyGeneral focus={TEMPLATES_FOCUS} />
    </>
  );
}
