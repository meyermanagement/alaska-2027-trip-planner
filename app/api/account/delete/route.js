import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";

/**
 * Deleting an account, and the household with it when the household is one
 * person.
 *
 * The beta terms and the privacy policy both promise this, and until now nothing
 * performed it. Two things make it harder than one delete statement.
 *
 * The first is that an account is not a household. family_members links people
 * to a household with a role, so "delete my account" means two different things
 * depending on who else is in there, and the person clicking it means the larger
 * one. Deleting a household out from under the people still using it would be
 * worse than not deleting anything, so the scope is decided here from the
 * membership rather than accepted from the browser, and the one genuinely
 * ambiguous case -- the last owner of a household other people are still in --
 * is refused until they choose in words.
 *
 * The second is that no cascade reaches Storage. The database will happily take
 * the row that names a passport scan and leave the scan itself sitting in a
 * bucket. So the paths are collected before anything is deleted, and the objects
 * are removed after, and a file we could not remove is written into the request
 * row rather than thrown away -- an orphan somebody can find is recoverable, an
 * orphan nobody logged is not.
 *
 * Everything reads through the caller's own session until the moment the deletes
 * begin, so the household this deletes is the one row-level security says is
 * theirs. Only then does the service role come out, because deleting an auth
 * user is not something a user's own token can do.
 */

// Storage removes in batches. A household with a long inbox history can carry
// more paths than one call should hold.
const BATCH = 100;

function bad(message, status = 400, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

// Everything under one prefix, not just the paths still named by a row.
//
// The explicit paths from account_deletion_paths are the files the app knows
// about. A cover regenerated three times leaves two objects nothing points at any
// more, and an upload that failed halfway leaves one nobody ever pointed at. Both
// buckets key on the family id as the first folder, so the folder is the honest
// unit of "this household's files".
//
// Recursive, because the documents bucket is not flat: a passport sits at
// {family}/personal/{traveler}/{file} and an attachment at {family}/inbox/{...}.
// A one-level walk would list the folder names, find no objects in them, and
// report a clean sweep over files it never looked at. Storage marks a folder by
// returning no id, and the depth cap is there so a surprising layout costs a
// truncated sweep rather than an unbounded walk.
async function sweepFolder(admin, bucket, prefix, depth = 0) {
  if (depth > 4) return [];
  const found = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) {
        found.push(path);
      } else {
        found.push(...(await sweepFolder(admin, bucket, path, depth + 1)));
      }
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return found;
}

async function removeAll(admin, bucket, paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  let removed = 0;
  const errors = [];
  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);
    const { data, error } = await admin.storage.from(bucket).remove(slice);
    if (error) {
      errors.push({ bucket, paths: slice, message: error.message });
    } else {
      removed += data?.length || 0;
    }
  }
  return { removed, errors };
}

export async function POST(request) {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  if (!me) return bad("Not signed in.", 401);

  const admin = createAdminClient();
  if (!admin) {
    return bad(
      "Deletion is unavailable on this deployment. Write to admin@alyeska.app and we will do it by hand.",
      503,
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Which household, and what standing in it. Read through the caller's session
  // on purpose: if the policy would not show them this row, this route has no
  // business deleting on the strength of it.
  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id, role")
    .eq("user_id", me.id)
    .maybeSingle();

  const familyId = membership?.family_id || null;

  let others = [];
  let familyName = "";
  if (familyId) {
    const { data: family } = await supabase
      .from("families")
      .select("name")
      .eq("id", familyId)
      .maybeSingle();
    familyName = family?.name || "";

    const { data: members } = await supabase
      .from("family_members")
      .select("user_id, role")
      .eq("family_id", familyId);
    others = (members || []).filter((m) => m.user_id !== me.id);
  }

  // The scope is decided here, from the membership, and the request only gets to
  // ask for the larger one.
  const asked = body?.scope === "household" ? "household" : "member";
  let scope;

  if (!familyId || others.length === 0) {
    // Nobody else is in it, so there is no such thing as leaving quietly. This
    // is the case the confirmation screen has to be loudest about.
    scope = "household";
  } else if (asked === "household") {
    if (membership.role !== "owner") {
      return bad("Only an owner can delete the whole household.", 403, {
        scope: "member",
        members: others.length,
      });
    }
    // Typed by hand, matched exactly. A dialog somebody clicked through twice is
    // not evidence they meant to delete four years of another person's trips.
    if ((body?.confirm || "").trim() !== familyName.trim()) {
      return bad(
        `Type the household name exactly — ${familyName} — to delete the whole household.`,
        409,
        { needsConfirmName: true },
      );
    }
    scope = "household";
  } else {
    const ownersLeft = others.filter((m) => m.role === "owner").length;
    if (membership.role === "owner" && ownersLeft === 0) {
      // The refusal that protects the people still in there. Deleting the last
      // owner's seat would leave a household nobody can administer, and silently
      // promoting somebody is a decision this route does not get to make.
      return bad(
        `You are the last owner of ${familyName}. Make somebody else an owner first, or choose to delete the whole household.`,
        409,
        { lastOwner: true, members: others.length, householdName: familyName },
      );
    }
    scope = "member";
  }

  // The receipt, opened before anything is touched and stamped when the run
  // finishes. An open row is the retry queue.
  const { data: receipt, error: receiptError } = await admin
    .from("deletion_requests")
    .insert({
      user_id: me.id,
      user_email: me.email || "unknown",
      family_id: familyId,
      scope,
      requested_by: "self",
    })
    .select("id")
    .single();

  if (receiptError) {
    return bad(
      "We could not start the deletion. Nothing was removed. Please try again.",
      500,
    );
  }

  // Paths first: after the rows go there is nothing left to read them from.
  const { data: paths, error: pathError } = await admin.rpc(
    "account_deletion_paths",
    { p_family: scope === "household" ? familyId : null, p_user: me.id },
  );
  if (pathError) {
    await admin
      .from("deletion_requests")
      .update({ note: `paths: ${pathError.message}` })
      .eq("id", receipt.id);
    return bad(
      "We could not read what needs removing. Nothing was removed.",
      500,
    );
  }

  const byBucket = { documents: [], "feedback-shots": [], "trip-covers": [] };
  for (const row of paths || []) {
    if (byBucket[row.bucket]) byBucket[row.bucket].push(row.path);
  }

  if (scope === "household" && familyId) {
    // Orphans as well as the files still named by a row.
    byBucket.documents.push(
      ...(await sweepFolder(admin, "documents", familyId)),
    );
    byBucket["trip-covers"].push(
      ...(await sweepFolder(admin, "trip-covers", familyId)),
    );
  }

  // Revoke what is live before removing what is stored, so nothing new is made
  // or read in the seconds this takes. Calendar feeds are the important one:
  // their token is a URL somebody's calendar app polls, and it answers without a
  // session.
  const storageErrors = [];

  if (scope === "household" && familyId) {
    await admin.from("calendar_feeds").delete().eq("family_id", familyId);
    await admin.from("push_subscriptions").delete().eq("family_id", familyId);
  } else {
    const { data: mine } = await admin
      .from("travelers")
      .select("id")
      .eq("family_id", familyId)
      .eq("user_id", me.id);
    const travelerIds = (mine || []).map((t) => t.id);
    if (travelerIds.length) {
      await admin
        .from("push_subscriptions")
        .delete()
        .in("traveler_id", travelerIds);
      // The traveler stays -- they are still somebody the household packs for --
      // but the link to a login that no longer exists does not.
      await admin
        .from("travelers")
        .update({ user_id: null, linked_at: null })
        .in("id", travelerIds);
    }
  }

  // Every session everywhere, not just this browser. A token minted a minute ago
  // is valid for an hour, and an hour is long enough to read a household that
  // has been deleted.
  try {
    await admin.auth.admin.signOut(me.id, "global");
  } catch {
    // Not fatal: the user row is about to go, which invalidates them anyway.
  }

  // The rows. One statement in the household case, because the cascade does the
  // rest; the auth delete in the member case, for the same reason.
  if (scope === "household" && familyId) {
    const { error } = await admin.from("families").delete().eq("id", familyId);
    if (error) {
      await admin
        .from("deletion_requests")
        .update({ note: `families: ${error.message}` })
        .eq("id", receipt.id);
      return bad(
        "We could not finish deleting your household. Nothing else was removed and we have logged it.",
        500,
      );
    }
  }

  const { error: authError } = await admin.auth.admin.deleteUser(me.id);
  if (authError) {
    await admin
      .from("deletion_requests")
      .update({ note: `auth: ${authError.message}` })
      .eq("id", receipt.id);
    return bad(
      "Your data was removed but the login could not be deleted. We have logged it and will finish it.",
      500,
    );
  }

  // Files last, because a failure here must not leave the data behind. An
  // orphaned object in a private bucket with no row naming it is a smaller
  // problem than a household that thinks it is deleted and is not.
  let removed = 0;
  for (const [bucket, list] of Object.entries(byBucket)) {
    if (!list.length) continue;
    const result = await removeAll(admin, bucket, list);
    removed += result.removed;
    storageErrors.push(...result.errors);
  }

  await admin
    .from("deletion_requests")
    .update({
      completed_at: new Date().toISOString(),
      objects_removed: removed,
      storage_errors: storageErrors.length ? storageErrors : null,
    })
    .eq("id", receipt.id);

  const response = NextResponse.json({
    ok: true,
    scope,
    objectsRemoved: removed,
    householdDeleted: scope === "household",
  });

  // Clear the session cookies on the way out, so the client lands on /login
  // rather than on a page fetching a household that no longer exists.
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") || cookie.name.startsWith("alyeska_")) {
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }

  return response;
}

/**
 * What the Settings screen asks before it draws the button, so the copy can name
 * the household, count who else is in it, and say which of the two things the
 * button is about to do.
 */
export async function GET() {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  if (!me) return bad("Not signed in.", 401);

  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id, role")
    .eq("user_id", me.id)
    .maybeSingle();

  if (!membership?.family_id) {
    return NextResponse.json({
      scope: "household",
      householdName: "",
      others: 0,
      role: null,
      lastOwner: false,
    });
  }

  const { data: family } = await supabase
    .from("families")
    .select("name")
    .eq("id", membership.family_id)
    .maybeSingle();

  const { data: members } = await supabase
    .from("family_members")
    .select("user_id, role")
    .eq("family_id", membership.family_id);

  const others = (members || []).filter((m) => m.user_id !== me.id);
  const ownersLeft = others.filter((m) => m.role === "owner").length;

  return NextResponse.json({
    scope: others.length ? "member" : "household",
    householdName: family?.name || "",
    others: others.length,
    role: membership.role,
    lastOwner: membership.role === "owner" && ownersLeft === 0,
  });
}
