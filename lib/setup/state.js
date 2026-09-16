import { SETUP_ITEM_HREF } from "@/lib/setup/items";

/**
 * How much of the five-things checklist a household still has ahead of it.
 *
 * The screen at /welcome/next-steps names five things worth doing after the
 * interview -- the app on the Home Screen with notifications on, the rest of
 * the family's own words, the Wallet, forwarding, and the trips already taken
 * -- and until now it was shown once, on a path the owner walks a single time,
 * and then never mentioned again. Nothing carried the ask forward, so the
 * things it asked for were the things nobody did. This is what carries them:
 * the menu marks the rows the work is behind and counts what is left.
 *
 * Every signal below is a fact already in the record rather than a checkbox
 * about the checklist, because the checklist is not the point -- a family who
 * filled in their Wallet from the Wallet screen has done the thing whether or
 * not they ever saw the row asking them to.
 *
 * ---- The five signals ----------------------------------------------------
 *
 * install      One enabled push subscription belonging to this person. That
 *              row cannot exist on an iPhone until the site is on the Home
 *              Screen and permission has been granted, so it is the one honest
 *              proof of both halves of the ask at once. Skipped -- counted as
 *              done -- when the server has no push keys set, because a row
 *              asking for something the deployment cannot deliver is a mark
 *              nobody can ever clear.
 *
 * others       Every other person in the house has both halves of what the
 *              owner just answered: a paragraph in About you, and at least one
 *              favorite moment. A household of one has nobody else to describe
 *              and is done by definition.
 *
 * wallet       Anything in the wallet at all -- one travel document or one
 *              rewards program. The row asks for passports, cards, loyalty
 *              numbers and insurance, and demanding every one would leave a
 *              mark on the menu forever for a family who genuinely has one
 *              card and no passport.
 *
 * forwarding   One inbox message, ever, in any status. Saving the address to
 *              a contacts app is invisible from here, so the first forwarded
 *              confirmation is the only honest proof the habit started. A
 *              message that was filed, or thrown out, still proves it.
 *
 * past         One trip whose end date is behind today. Status is not read:
 *              a trip somebody entered as a rough record of last year is the
 *              thing being asked for, whatever they set its status to.
 *
 * ---- Cost ----------------------------------------------------------------
 *
 * The header runs this on every page load, so the first read is one lookup by
 * primary key and it is a latch: once a family finishes -- or says in Settings
 * that they are done -- families.setup_done_at is stamped and every later page
 * load stops at that one row. The seven probes below run only while there is
 * something genuinely outstanding, which is a window of days on a new account
 * and never again.
 *
 * The stamp is written from here when the last of the five lands, so the menu
 * stops asking without waiting for the family to find the Settings control.
 * It is a single idempotent update of one column, and a failure is logged and
 * otherwise ignored: the worst case is that the probes run again next load.
 */
export async function loadSetupState(
  supabase,
  { familyId, travelerId, today, secondary },
) {
  // An invited member is not being asked to do any of this. All five rows are
  // the household owner's work, and /welcome/next-steps turns a secondary away
  // at the door -- so a mark pointing them at it would point at a locked room.
  if (secondary || !familyId) return null;

  const { data: family } = await supabase
    .from("families")
    .select("setup_done_at")
    .eq("id", familyId)
    .maybeSingle();
  if (!family || family.setup_done_at) return null;

  // The same two variables lib/push/send.js reads, read directly rather than
  // through it: this runs in the header on every page load and pulling the
  // web-push library into that import graph to answer a question about two
  // environment variables is a cost with nothing behind it.
  const pushable = Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );

  const [people, moments, documents, programs, mail, past, subs] =
    await Promise.all([
      supabase.from("travelers").select("id, about_me").eq("is_person", true),
      // Every moment in the family, by whose it is. Only the id column, because
      // the question here is which people have one rather than what they said.
      supabase.from("favorite_moments").select("traveler_id"),
      supabase
        .from("traveler_documents")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("rewards_programs")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("inbox_messages")
        .select("id", { count: "exact", head: true }),
      supabase.from("trips").select("id").lt("end_date", today).limit(1),
      // This person's own devices, not the household's. The ask is "put me on
      // your Home Screen", and somebody else's phone being signed up says
      // nothing about whether this one is.
      pushable && travelerId
        ? supabase
            .from("push_subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("traveler_id", travelerId)
            .eq("enabled", true)
        : Promise.resolve({ count: 0 }),
    ]);

  const others = (people.data || []).filter((p) => p.id !== travelerId);
  const withMoment = new Set((moments.data || []).map((m) => m.traveler_id));
  const described = (p) =>
    String(p.about_me || "").trim().length > 0 && withMoment.has(p.id);

  const complete = {
    install: !pushable || !travelerId || (subs.count || 0) > 0,
    others: others.length === 0 || others.every(described),
    wallet: (documents.count || 0) > 0 || (programs.count || 0) > 0,
    forwarding: (mail.count || 0) > 0,
    past: (past.data || []).length > 0,
  };

  const keys = Object.keys(SETUP_ITEM_HREF);
  const undone = keys.filter((key) => !complete[key]);

  if (undone.length === 0) {
    const { error } = await supabase
      .from("families")
      .update({ setup_done_at: new Date().toISOString() })
      .eq("id", familyId)
      .is("setup_done_at", null);
    if (error) {
      console.error("[setup] could not stamp setup_done_at", {
        family: familyId,
        code: error.code,
        message: error.message,
      });
    }
    return null;
  }

  return {
    left: undone.length,
    total: keys.length,
    undone,
    done: keys.filter((key) => complete[key]),
    marks: undone.map((key) => SETUP_ITEM_HREF[key]),
  };
}
