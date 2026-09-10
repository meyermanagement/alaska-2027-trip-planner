import { NextResponse } from "next/server";
import { generate } from "@/lib/agent/llm";
import { ALY_ABILITIES, ABILITY_SYSTEM } from "@/lib/welcome/alyAbilities";

/**
 * One of the nine things Aly looks after, asked about on the Meet Aly screen.
 *
 * The nine lines on that screen are claims: she plans the days, she keeps your
 * points, she builds
 * the packing list, she watches the budget. This endpoint is what turns any one
 * of them into something a family can interrogate before they have an account
 * -- they tap the line, she answers the question they actually have about it,
 * live, in her own voice. The difference between a feature list and being
 * introduced to somebody is that you can ask somebody a question.
 *
 * The question is not taken from the request. The client sends a key and the
 * question is looked up here from the same array the screen is built from, so
 * this cannot be turned into an open prompt endpoint by anybody who noticed it
 * needs no auth. The description of that ability is handed to the model as the
 * only ground truth it is allowed to work from, which is what keeps a first
 * screen from promising a feature the app does not have.
 *
 * Writes nothing. Needs no auth, on purpose: the practice hub and the real
 * first run both reach it before there is a family to attach anything to. A
 * failure comes back as an error string the row shows quietly and drops -- the
 * nine lines are still there and still true whether or not Aly gets to
 * elaborate, so nothing on this screen depends on the call succeeding.
 */

const DEADLINE_MS = 20000;

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const key = String(body?.key || "").slice(0, 40);
  const ability = ALY_ABILITIES.find((a) => a.key === key);
  if (!ability) {
    return NextResponse.json({ error: "Unknown topic." }, { status: 400 });
  }

  const prompt = `The thing they tapped:\n\n${ability.heading}: ${ability.body}\n\nTheir question:\n\n"${ability.ask}"\n\nAnswer it.`;

  try {
    const result = await generate({
      system: ABILITY_SYSTEM,
      messages: [{ role: "user", text: prompt }],
      tools: [],
      grounded: false,
      deadline: Date.now() + DEADLINE_MS,
    });
    const answer = (result?.text || "").trim();
    if (!answer) {
      return NextResponse.json(
        { error: "Aly did not reply this time." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, key, answer });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "That did not go through." },
      { status: 502 },
    );
  }
}
