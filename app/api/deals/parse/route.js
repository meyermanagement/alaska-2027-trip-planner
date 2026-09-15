// Pasting a fare in.
//
// The one way a deal gets into this app. There is no crawler and no feed: the
// family reads the alerts they already subscribe to, and when one looks like it
// might be for them they paste it here. That is a deliberate limit, not a stage
// on the way to something else -- what this app is for is judging a fare against
// what this household actually wants, and it can do that without ever pretending
// to know the market.
//
// Two calls, in this order. The regexes in lib/deals/parse.js prove what they can
// from the text, then the model is asked to arrange those proven facts into a row
// and is checked against the text again on the way back. A candidate that fails
// the check is refused with the reason in words rather than saved with a hole in
// it.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import { generate as callModel } from "@/lib/agent/llm";
import {
  checkCandidate,
  hardParse,
  jsonFrom,
  parseBrief,
} from "@/lib/deals/parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const bad = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

const SYSTEM =
  "You read fare alerts and return JSON. You never invent a number, a date, an airline or an airport that is not in the text you were given. A field you cannot prove is left out. You return the JSON object and nothing else.";

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Not signed in.", 401);

  const access = await resolveAccess(supabase, user);
  if (access?.can.isSecondary)
    return bad("Only a primary traveler can save a fare.", 403);

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  const familyId = memberships?.[0]?.family_id;
  if (!familyId) return bad("No household yet.", 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Nothing to read.");
  }

  const text = String(body?.text || "").trim();
  if (text.length < 12)
    return bad("Paste the alert itself and I will read it.");
  if (text.length > 8000)
    return bad("That is longer than an alert. Paste just the fare.");

  const source = {
    name: String(body?.source_name || "").trim(),
    url: String(body?.source_url || "").trim(),
  };

  const hard = hardParse(text);
  // Nothing to arrange. Worth saying before spending a model call, and worth
  // saying specifically: the family can see their own paste, so "there is no
  // price in it" tells them what to fix.
  if (!hard.prices.length)
    return NextResponse.json(
      {
        saved: null,
        why: "there is no price in that text, so there is no fare to judge",
      },
      { status: 200 },
    );

  let answer;
  try {
    answer = await callModel({
      system: SYSTEM,
      messages: [{ role: "user", text: parseBrief(text, hard, source) }],
      temperature: 0,
      thinking: "low",
      deadline: Date.now() + 40000,
    });
  } catch (error) {
    console.error("deal parse: model call failed", error);
    return bad("I could not read that just now. Try again in a moment.", 503);
  }

  const candidate = jsonFrom(answer?.text);
  const checked = checkCandidate(candidate, { text, hard, source });
  if (!checked.ok)
    return NextResponse.json(
      { saved: null, why: checked.why },
      { status: 200 },
    );

  // Where it came from is not optional and it is not inferred. A pasted fare with
  // no source is a number with nobody behind it, and the family cannot go back and
  // look at it later, which is the whole basis on which this app is allowed to
  // quote a price at all.
  if (!checked.row.source_name)
    return NextResponse.json(
      { saved: null, why: "say which alert this came from and I will keep it" },
      { status: 200 },
    );

  const { data: saved, error } = await supabase
    .from("flight_deals")
    .insert({
      ...checked.row,
      family_id: familyId,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("deal parse: insert failed", error);
    return bad("I read the fare but could not save it.", 500);
  }

  return NextResponse.json({
    saved,
    missing: checked.missing,
    model: answer?.model || null,
  });
}
