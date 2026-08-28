import { reminderEmail } from "./reminder";
import { sendEmail } from "./send";
import { remindersDueToday } from "@/lib/tasks/dueToday";
import { todayISO } from "@/lib/reminders";

/**
 * The morning run: work out who owes what today, and email them once.
 *
 * Reads go through whichever client is handed in. The cron passes a service-role
 * client because there is no signed-in person at 7am; the Family tab's "send me
 * mine" button passes the visitor's own client, so RLS still decides what that
 * request can see.
 *
 * Every send is written to task_reminder_emails before the next one starts, and
 * the ledger's unique index is the thing that stops a second run of the same day
 * repeating itself. Belt and braces: the insert is checked, so if two runs
 * overlap the loser skips the send rather than racing it.
 *
 * @param {object} input
 * @param {import("@supabase/supabase-js").SupabaseClient} input.supabase
 * @param {string} input.siteUrl
 * @param {string} [input.today] YYYY-MM-DD, for testing
 * @param {string} [input.onlyTravelerId] send just this person's list
 * @param {boolean} [input.record] false to send without writing the ledger
 */
export async function sendDueTodayReminders({
  supabase,
  siteUrl,
  today = todayISO(),
  onlyTravelerId = null,
  record = true,
}) {
  const [
    { data: tasks, error: taskError },
    { data: travelers },
    { data: crew },
  ] = await Promise.all([
    supabase
      .from("predeparture_tasks")
      .select(
        "id, title, detail, assignee, due_date, timing, priority, is_done, trip_id, trip:trips(id, name, slug, start_date, end_date, status, family_id)",
      )
      .eq("is_done", false),
    supabase
      .from("travelers")
      .select("id, name, email, family_id, is_person, wants_reminders")
      .eq("is_person", true),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
  ]);

  if (taskError) {
    return { ok: false, error: taskError.message, status: 500 };
  }

  const rosterByTrip = new Map();
  for (const row of crew || []) {
    if (!rosterByTrip.has(row.trip_id))
      rosterByTrip.set(row.trip_id, new Set());
    rosterByTrip.get(row.trip_id).add(row.traveler_id);
  }

  // Which pairs have already had their email. Scoped to today, because the same
  // task legitimately comes round again on a later date.
  const alreadySent = new Set();
  if (record) {
    const { data: ledger } = await supabase
      .from("task_reminder_emails")
      .select("task_id, traveler_id")
      .eq("due_for", today);
    for (const row of ledger || []) {
      alreadySent.add(`${row.task_id}:${row.traveler_id}`);
    }
  }

  const batches = remindersDueToday({
    tasks: tasks || [],
    travelers: travelers || [],
    rosterByTrip,
    today,
    alreadySent: record ? alreadySent : null,
  }).filter((b) => !onlyTravelerId || b.person.id === onlyTravelerId);

  const { data: families } = await supabase.from("families").select("id, name");
  const familyNames = new Map(
    (families || []).map((row) => [row.id, row.name]),
  );

  const sent = [];
  const failed = [];

  for (const batch of batches) {
    const { person, items } = batch;

    // Claim the work first. If the insert loses to another run, that run is
    // already sending this exact email and this one should stay quiet.
    if (record) {
      const { error } = await supabase.from("task_reminder_emails").insert(
        items.map((item) => ({
          task_id: item.id,
          traveler_id: person.id,
          due_for: today,
        })),
      );
      if (error) continue;
    }

    const message = reminderEmail({
      name: person.name,
      email: person.email,
      siteUrl,
      familyName: familyNames.get(person.family_id) || "family",
      items,
    });

    const result = await sendEmail({
      to: person.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (result.ok) {
      sent.push({ to: person.email, name: person.name, count: items.length });
    } else {
      failed.push({ to: person.email, error: result.error });
      // The claim was a promise to send, and we did not keep it. Give the rows
      // back so tomorrow's run - or a retry - tries again.
      if (record) {
        await supabase
          .from("task_reminder_emails")
          .delete()
          .eq("due_for", today)
          .eq("traveler_id", person.id)
          .in(
            "task_id",
            items.map((i) => i.id),
          );
      }
    }
  }

  return { ok: true, today, sent, failed, considered: batches.length };
}
