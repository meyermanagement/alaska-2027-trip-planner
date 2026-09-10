import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { normalizeCovers } from "@/lib/insurance/policy";

export const runtime = "nodejs";

/**
 * Promote one staged insurance policy into a real one, and file the message
 * that carried it.
 *
 * This is the policy half of app/api/inbox/[id]/file/route.js, kept separate
 * rather than folded into it for a reason worth writing down: filing a
 * booking means writing rows onto one trip's itinerary, and filing a policy
 * means creating a family-level record that may then be attached to several
 * trips, including trips that do not exist yet. Same gesture on the card,
 * different shape underneath, and cramming both into one route would have
 * meant a handler where half the parameters are ignored on each path.
 *
 * What it does, in order, and why that order:
 *
 *  1. Insert the policy. Everything after this is an attachment to it, so if
 *     the insert fails there is nothing to clean up.
 *  2. Link the trip the caller named, if any. An annual plan bought in
 *     January can be filed with no trip at all -- the family attaches it to
 *     Curacao and Alaska later, from either trip's Insurance tab.
 *  3. Link the covered travelers. The model returns names as printed on the
 *     certificate; those are matched against the family's people here rather
 *     than in the parser, because matching is a database question and the
 *     parser only sees the mail.
 *  4. Copy any attachment into the policy's own folder. Copied, not moved:
 *     the message keeps its attachment, so the /inbox record of what arrived
 *     stays intact and true. This is also what makes the policy readable on
 *     a plane -- public/sw.js caches the documents bucket by path, and a file
 *     under the policy is fetched by the Insurance tab the first time it is
 *     opened, which is nearly always while there is still signal.
 *  5. Mark the staged row approved and point it at what it became, so a
 *     double-tap on the card cannot create the policy twice.
 *
 * Body:
 *   trip_id      uuid    optional -- link the new policy to this trip
 *   traveler_ids uuid[]  optional -- overrides the name matching
 */
export async function POST(request, { params }) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing message id." }, { status: 400 });
  }

  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    // A policy can be filed with no body at all -- no trip, no traveler
    // overrides -- so an empty or unparseable body is not an error here the
    // way it is on the booking route.
    body = {};
  }

  const tripId = typeof body.trip_id === "string" ? body.trip_id : null;
  const travelerIds = Array.isArray(body.traveler_ids)
    ? body.traveler_ids.filter((v) => typeof v === "string" && v.length > 0)
    : null;

  const { data: message } = await supabase
    .from("inbox_messages")
    .select("id, family_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (tripId) {
    const { data: trip } = await supabase
      .from("trips")
      .select("id, family_id")
      .eq("id", tripId)
      .maybeSingle();
    if (!trip || trip.family_id !== message.family_id) {
      return NextResponse.json(
        { error: "That trip is not on this family." },
        { status: 400 },
      );
    }
  }

  const { data: staged } = await supabase
    .from("inbox_parsed_policies")
    .select("*")
    .eq("message_id", id)
    .is("approved_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!staged) {
    return NextResponse.json(
      { error: "There is no policy waiting on this message." },
      { status: 400 },
    );
  }

  const { data: policy, error: insertError } = await supabase
    .from("insurance_policies")
    .insert({
      family_id: message.family_id,
      kind: staged.kind === "annual" ? "annual" : "trip",
      provider: staged.provider,
      plan_name: staged.plan_name,
      policy_number: staged.policy_number,
      coverage_start: staged.coverage_start,
      coverage_end: staged.coverage_end,
      emergency_phone: staged.emergency_phone,
      claims_phone: staged.claims_phone,
      claims_url: staged.claims_url,
      covers: normalizeCovers(staged.covers),
      premium: staged.premium,
      deductible: staged.deductible,
      medical_limit: staged.medical_limit,
      evacuation_limit: staged.evacuation_limit,
      notes: staged.notes,
      created_by: user.id,
    })
    .select("id")
    .maybeSingle();

  if (insertError || !policy?.id) {
    return NextResponse.json(
      { error: insertError?.message || "Could not save the policy." },
      { status: 400 },
    );
  }

  if (tripId) {
    await supabase
      .from("trip_insurance_policies")
      .insert({ trip_id: tripId, policy_id: policy.id, created_by: user.id });
  }

  // Who the policy names. An explicit list from the caller wins -- the review
  // card lets the primary correct the match before filing -- and otherwise
  // the printed names are matched against the family's people.
  let names = travelerIds;
  if (!names) {
    const { data: people } = await supabase
      .from("travelers")
      .select("id, name, is_person")
      .eq("family_id", message.family_id);
    names = matchInsured(staged.insured_names, people || []);
  }
  if (names.length) {
    await supabase
      .from("insurance_policy_travelers")
      .insert(names.map((tid) => ({ policy_id: policy.id, traveler_id: tid })));
  }

  // The certificate itself, if the mail carried one. Copied under the policy
  // so the Insurance tab can find it without knowing anything about the
  // inbox, and so the service worker caches it against a path that will
  // still be there after the message is thrown out.
  const { data: files } = await supabase
    .from("inbox_attachments")
    .select("storage_path, mime_type, size_bytes, original_filename")
    .eq("message_id", id);

  let copied = 0;
  for (const file of files || []) {
    if (!file?.storage_path) continue;
    const name = (file.original_filename || "policy")
      .replace(/[^\w.\- ]+/g, "_")
      .slice(0, 80);
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${message.family_id}/insurance/${policy.id}/${stamp}-${rand}-${name}`;

    const { error: copyError } = await supabase.storage
      .from("documents")
      .copy(file.storage_path, path);
    // A failed copy is not worth losing the policy over. The primary can
    // still upload the PDF by hand on the Insurance tab, and the policy's
    // numbers -- which is what somebody stuck in a clinic actually needs --
    // are already saved.
    if (copyError) continue;

    const { error: rowError } = await supabase
      .from("insurance_documents")
      .insert({
        policy_id: policy.id,
        family_id: message.family_id,
        storage_path: path,
        mime_type: file.mime_type || "application/octet-stream",
        size_bytes: Number(file.size_bytes) || 0,
        original_filename: file.original_filename || name,
        sort_order: copied,
        created_by: user.id,
      });
    if (rowError) {
      // Do not leave a copy nobody can reach.
      await supabase.storage.from("documents").remove([path]);
      continue;
    }
    copied += 1;
  }

  await supabase
    .from("inbox_parsed_policies")
    .update({
      approved_at: new Date().toISOString(),
      approved_policy_id: policy.id,
    })
    .eq("id", staged.id);

  // Filing the message is the last step, and it only claims a trip when the
  // caller named one. A policy filed with no trip still leaves the inbox --
  // it has been dealt with -- it just has no trip to point at.
  const update = {
    status: "filed",
    filed_at: new Date().toISOString(),
    filed_by: user.id,
  };
  if (tripId) update.filed_trip_id = tripId;
  await supabase.from("inbox_messages").update(update).eq("id", id);

  return NextResponse.json({
    ok: true,
    policy_id: policy.id,
    travelers: names.length,
    documents: copied,
  });
}

/**
 * Printed names to traveler ids. Exact full-name match first, then first
 * name, which is the same two-pass shape the booking parser uses for
 * attribution -- a certificate that says "MEYER/MARK A" should still find
 * Mark, and a certificate that says nothing useful should find nobody rather
 * than guess.
 */
export function matchInsured(insuredNames, people) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const printed = (Array.isArray(insuredNames) ? insuredNames : [])
    .map(norm)
    .filter(Boolean);
  if (!printed.length) return [];

  const out = [];
  for (const person of people) {
    if (person?.is_person === false) continue;
    const name = norm(person.name);
    if (!name) continue;
    const first = name.split(" ")[0];
    const hit = printed.some(
      (p) =>
        p === name ||
        // "meyer mark a" contains both words of "mark meyer", in either
        // order, which is how airline and insurer formatting differs.
        name.split(" ").every((word) => p.split(" ").includes(word)) ||
        (first && p.split(" ").includes(first)),
    );
    if (hit) out.push(person.id);
  }
  return out;
}
