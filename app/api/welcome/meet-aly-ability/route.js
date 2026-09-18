import { NextResponse } from "next/server";
import { ALY_ABILITIES } from "@/lib/welcome/alyAbilities";

// Compatibility for tabs opened before answers were bundled in Meet Aly.
// New clients read the same authored answers locally. Never invoke a model.
export async function POST(req) {
  const body = await req.json().catch(() => null);
  const key = String(body?.key || "").slice(0, 40);
  const ability = ALY_ABILITIES.find((a) => a.key === key);
  if (!ability) {
    return NextResponse.json({ error: "Unknown topic." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, key, answer: ability.answer });
}
