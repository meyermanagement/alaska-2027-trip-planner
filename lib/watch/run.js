// The watcher: read the deadlines, warn once, retire what has passed.
//
// This is the only impure half of the feature. The judgement about which deadlines
// are worth interrupting somebody about lives in lib/watch/deadlines.js and is
// tested there; everything here is reading rows, writing the ledger and pushing
// bytes at a phone.
//
// The order of operations matters and is deliberate. The ledger row is written
// before the notification is sent, not after, because the failure that costs the
// family something is not a missed alert -- the next run picks that up -- it is the
// same alert arriving eleven times because each attempt fell over after delivering.
// So a warning is claimed first and delivered second, and a delivery that fails
// leaves a row saying so.

import { deadlinesInView, FARE, LAST_CALL, OFFER } from "@/lib/watch/deadlines";
import { sendPush, pushConfigured } from "@/lib/push/send";
import { consentIsCurrent } from "@/lib/beta/consent";
import { deadlineEmail } from "@/lib/email/deadline";
import { sendEmail } from "@/lib/email/send";
import { homeToday } from "@/lib/format";

/**
 * One pass over one household's deadlines.
 *
 * @param {object} input
 * @param {object} input.supabase   a client that can read every family (service key)
 * @param {string} input.siteUrl    origin of the deployment, no trailing slash
 * @param {string} [input.today]    YYYY-MM-DD in the household's zone
 * @param {string} [input.familyId] one household; otherwise the first one found
 * @param {boolean} [input.dryRun]  work out what would be sent and send nothing
 * @returns {Promise<object>} the outcome, shaped for the watch_runs ledger
 */
export async function runDeadlineWatch({
  supabase,
  siteUrl,
  today = homeToday(),
  familyId = null,
  dryRun = false,
}) {
  const outcome = {
    ok: true,
    today,
    familyId,
    considered: 0,
    sent: [],
    failed: [],
    skipped: [],
    expired: 0,
    channel: null,
    error: null,
  };

  try {
    let family = familyId;
    if (!family) {
      const { data } = await supabase.from("families").select("id").limit(1);
      family = data?.[0]?.id || null;
    }
    if (!family) {
      outcome.error = "No household was found to watch.";
      outcome.ok = false;
      return outcome;
    }
    outcome.familyId = family;

    const [{ data: deals }, { data: offers }] = await Promise.all([
      supabase
        .from("flight_deals")
        .select(
          "id, family_id, origin, destination, destination_code, price, currency, cabin, airline, book_by, travel_start, travel_end, seats, source_name, status",
        )
        .eq("family_id", family)
        .eq("status", "open"),
      supabase
        .from("card_offers")
        .select(
          "id, family_id, issuer, card_name, bonus_text, min_spend, spend_window_days, offer_ends_on, status",
        )
        .eq("family_id", family)
        .eq("status", "open"),
    ]);

    const { alerts, expired } = deadlinesInView({
      deals: deals || [],
      offers: offers || [],
      today,
      siteUrl,
    });
    outcome.considered = alerts.length;

    // A fare past its book-by date is retired whether or not anything is sent.
    // Nobody is told; the open list simply stops presenting a dead price as
    // something to act on, which is the honest thing for it to do.
    if (expired.length && !dryRun) {
      const { error } = await supabase
        .from("flight_deals")
        .update({ status: "expired" })
        .in("id", expired);
      if (!error) outcome.expired = expired.length;
    } else if (expired.length) {
      outcome.expired = expired.length;
    }

    if (!alerts.length) return outcome;

    // What has already been said. Read in one query rather than per alert, and
    // keyed the same way the unique index is: the subject, the stage, and the date
    // it was about. A deadline that moves is a different thing to warn about.
    const { data: already } = await supabase
      .from("deadline_alerts")
      .select("subject_id, stage, deadline_on")
      .eq("family_id", family)
      .in(
        "subject_id",
        alerts.map((a) => a.id),
      );
    const said = new Set(
      (already || []).map((r) => key(r.subject_id, r.stage, r.deadline_on)),
    );

    const fresh = alerts.filter(
      (a) => !said.has(key(a.id, a.stage, a.deadlineOn)),
    );
    outcome.skipped = alerts
      .filter((a) => said.has(key(a.id, a.stage, a.deadlineOn)))
      .map((a) => a.title);

    if (!fresh.length) return outcome;
    if (dryRun) {
      outcome.sent = fresh.map((a) => ({ title: a.title, channel: "dry-run" }));
      return outcome;
    }

    // Where to send. Push if any browser in the household has agreed to it,
    // email if none has. Never both: two copies of the same warning is how a
    // useful channel becomes one people mute.
    const { data: subRows } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, traveler_id, user_id")
      .eq("family_id", family)
      .eq("enabled", true);

    // A subscription is a browser that agreed once. The switch can go off
    // afterwards, and the row stays behind, so it is checked here rather than
    // trusted to the moment of signing up.
    const subs = await onlyWhereStillAllowed(supabase, subRows || []);

    const usePush = pushConfigured() && subs.length > 0;
    outcome.channel = usePush ? "push" : "email";

    // Claimed before delivery, on purpose. See the note at the top of the file.
    const claimed = [];
    for (const alert of fresh) {
      const { error } = await supabase.from("deadline_alerts").insert({
        family_id: family,
        subject_kind: alert.kind,
        subject_id: alert.id,
        stage: alert.stage,
        deadline_on: alert.deadlineOn,
        channel: usePush ? "push" : "email",
        detail: { title: alert.title, days_left: alert.daysLeft },
      });
      // A duplicate here means another run claimed it a moment ago, which is
      // exactly what the index is for. Not an error, and not something to send.
      if (!error) claimed.push(alert);
    }
    if (!claimed.length) return outcome;

    // Counted off the claimed alerts rather than the delivery results. An email
    // covers several deadlines in one message, so the number of things sent is not
    // the number of things warned about, and the ledger should say the latter.
    outcome.kinds = {
      [FARE]: claimed.filter((a) => a.kind === FARE).length,
      [OFFER]: claimed.filter((a) => a.kind === OFFER).length,
    };

    if (usePush) {
      await pushAll({ supabase, subs: subs || [], alerts: claimed, outcome });
    } else {
      await emailAll({ supabase, family, alerts: claimed, siteUrl, outcome });
    }

    return outcome;
  } catch (err) {
    outcome.ok = false;
    outcome.error = String(err?.message || err) || "The watch failed.";
    return outcome;
  }
}

/**
 * One notification per deadline, to every browser in the household.
 *
 * Not one notification listing all of them: a phone collapses several into a
 * summary on its own, and a single notification about two unrelated things is one
 * you cannot act on from the lock screen.
 */
async function pushAll({ supabase, subs, alerts, outcome }) {
  for (const alert of alerts) {
    let delivered = 0;
    for (const sub of subs) {
      const result = await sendPush({
        subscription: sub,
        payload: {
          title: alert.title,
          body: alert.body,
          url: alert.url || alert.path,
          // Same tag for the same subject, so a last-call warning replaces the
          // earlier one on the lock screen instead of stacking under it.
          tag: `deadline-${alert.id}`,
          urgent: alert.stage === LAST_CALL,
        },
      });
      if (result.ok) {
        delivered += 1;
        await supabase
          .from("push_subscriptions")
          .update({
            last_sent_at: new Date().toISOString(),
            failures: 0,
            last_error: null,
          })
          .eq("id", sub.id);
      } else if (result.gone) {
        // The push service says this browser is gone. Deleting is the only
        // correct response; retrying is what turns one stale browser into a
        // permanent column of failures.
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        await supabase
          .from("push_subscriptions")
          .update({ last_error: result.error || null })
          .eq("id", sub.id);
      }
    }
    if (delivered > 0) {
      outcome.sent.push({ title: alert.title, channel: "push", to: delivered });
    } else {
      outcome.failed.push({
        title: alert.title,
        error: "No browser accepted the notification.",
      });
    }
  }
}

/**
 * The fallback: one email covering everything running out, to whoever has said
 * they want reminders.
 */
async function emailAll({ supabase, family, alerts, siteUrl, outcome }) {
  const { data: people } = await supabase
    .from("travelers")
    .select("id, name, email, is_person, wants_reminders, user_id")
    .eq("family_id", family);

  // The same permission the morning run checks. A deadline warning is still a
  // reminder, and the fallback channel does not get to ignore the switch just
  // because it is the fallback.
  const allowed = await whoStillAllowsEmail(supabase, people || [], family);

  const to = (people || []).filter(
    (p) =>
      p &&
      p.is_person !== false &&
      p.wants_reminders &&
      p.email &&
      allowed.has(p.id),
  );
  if (!to.length) {
    outcome.failed.push({
      error:
        "Nothing could be sent: no browser has notifications turned on and nobody in the household has both an email address with reminders switched on and the reminders permission left on.",
    });
    return;
  }

  for (const person of to) {
    const { subject, html, text } = deadlineEmail({
      name: person.name,
      email: person.email,
      siteUrl,
      alerts,
    });
    const result = await sendEmail({ to: person.email, subject, html, text });
    if (result.ok) {
      outcome.sent.push({
        title: subject,
        channel: "email",
        to: person.name || person.email,
      });
    } else {
      outcome.failed.push({ title: subject, error: result.error });
    }
  }
}

/** What a run should be written down as. */
export function watchRecord({ outcome, source = "cron" }) {
  return {
    family_id: outcome?.familyId || null,
    source,
    considered: Number(outcome?.considered || 0),
    sent: (outcome?.sent || []).length,
    failed: (outcome?.failed || []).length,
    expired: Number(outcome?.expired || 0),
    error:
      outcome?.ok === false
        ? outcome.error || "The watch failed."
        : outcome?.failed?.[0]?.error || null,
    detail: {
      channel: outcome?.channel || null,
      sent: (outcome?.sent || []).map((s) => ({
        title: s.title || null,
        channel: s.channel || null,
      })),
      skipped: outcome?.skipped || [],
      kinds: countKinds(outcome),
    },
  };
}

function countKinds(outcome) {
  return {
    [FARE]: Number(outcome?.kinds?.[FARE] || 0),
    [OFFER]: Number(outcome?.kinds?.[OFFER] || 0),
  };
}

function key(id, stage, on) {
  return `${id}|${stage}|${String(on || "").slice(0, 10)}`;
}


/**
 * Push subscriptions whose owner still allows being interrupted.
 *
 * One query, and a row with no `user_id` -- an older subscription from before the
 * column existed -- is dropped rather than assumed: guessing yes here is how a
 * person who turned reminders off gets a notification anyway.
 */
async function onlyWhereStillAllowed(supabase, subs) {
  if (!subs.length) return [];
  const userIds = [...new Set(subs.map((s) => s.user_id).filter(Boolean))];
  if (!userIds.length) return [];

  const { data: rows } = await supabase
    .from("beta_consents")
    .select(
      "user_id, agreement_version, privacy_version, age_confirmed, data_acknowledged, features, withdrawn_at",
    )
    .in("user_id", userIds);

  const on = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const features =
      row.features && typeof row.features === "object" ? row.features : {};
    if (consentIsCurrent(row) && features.notifications === true) {
      on.add(row.user_id);
    }
  }
  return subs.filter((s) => s.user_id && on.has(s.user_id));
}


/**
 * Travelers in this household who may be emailed a warning: their own switch if
 * they have a login, the household's owners' switch if they do not.
 */
async function whoStillAllowsEmail(supabase, people, family) {
  const allowed = new Set();
  if (!people.length) return allowed;

  const { data: memberRows } = await supabase
    .from("family_members")
    .select("user_id, role")
    .eq("family_id", family);
  const members = Array.isArray(memberRows) ? memberRows : [];
  const owners = members
    .filter((m) => m.user_id && m.role === "owner")
    .map((m) => m.user_id);

  const userIds = [
    ...new Set([...people.map((p) => p.user_id).filter(Boolean), ...owners]),
  ];
  if (!userIds.length) return allowed;

  const { data: rows } = await supabase
    .from("beta_consents")
    .select(
      "user_id, agreement_version, privacy_version, age_confirmed, data_acknowledged, features, withdrawn_at",
    )
    .in("user_id", userIds);

  const on = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const features =
      row.features && typeof row.features === "object" ? row.features : {};
    if (consentIsCurrent(row) && features.notifications === true) {
      on.add(row.user_id);
    }
  }

  for (const person of people) {
    if (person.user_id) {
      if (on.has(person.user_id)) allowed.add(person.id);
      continue;
    }
    if (owners.length && owners.every((id) => on.has(id))) allowed.add(person.id);
  }
  return allowed;
}
