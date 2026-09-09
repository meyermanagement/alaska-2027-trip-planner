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

  // The undo window on an auto-filed message is 24 hours; anything older
  // than that stops being offered as undoable and drops off this list on
  // the next render, even though the message stays filed forever.
  const undoCutoffISO = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    { data: pending },
    { data: trips },
    { data: travelers },
    { data: autoFiled },
  ] = await Promise.all([
    supabase
      .from("inbox_messages")
      .select(
        "id, from_email, from_name, subject, text_body, received_at, classification, attributed_traveler_id, parse_status, parse_error",
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
    // Messages this family auto-filed in the last 24 hours. The Undo band
    // above the pending list shows them so a bad match is one tap of work
    // to reverse. Anything older is not shown -- the itinerary is not
    // haunted by ghost undo buttons forever.
    supabase
      .from("inbox_messages")
      .select(
          "id, subject, from_email, from_name, filed_trip_id, auto_filed_at, trips!inbox_messages_filed_trip_id_fkey (id, name, slug, public_id)",
        )
      .eq("family_id", familyId)
      .eq("auto_filed", true)
      .gte("auto_filed_at", undoCutoffISO)
      .order("auto_filed_at", { ascending: false }),
  ]);

  // Attachments and parsed items in parallel round-trips, keyed by message
  // id in the client. Parsed items are what the extractor staged for the
  // primary to approve; the card shows a one-line summary so filing feels
  // like confirming rather than reading.
  const ids = (pending || []).map((m) => m.id);
  let attachments = [];
  let parsedItems = [];
  if (ids.length) {
    const [{ data: att }, { data: pi }] = await Promise.all([
      supabase
        .from("inbox_attachments")
        .select("id, message_id, mime_type, size_bytes, original_filename")
        .in("message_id", ids),
      supabase
        .from("inbox_parsed_items")
        .select("id, message_id, category, title, item_date, confidence, status")
        .in("message_id", ids)
        .eq("status", "pending")
        .order("sort_order", { ascending: true }),
    ]);
    attachments = att || [];
    parsedItems = pi || [];
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
          parsedItems={parsedItems}
          autoFiled={autoFiled || []}
          upcomingTrips={upcoming}
          pastTrips={past}
          travelers={travelers || []}
        />
      </main>
      <AskAlyGeneral />
    </>
  );
}
