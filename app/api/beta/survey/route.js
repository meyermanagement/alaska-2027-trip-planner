import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isTesterAccount } from "@/lib/beta/tester";
import { questionById, sanitizeAnswers } from "@/lib/beta/survey";

/**
 * One tester's survey sheet: read it, and write it as they type.
 *
 * A route rather than the browser client, for one reason: the answers column is
 * jsonb, and jsonb written straight from a browser is a column that can hold
 * anything anybody feels like putting in it. Everything that lands here goes
 * through the question file first, so a key it does not know never reaches the
 * table. The rest -- who the row belongs to, who may read it -- is row-level
 * security's job and is enforced whether or not this file gets it right.
 *
 * PATCH merges rather than replaces. The page saves the field that changed, not
 * the whole sheet, so two tabs open on the same survey cannot have the second
 * one overwrite the first one's paragraph with an empty box. An answer is taken
 * back by sending an empty string, which the sanitizer drops and this route then
 * removes from the stored object.
 */

export const runtime = "nodejs";

const bad = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

async function caller() {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  if (!me) return { supabase, me: null, tester: false };
  return { supabase, me, tester: await isTesterAccount(supabase, me) };
}

export async function GET() {
  const { supabase, me, tester } = await caller();
  if (!me) return bad("Not signed in", 401);
  if (!tester) return bad("Not in the beta", 403);

  const { data, error } = await supabase
    .from("beta_survey_responses")
    .select("answers, submitted_at, updated_at")
    .eq("user_id", me.id)
    .maybeSingle();
  if (error) return bad(error.message, 500);

  // No row yet is the ordinary case on a first visit, and an empty sheet is the
  // right answer to it -- the row is written the moment they answer something,
  // not the moment they look.
  return NextResponse.json({
    answers: data?.answers || {},
    submittedAt: data?.submitted_at || null,
    updatedAt: data?.updated_at || null,
  });
}

export async function PATCH(request) {
  const { supabase, me, tester } = await caller();
  if (!me) return bad("Not signed in", 401);
  if (!tester) return bad("Not in the beta", 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Expected JSON");
  }

  const incoming = body?.answers;
  if (incoming && typeof incoming !== "object") return bad("Bad answers");

  const kept = sanitizeAnswers(incoming);
  // Which keys were sent but did not survive sanitizing, and are therefore
  // deletions rather than rejections. An id nobody has ever heard of is neither,
  // and is simply ignored.
  const cleared = Object.keys(incoming || {}).filter(
    (id) => questionById(id) && !(id in kept),
  );

  const { data: existing, error: readError } = await supabase
    .from("beta_survey_responses")
    .select("answers, submitted_at")
    .eq("user_id", me.id)
    .maybeSingle();
  if (readError) return bad(readError.message, 500);

  const merged = { ...(existing?.answers || {}), ...kept };
  for (const id of cleared) delete merged[id];

  // Which household they were in when they answered. Context for reading the
  // replies later, never a permission -- the policies on this table are about
  // the account alone. Read through the caller's own session, so row-level
  // security decides which family this is.
  const { data: mine } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", me.id)
    .limit(1)
    .maybeSingle();
  const familyId = mine?.family_id || null;

  const submitted = body?.submit === true;

  const { data, error } = await supabase
    .from("beta_survey_responses")
    .upsert(
      {
        user_id: me.id,
        family_id: familyId,
        answers: merged,
        // Said once and left alone. Pressing the button again after another
        // edit should not rewrite the date they finished; what changed is
        // updated_at, which is what the desk sorts on.
        ...(submitted && !existing?.submitted_at
          ? { submitted_at: new Date().toISOString() }
          : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("answers, submitted_at, updated_at")
    .maybeSingle();
  if (error) return bad(error.message, 500);

  return NextResponse.json({
    answers: data?.answers || merged,
    submittedAt: data?.submitted_at || null,
    updatedAt: data?.updated_at || null,
  });
}
