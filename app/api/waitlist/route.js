import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { makeThrottle, waitlistEntry } from "@/lib/home/waitlist";

export const runtime = "nodejs";

const allow = makeThrottle();

function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

// The form works without JavaScript: a plain form post gets sent back to the
// front door with the outcome in the address, where the form reads it.
function answer(isForm, request, status, body) {
  if (!isForm) return NextResponse.json(body, { status });
  const url = new URL("/", request.url);
  url.searchParams.set("waitlist", body.ok ? "joined" : status === 400 ? "invalid" : "error");
  url.hash = "waitlist";
  return NextResponse.redirect(url, 303);
}

/**
 * POST /api/waitlist
 *
 * Open to anybody: the people it is for do not have an account. The table has
 * row-level security on and no policies, so the only writer is this route,
 * through the service role, and nobody can read the list back through the
 * public API. A repeated address is accepted and ignored, and the reply is the
 * same either way, so the form cannot be used to test whether an address is
 * already on the list.
 */
export async function POST(request) {
  const type = request.headers.get("content-type") || "";
  const isForm = !type.includes("application/json");
  let input;
  try {
    input = isForm ? Object.fromEntries(await request.formData()) : await request.json();
  } catch {
    return answer(isForm, request, 400, { ok: false, error: "That form didn't arrive in one piece. Please try again." });
  }
  if (!allow(clientKey(request))) {
    return answer(isForm, request, 429, { ok: false, error: "Too many tries from here. Please wait a few minutes." });
  }
  const entry = waitlistEntry(input || {});
  if (!entry.ok) return answer(isForm, request, 400, { ok: false, field: entry.field, error: entry.error });
  if (entry.spam) return answer(isForm, request, 200, { ok: true });

  const admin = createAdminClient();
  if (!admin) {
    return answer(isForm, request, 503, { ok: false, error: "The waitlist isn't taking names right now. Please try again later." });
  }
  const { error } = await admin
    .from("waitlist")
    .upsert(entry.row, { onConflict: "email", ignoreDuplicates: true });
  if (error) {
    console.error("waitlist insert failed", error.code || error.message);
    return answer(isForm, request, 500, { ok: false, error: "Couldn't save that. Please try again." });
  }
  return answer(isForm, request, 200, { ok: true });
}
