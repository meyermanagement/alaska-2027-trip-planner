import { NextResponse } from "next/server";
import { generate } from "@/lib/agent/llm";
import { DEMO_SYSTEM } from "@/lib/welcome/meetAlyDemo";

/**
 * The Meet Aly screen's live "ask her something else" box.
 *
 * The two hardcoded example answers on the screen are the primary wow --
 * they paint instantly and never fail. This endpoint is the second-order
 * wow: if the family types their own question, Aly answers it TWICE, once
 * for the adults-only stand-in and once for the family-with-a-nine-year-old
 * stand-in, in her own voice, in front of them. The point is proving that
 * the same question really does produce different answers because of who
 * is in the family; a live model call is what makes that undeniable in a
 * way a hardcoded pair can't.
 *
 * No auth is required. The endpoint takes a plain question and returns
 * two short paragraphs. It writes nothing to the database. Failure is
 * always "quiet on the client" -- if the model is slow or refuses, the
 * screen keeps the two hardcoded example answers and does not surface
 * anything scary. That is what the deadline is for; we do not spend more
 * than about 20 seconds on this before giving up.
 *
 * Rate-limited on the client by only enabling the button after 3+ chars
 * and while a previous request is not in flight. Kept intentionally
 * anonymous so the wow works before the family has even created an
 * account, which matters for the practice hub where somebody may want
 * to see this without being signed in as themselves.
 */

const DEADLINE_MS = 20000;

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const question = String(body?.question || "").trim().slice(0, 240);
  if (!question) {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }

  const prompt = `Question from the family:\n\n"${question}"\n\nAnswer twice. Start the first paragraph with the label "Two adults, slow mornings:" and the second with "Family with a nine-year-old, packed mornings:" so the labels appear in the reply. If the question does not name a destination, use Reykjavik on a long weekend.`;

  try {
    const deadline = Date.now() + DEADLINE_MS;
    const result = await generate({
      system: DEMO_SYSTEM,
      messages: [{ role: "user", text: prompt }],
      tools: [],
      grounded: false,
      deadline,
    });
    const text = (result?.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "Aly did not reply this time." }, { status: 502 });
    }

    // Split on the two labels Aly was told to use. Fall back to the whole
    // reply as the adults answer, with the family answer blank, if she
    // did not follow the format -- better to show something than nothing.
    const adultsMatch = text.match(/two adults[^:]*:\s*([\s\S]*?)(?=family with a nine-year-old|$)/i);
    const familyMatch = text.match(/family with a nine-year-old[^:]*:\s*([\s\S]*)$/i);
    const adults = (adultsMatch?.[1] || text).trim();
    const family = (familyMatch?.[1] || "").trim();

    return NextResponse.json({
      ok: true,
      adults,
      family,
      question,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "That did not go through." },
      { status: 502 },
    );
  }
}
