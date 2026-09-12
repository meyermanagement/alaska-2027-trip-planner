import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { extractAboutMePriors } from "@/lib/travelers/extractAboutMePriors";

/**
 * Save one traveler's About-you paragraph, and refresh the interview priors
 * the same paragraph implies.
 *
 * The About-you form used to write straight from the browser through the
 * caller's Supabase session. That kept the round-trip short but meant the
 * paragraph and the extracted priors could never travel together: an
 * extraction on the client would need the Gemini key in the browser, and an
 * extraction after-the-fact would need a job runner. The server route saves
 * both in the same request so the interview screen the primary lands on next
 * already knows what About-you settled.
 *
 * Storage is still gated by RLS: the update runs through the caller's client,
 * so the traveler must belong to a family this person can write to. The
 * update is scoped by both id and family_id (defense in depth on top of RLS)
 * and any RLS refusal shows up as zero rows changed, which the client turns
 * into the same "ask a primary" message it did before.
 */
export async function POST(request) {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  if (!me) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const travelerId =
    typeof body?.traveler_id === "string" ? body.traveler_id.trim() : "";
  const paragraphRaw =
    typeof body?.paragraph === "string" ? body.paragraph : "";
  const paragraph = paragraphRaw.trim();

  if (!travelerId) {
    return NextResponse.json({ error: "Missing traveler." }, { status: 400 });
  }

  // Extract priors first so the update writes the paragraph and the priors
  // together. If extraction throws we still save the paragraph -- the priors
  // are best-effort and never block a person from writing about themselves.
  let priors = {};
  try {
    priors = await extractAboutMePriors(paragraph);
  } catch (err) {
    console.warn("about-you save: extraction threw", err?.message || err);
    priors = {};
  }

  const { data, error } = await supabase
    .from("travelers")
    .update({
      about_me: paragraph || null,
      about_me_priors: priors,
    })
    .eq("id", travelerId)
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: error.message || "That did not save. Try again in a moment." },
      { status: 500 },
    );
  }

  // A write RLS refuses does not raise; it filters the row away and reports
  // success having changed nothing. Counting what came back is the only way
  // to tell "saved" from "silently dropped". The client uses this to show
  // the same message it used to before this route existed.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "That did not save." }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    priors_count: Object.keys(priors).length,
  });
}
