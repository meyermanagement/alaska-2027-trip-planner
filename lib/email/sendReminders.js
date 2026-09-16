import { reminderEmail } from "./reminder";
import { sendEmail } from "./send";
import { consentIsCurrent } from "@/lib/beta/consent";
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
 * @param {string} [input.onlyFamilyId] restrict to one household
 * @param {boolean} [input.record] false to send without writing the ledger
 */
export async function sendDueTodayReminders({
  supabase,
  siteUrl,
  today = todayISO(),
  onlyTravelerId = null,
  onlyFamilyId = null,
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
        "id, title, detail, assignee, due_date, timing, priority, is_done, trip_id, trip:trips(id, name, slug, public_id, start_date, end_date, status, family_id)",
      )
      .eq("is_done", false),
    supabase
      .from("travelers")
      .select(
        "id, name, email, family_id, is_person, wants_reminders, user_id",
      )
      .eq("is_person", true),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
  ]);

  if (taskError) {
    return { ok: false, error: taskError.message, status: 500 };
  }

  // Who has agreed to be interrupted.
  //
  // `wants_reminders` is the household's own preference and stays what it is; this
  // is the permission underneath it. The gate asked "reminders before they matter"
  // and offered "check the Reminders screen yourself" for no, and until now the
  // morning run emailed people who had chosen the second answer.
  //
  // A traveler with an account is decided by their own switch. A traveler who has
  // an email but no login -- a partner added by name -- cannot have answered, so
  // the household's owners answer for them, which is the same rule the shared
  // inbox uses. Nobody agreeing means nobody is mailed.
  const notifiable = await whoAgreedToBeInterrupted(
    supabase,
    travelers || [],
  );

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
  })
    .filter((b) => !onlyTravelerId || b.person.id === onlyTravelerId)
    // The catch-up run is started by a person opening a page, but it sends to a
    // whole household, and it has to read with the service key because a browser
    // may not write the send ledger. Those two facts together are how one family's
    // page load ends up emailing another family's people the day a second family
    // exists. The household is named explicitly rather than left to RLS, because
    // the client doing the reading has no RLS to leave it to.
    .filter((b) => !onlyFamilyId || b.person.family_id === onlyFamilyId);

  const declined = batches.filter((b) => !notifiable.has(b.person.id)).length;

  const sent = [];
  const failed = [];

  for (const batch of batches) {
    const { person, items } = batch;
    if (!notifiable.has(person.id)) continue;

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

  return {
    ok: true,
    today,
    sent,
    failed,
    considered: batches.length,
    // People who had work due and were not mailed because they never agreed to be
    // interrupted. Counted rather than named: the run record is evidence that the
    // switch is honored, not a list of who declined.
    declined,
  };
}


/**
 * The set of traveler ids this run is allowed to email.
 *
 * One query for every relevant consent row rather than one per person, because
 * this runs inside a nightly job with a time limit and a household can be large.
 */
async function whoAgreedToBeInterrupted(supabase, travelers) {
  const allowed = new Set();
  if (!travelers.length) return allowed;

  const userIds = [...new Set(travelers.map((t) => t.user_id).filter(Boolean))];

  const { data: memberRows } = await supabase
    .from("family_members")
    .select("user_id, family_id, role")
    .in("family_id", [...new Set(travelers.map((t) => t.family_id))]);
  const members = Array.isArray(memberRows) ? memberRows : [];
  const speakerIds = [
    ...new Set(
      members.filter((m) => m.user_id && m.role === "owner").map((m) => m.user_id),
    ),
  ];

  const { data: rows } = await supabase
    .from("beta_consents")
    .select(
      "user_id, agreement_version, privacy_version, age_confirmed, data_acknowledged, features, withdrawn_at",
    )
    .in("user_id", [...new Set([...userIds, ...speakerIds])]);

  const on = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const features =
      row.features && typeof row.features === "object" ? row.features : {};
    on.set(row.user_id, consentIsCurrent(row) && features.notifications === true);
  }

  // For a traveler with no login: the owners of their household, all of whom have
  // to allow it, which fails in the direction of not interrupting somebody.
  const ownersByFamily = new Map();
  for (const m of members) {
    if (!m.user_id || m.role !== "owner") continue;
    if (!ownersByFamily.has(m.family_id)) ownersByFamily.set(m.family_id, []);
    ownersByFamily.get(m.family_id).push(m.user_id);
  }

  for (const person of travelers) {
    if (person.user_id) {
      if (on.get(person.user_id) === true) allowed.add(person.id);
      continue;
    }
    const owners = ownersByFamily.get(person.family_id) || [];
    if (owners.length && owners.every((id) => on.get(id) === true)) {
      allowed.add(person.id);
    }
  }

  return allowed;
}
