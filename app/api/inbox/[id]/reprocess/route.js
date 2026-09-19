import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAccess } from "@/lib/travelers/access";
import { householdAiAllowed } from "@/lib/beta/consent";
import { extractInboxReview } from "@/lib/inbox/parser";
import { requestOrigin, privateHeaders } from "@/lib/childView/server";

export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function context(id) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Please sign in again.");
  const { data: allowed, error: sessionError } = await supabase.rpc("account_session_allowed");
  if (sessionError || allowed !== true) throw new Error("Please sign in again.");
  const access = await resolveAccess(supabase, user);
  if (!access || access.can.isSecondary) throw new Error("Only a primary traveler can reprocess mail.");
  const { data: message, error: messageError } = await supabase.from("inbox_messages").select("*")
    .eq("id", id).eq("family_id", access.familyId).maybeSingle();
  if (messageError || !message) throw new Error("Email not found.");
  const admin = createAdminClient();
  if (!admin) throw new Error("Email reprocessing is temporarily unavailable.");
  return { supabase, user, message, admin };
}

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    if (!uuid.test(id)) return reply({ error: "Email not found." }, 404);
    const { supabase, admin, message } = await context(id);
    // A killed background request cannot leave an infinite loading indicator.
    await admin.from("inbox_reprocess_runs").update({
      status: "failed", error: "The reading timed out. Your original results are unchanged. Please try again.",
      finished_at: new Date().toISOString(),
    }).eq("message_id", id).eq("status", "running").lt("created_at", new Date(Date.now() - 180_000).toISOString());
    const { data: run, error } = await supabase.from("inbox_reprocess_runs")
      .select("id,status,comment,result,error,created_at").eq("message_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return reply({ error: "Reprocessing is not available yet. Please try again later." }, 503);
    const { data: itemRefs, error: itemsError } = await supabase.from("inbox_parsed_items")
      .select("approved_item_id").eq("message_id", id).not("approved_item_id", "is", null);
    const { data: policyRefs, error: policiesError } = await supabase.from("inbox_parsed_policies")
      .select("approved_policy_id").eq("message_id", id).not("approved_policy_id", "is", null);
    if (itemsError || policiesError) throw new Error("Could not load the saved records. Try again.");
    let savedItems = [], savedPolicies = [];
    if (itemRefs?.length) {
      const { data, error } = await supabase.from("itinerary_items").select("id,title,category,item_date,end_date,start_time,location,confirmation_number")
        .in("id", [...new Set(itemRefs.map(r => r.approved_item_id))]);
      if (error) throw new Error("Could not load the saved bookings. Try again.");
      savedItems = data || [];
    }
    if (policyRefs?.length) {
      const { data, error } = await supabase.from("insurance_policies")
        .select("id,provider,plan_name,policy_number,coverage_start,coverage_end,emergency_phone,claims_phone,claims_url,covers,premium,deductible,medical_limit,evacuation_limit")
        .eq("family_id", message.family_id).in("id", [...new Set(policyRefs.map(r => r.approved_policy_id))]);
      if (error) throw new Error("Could not load the saved policies. Try again.");
      savedPolicies = data || [];
    }
    return reply({ run, savedItems, savedPolicies });
  } catch (e) {
    return reply({ error: e.message || "Could not open reprocessing." }, 403);
  }
}

export async function POST(request, { params }) {
  try {
    requestOrigin(request);
    const { id } = await params;
    if (!uuid.test(id)) return reply({ error: "Email not found." }, 404);
    const { supabase, admin, message, user } = await context(id);
    const raw = await request.text();
    if (raw.length > 12_000) return reply({ error: "That request is too long." }, 400);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: "Invalid request." }, 400); }
    if (body.action === "apply") {
      if (!uuid.test(body.run_id)) return reply({ error: "Choose a reading to use." }, 400);
      const { data: run } = await supabase.from("inbox_reprocess_runs").select("id")
        .eq("id", body.run_id).eq("message_id", id).maybeSingle();
      if (!run) return reply({ error: "Reading not found." }, 404);
      const { data, error } = await supabase.rpc("apply_inbox_reprocess", { p_run: run.id, p_choices: body.choices });
      if (error) return reply({ error: error.message }, 409);
      return reply(data);
    }
    if (body.action !== "start" || typeof body.comment !== "string" || body.comment.length > 2000)
      return reply({ error: "Use a comment of 2,000 characters or fewer." }, 400);
    const consent = await householdAiAllowed(admin, {
      familyId: message.family_id, travelerId: message.attributed_traveler_id, feature: "mail",
    });
    if (!consent.allowed) return reply({ error: "Reading forwarded mail is off. Check AI assistance and mail settings first." }, 403);
    const { data: runId, error } = await admin.rpc("begin_inbox_reprocess", {
      p_message: id, p_user: user.id, p_comment: body.comment.trim(),
    });
    if (error) return reply({ error: error.message }, 409);
    after(async () => {
      try {
        const { model, result } = await extractInboxReview({
          supabase: admin, message, comment: body.comment.trim(), signal: AbortSignal.timeout(90_000),
        });
        const { error: saveError } = await admin.from("inbox_reprocess_runs").update({
          status: "ready", result, model, finished_at: new Date().toISOString(),
        }).eq("id", runId).eq("status", "running");
        if (saveError) throw new Error("The new reading could not be saved.");
      } catch (e) {
        // Never expose provider responses, credentials, or raw document text.
        const safe = /^(Reading forwarded|Email reprocessing|Could not read the attachment|An attachment|There is no retained|Aly could not finish|No booking or insurance|The new reading)/.test(e.message || "");
        await admin.from("inbox_reprocess_runs").update({
          status: "failed",
          error: safe ? e.message : "Aly could not finish this reading. Your original results are unchanged. Please try again.",
          finished_at: new Date().toISOString(),
        }).eq("id", runId).eq("status", "running");
      }
    });
    return reply({ run_id: runId, status: "running" }, 202);
  } catch (e) {
    return reply({ error: e.message || "Could not reprocess that email." }, 403);
  }
}
