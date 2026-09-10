import { NextResponse } from "next/server";
import { generate } from "@/lib/agent/llm";
import { DEMO_SYSTEM, DEMO_FAMILIES } from "@/lib/welcome/meetAlyDemo";

/**
 * The Meet Aly screen's live "ask her something else" box.
 *
 * The hardcoded example answers on the screen are the primary wow -- they
 * paint instantly and never fail. This endpoint is the second-order wow:
 * if the family types their own question, Aly answers it once for every
 * stand-in family on the screen, in her own voice, in front of them. The
 * point is proving that the same question really does produce different
 * answers because of who is in the family; a live call is what makes that
 * undeniable in a way a hardcoded set can't.
 *
 * The stand-ins come from the same array the cards are built from, so
 * adding a family to the screen adds it here with no second edit.
 *
 * No auth is required. The endpoint takes a plain question and returns
 * one short paragraph per family. It writes nothing to the database. Failure is
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
  const question = String(body?.question || "")
    .trim()
    .slice(0, 240);
  if (!question) {
    return NextResponse.json(
      { error: "Ask a question first." },
      { status: 400 },
    );
  }

  const prompt = `Question from the family:\n\n"${question}"\n\nAnswer once for each stand-in family, in the order they were listed, each paragraph beginning with that family's tag in square brackets.`;

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
      return NextResponse.json(
        { error: "Aly did not reply this time." },
        { status: 502 },
      );
    }

    // Split the reply on the bracketed tags Aly was told to use. A family
    // whose tag never appears comes back empty and the client renders that
    // card as quiet rather than as an error -- better to show three answers
    // than to throw away a good reply because one tag went missing.
    const answers = {};
    for (const family of DEMO_FAMILIES) {
      const others = DEMO_FAMILIES.map((f) => `\\[${f.key}\\]`).join("|");
      const found = text.match(
        new RegExp(`\\[${family.key}\\]\\s*([\\s\\S]*?)(?=${others}|$)`, "i"),
      );
      answers[family.key] = (found?.[1] || "").trim();
    }

    // Nothing parsed at all: hand the whole reply to the first card instead of
    // showing four empty ones.
    if (!Object.values(answers).some(Boolean)) {
      answers[DEMO_FAMILIES[0].key] = text;
    }

    return NextResponse.json({
      ok: true,
      answers,
      question,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "That did not go through." },
      { status: 502 },
    );
  }
}
