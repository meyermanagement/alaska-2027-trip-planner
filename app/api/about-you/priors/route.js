import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { extractAboutMePriors } from "@/lib/travelers/extractAboutMePriors";

/**
 * Read a paragraph and hand back the interview slots it already answers,
 * without storing anything.
 *
 * The real chain does this on save: /api/about-you/save extracts the priors
 * and writes them next to the paragraph, and the interview reads them off the
 * traveler row. Practice cannot use that path. A rehearsal writes nothing to
 * the database on purpose, so the paragraph somebody types on the practice
 * About-you screen lives in sessionStorage, where no server component can see
 * it -- and the practice interview was asking questions the practice
 * paragraph had just answered, which is the exact thing the real interview
 * stopped doing.
 *
 * So this route takes the paragraph in the request and returns the priors in
 * the response. No traveler id, no update, no read of anyone's row. Sign-in is
 * still required, because the Gemini call behind it costs money and an open
 * endpoint that runs a model on arbitrary text is a bill waiting to happen.
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

  const paragraph =
    typeof body?.paragraph === "string" ? body.paragraph.trim() : "";
  if (!paragraph) return NextResponse.json({ priors: {} });

  // Best-effort, like everywhere else the extractor is called: a rehearsal
  // that cannot reach the model asks its questions cold rather than failing.
  try {
    const priors = await extractAboutMePriors(paragraph);
    return NextResponse.json({ priors: priors || {} });
  } catch (err) {
    console.warn("about-you priors: extraction threw", err?.message || err);
    return NextResponse.json({ priors: {} });
  }
}
