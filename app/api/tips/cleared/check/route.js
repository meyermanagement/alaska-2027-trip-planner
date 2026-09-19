import { NextResponse } from "next/server";
import { archiveContext } from "@/lib/tips/archiveAccess";
import { generate } from "@/lib/agent/llm";
import { resolveGroundingUrls } from "@/lib/tips/groundingUrls";
import { ARCHIVE_COLUMNS, UUID, CHECK_SYSTEM, checkedAnswer } from "@/lib/tips/archiveSearch";

export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request) {
  const started = Date.now();
  try {
    const context = await archiveContext(request);
    if (context.error) return reply({ error: context.error }, context.status);
    if (!context.ai) return reply({ error: "Enable AI assistance under your current agreement in Settings to ask Aly to check this tip." }, 403);
    const raw = await request.text();
    if (raw.length > 4000) return reply({ error: "Please shorten your question." }, 400);
    const body = JSON.parse(raw);
    if (!UUID.test(body.id || "") || (body.question != null && (typeof body.question !== "string" || body.question.length > 500)))
      return reply({ error: "Choose a saved tip and a short question." }, 400);
    // Fetch trusted record by ID under the caller's RLS. Never research a
    // browser-supplied tip body or an inaccessible household/trip.
    const { data: tip, error } = await context.supabase.from("pro_tips").select(ARCHIVE_COLUMNS)
      .eq("family_id", context.familyId).eq("id", body.id).in("status", ["cleared", "ignored"]).maybeSingle();
    if (error) return reply({ error: "The original tip could not be read. Try again." }, 503);
    if (!tip) return reply({ error: "This cleared tip is no longer available." }, 404);
    const checkedAt = new Date().toISOString();
    const result = await generate({ feature: "tips.archive-check", system: CHECK_SYSTEM,
      messages: [{ role: "user", text: JSON.stringify({
        today: checkedAt.slice(0, 10), question: body.question || "Is this still true today?",
        original: { title: tip.title, body: tip.body, because: tip.because, clearedAt: tip.resolved_at,
          sources: tip.sources, trip: tip.trips },
      }) }], grounded: true, temperature: 0.1, thinking: "low", deadline: started + 90000 });
    result.sources = await resolveGroundingUrls(result.sources);
    return reply(checkedAnswer(result, checkedAt));
  } catch {
    return reply({ error: "Aly could not finish checking current sources. The old tip is unchanged and has not been verified. Please try again." }, 502);
  }
}
