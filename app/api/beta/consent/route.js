import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import {
  AGREEMENT_VERSION,
  AI_PROVIDER,
  APP_BUILD,
  OPTIONAL_FEATURES,
  PRIVACY_VERSION,
} from "@/lib/beta/agreement";
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  consentIsCurrent,
  readConsent,
} from "@/lib/beta/consent";

/**
 * Recording what a beta tester agreed to.
 *
 * POST is the gate: the four things that have to be true before the app opens,
 * plus the answers the screens collected on the way. PATCH is Settings: moving
 * the AI answer, the optional features, or the diagnostics switch afterwards, and
 * taking consent back wholesale.
 *
 * The version numbers are stamped here rather than accepted from the browser.
 * A client that posts an old version number would otherwise be able to hold
 * itself at a version of the agreement it prefers, and the whole point of the
 * version columns is that the server decides when somebody has to look again.
 *
 * Both write through the caller's own session, so the database's own policy
 * decides whose row this is. This route never has to.
 */

const FEATURE_IDS = OPTIONAL_FEATURES.map((f) => f.id);

// Only ids this build knows, only booleans. Anything else is dropped rather than
// stored, so the column holds no key the app cannot read back.
function cleanFeatures(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const id of FEATURE_IDS) out[id] = Boolean(input[id]);
  return out;
}

function stamped(response, ok) {
  response.cookies.set(CONSENT_COOKIE, ok ? AGREEMENT_VERSION : "", {
    maxAge: ok ? CONSENT_COOKIE_MAX_AGE : 0,
    sameSite: "lax",
    path: "/",
  });
  return response;
}

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

  // The three that are not optional. Refused rather than coerced: a consent row
  // with age_confirmed false in it is not a record of anything, and a screen that
  // silently accepted a missing answer would be the bug this whole file exists to
  // prevent.
  if (!body?.agreed || !body?.ageConfirmed || !body?.dataAcknowledged) {
    return NextResponse.json(
      { error: "The agreement, your age, and the data notice are all needed." },
      { status: 400 },
    );
  }

  // Which household they were in when they answered. Context for the beta desk,
  // never a permission, and a missing one is not an error -- somebody can agree
  // before they have spent a code.
  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", me.id)
    .maybeSingle();

  const aiProcessing = Boolean(body?.aiProcessing);

  const row = {
    user_id: me.id,
    family_id: membership?.family_id || null,
    agreement_version: AGREEMENT_VERSION,
    privacy_version: PRIVACY_VERSION,
    app_build: APP_BUILD,
    age_confirmed: true,
    data_acknowledged: true,
    ai_processing: aiProcessing,
    ai_provider: aiProcessing ? AI_PROVIDER : null,
    ai_decided_at: new Date().toISOString(),
    features: cleanFeatures(body?.features),
    sharing_acknowledged: Boolean(body?.sharingAcknowledged),
    diagnostics: body?.diagnostics === false ? false : true,
    accepted_at: new Date().toISOString(),
    withdrawn_at: null,
  };

  // Upsert rather than insert, so somebody walking the screens again after the
  // agreement was reissued lands on the same row. The trigger keeps the history,
  // so overwriting here loses nothing.
  const { error } = await supabase
    .from("beta_consents")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return stamped(NextResponse.json({ ok: true, aiProcessing }), true);
}

/**
 * Changing an answer later.
 *
 * Everything here is reachable from Settings, and every field is optional: a
 * request that only moves the AI switch leaves the rest alone. `withdraw: true`
 * is the whole-consent case -- it stamps withdrawn_at, drops the cookie, and the
 * gate reopens on the next navigation.
 */
export async function PATCH(request) {
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

  const existing = await readConsent(supabase, me.id);
  if (!existing) {
    return NextResponse.json(
      { error: "There is nothing recorded to change yet." },
      { status: 409 },
    );
  }

  const patch = {};

  if (body?.withdraw === true) {
    patch.withdrawn_at = new Date().toISOString();
    // Withdrawing consent to the terms withdraws the AI permission with it.
    // Leaving it true would mean a row that says "no longer agreed, still fine
    // to send to a model", which is not a state anybody agreed to.
    patch.ai_processing = false;
  }

  if (typeof body?.aiProcessing === "boolean") {
    patch.ai_processing = body.aiProcessing;
    patch.ai_provider = body.aiProcessing ? AI_PROVIDER : null;
    patch.ai_decided_at = new Date().toISOString();
  }

  if (typeof body?.diagnostics === "boolean") {
    patch.diagnostics = body.diagnostics;
  }

  if (body?.features && typeof body.features === "object") {
    patch.features = {
      ...(existing.features || {}),
      ...cleanFeatures(body.features),
    };
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const { error } = await supabase
    .from("beta_consents")
    .update(patch)
    .eq("user_id", me.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Turning reminders off silences the browsers as well as the sender. Both paths
  // check the switch on the way out, so this is belt and braces -- but a device
  // that keeps a live subscription after its owner said no is a thing waiting to
  // go wrong, and the row costs nothing to retire.
  if (patch.features && patch.features.notifications !== true) {
    await supabase
      .from("push_subscriptions")
      .update({ enabled: false })
      .eq("user_id", me.id);
  }

  const after = await readConsent(supabase, me.id);
  return stamped(
    NextResponse.json({ ok: true, consent: after }),
    consentIsCurrent(after),
  );
}
