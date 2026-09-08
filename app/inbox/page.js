import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import { inboxAddressFor } from "@/lib/inbox/address";
import InboxScreen from "./InboxScreen";
import { isPastTrip } from "@/lib/format";

export const metadata = { title: "Inbox · Alyeska" };

// The mailbox that catches booking confirmations forwarded to the family's
// trips.alyeska.app address. Reads the pending messages, the trips they might
// be filed onto, and the travelers a message might be attributed to -- three
// independent reads, made together.
export default async function InboxPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id, families (id, name, inbox_local_part)")
    .eq("user_id", user.id);
  if (!memberships || memberships.length === 0) redirect("/join");

  // A secondary traveler cannot act on inbox messages -- the filing decision
  // and the forwarder-trust decision are both primary-level -- so send them
  // somewhere they can actually do something.
  const access = await resolveAccess(supabase, user);
  if (access?.can.isSecondary) redirect("/trips");

  const familyId = memberships[0].family_id;
  const household = memberships[0].families;

  const [{ data: pending }, { data: trips }, { data: travelers }] =
    await Promise.all([
      supabase
        .from("inbox_messages")
        .select(
          "id, from_email, from_name, subject, text_body, received_at, classification, attributed_traveler_id",
        )
        .eq("family_id", familyId)
        .eq("status", "pending")
        .order("received_at", { ascending: false }),
      supabase
        .from("trips")
        .select("id, name, slug, public_id, start_date, end_date, status")
        .eq("family_id", familyId)
        .order("start_date", { ascending: true }),
      supabase
        .from("travelers")
        .select("id, name, color, sort_order, email")
        .eq("family_id", familyId)
        .eq("is_person", true)
        .order("sort_order", { ascending: true }),
    ]);

  // Attachments in one round-trip, keyed by message id in the client.
  const ids = (pending || []).map((m) => m.id);
  let attachments = [];
  if (ids.length) {
    const { data } = await supabase
      .from("inbox_attachments")
      .select("id, message_id, mime_type, size_bytes, original_filename")
      .in("message_id", ids);
    attachments = data || [];
  }

  // Trips split into upcoming (the sensible default in the file-it picker)
  // and past (for the odd case where a family is filing a confirmation
  // long after the trip is over). The picker on the client keeps them in
  // two groups.
  const upcoming = (trips || []).filter((t) => !isPastTrip(t));
  const past = (trips || []).filter((t) => isPastTrip(t));

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-3">
        <InboxScreen
          address={inboxAddressFor(household?.inbox_local_part)}
          messages={pending || []}
          attachments={attachments}
          upcomingTrips={upcoming}
          pastTrips={past}
          travelers={travelers || []}
        />
      </main>
      <AskAlyGeneral />
    </>
  );
}
