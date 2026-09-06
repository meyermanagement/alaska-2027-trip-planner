// Aly-generated follow-up chips for the interview's "Why?" panel.
//
// The primary picks an answer, taps a suggestion, and the interview asks Aly
// for three or four more chips that extend THAT specific angle -- not new
// reasons for the answer, and not the opposing option's reasons, which
// contradict the pick. The chips arrive in the primary's own voice, short
// enough to sit on a pill.
//
// This endpoint is intentionally small: no auth check, no database. It reads
// the interview questions from the same source of truth the UI uses, so a
// question edit does not need a second edit here. The client caches by
// (slot, choice, chip), so the same tap in the same session does not re-call.

import { NextResponse } from "next/server";
import { INTERVIEW_QUESTIONS } from "@/lib/travelers/interview";
import { generate as callModel } from "@/lib/agent/llm";
import { firstJson } from "@/lib/tips/parse";

export const runtime = "nodejs";

const SYSTEM = `You are the travel assistant for one family. The primary is answering the household interview. They picked an answer to one question, then tapped ONE specific reason chip that fits their answer. Your entire job is to propose THREE OR FOUR more chips that continue THAT SPECIFIC SENTENCE -- as if the same person said it out loud and kept going.

Read the tapped chip carefully. Identify its core subject and its point.

- Tapped "The kids do better when they are busy" -- subject is the kids, point is that unstructured time is worse for them. Follow-ups: more reasons the kids specifically do worse when idle (they get bored, they fight, they miss school routines, they wake up early anyway). NOT reasons about the parents, the scenery, the trip cost, or seeing more places.
- Tapped "The best light is early" -- subject is early morning, point is that early is visually better. Follow-ups: more early-morning reasons (the beach is empty, the mountains are pink, the air is cool, restaurants are quieter). NOT reasons about being a morning person in general, or the kids waking up.
- Tapped "We won't be back here for a while" -- subject is scarcity, point is one-shot. Follow-ups: more scarcity reasons (the flights were hard to get, we saved for this, the kids will be teenagers next time). NOT general packed-day reasons.

Rules:
1. STAY ON THE TAPPED CHIP'S ANGLE. If the tapped chip is about the kids, every follow-up is about the kids. If it's about morning light, every follow-up is about morning. Ask yourself before each chip: "is this a REPHRASING of the tapped chip's core point?" If no, drop it.
2. Never contradict the picked answer. If they picked "One thing done well", do not write "We travel to do, not to rest."
3. Do not repeat the tapped chip or any listed already-shown chip (case-insensitively). Give NEW words for the SAME point.
4. First person plural: "We", "The kids", "Our", "Nobody at our table". Never "You".
5. One idea per chip. If two ideas belong together, pick one.
6. Under 90 characters. Ideally under 60. It sits on a pill.
7. Return STRICT JSON of the shape {"suggestions": ["...", "...", "..."]}. No commentary, no markdown fence.

If you cannot think of three that pass rule 1, return fewer. An empty array is a valid answer. It is much better to return two tightly on-angle chips than four that drift.`;

function findQuestion(slot) {
  return (INTERVIEW_QUESTIONS || []).find((q) => q && q.slot === slot) || null;
}

function baseSuggestions(question, choice) {
  if (!question) return [];
  if (choice === "other") return question.otherReasons || [];
  const opt = (question.options || []).find((o) => o.value === choice);
  return (opt && opt.reasons) || [];
}

function optionLabel(question, choice) {
  if (!question) return "";
  if (choice === "other") return "Something else";
  const opt = (question.options || []).find((o) => o.value === choice);
  return (opt && opt.label) || "";
}

function briefFor({ question, choice, chip }) {
  const label = optionLabel(question, choice);
  const base = baseSuggestions(question, choice);
  const lines = [];
  lines.push(`Question: ${question.prompt}`);
  if (label) lines.push(`They picked: ${label}`);
  lines.push(`They tapped this chip: "${chip}"`);
  if (base.length > 0) {
    lines.push(
      `Already-shown chips (do not repeat, case-insensitive):\n${base.map((b) => `- ${b}`).join("\n")}`,
    );
  }
  lines.push(
    `Return three or four follow-up chips that extend the tapped chip in the same direction. JSON only: {"suggestions": ["...", "...", "..."]}`,
  );
  return lines.join("\n\n");
}

function normalizeChip(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/^[-*•]\s+/, "");
  if (!trimmed) return "";
  if (trimmed.length > 120) return `${trimmed.slice(0, 119)}…`;
  return trimmed;
}

function parseSuggestions(text) {
  if (typeof text !== "string") return [];
  const parsed = firstJson(text);
  const raw =
    parsed && Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const chip = normalizeChip(item);
    if (!chip) continue;
    const key = chip.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
    if (out.length >= 5) break;
  }
  return out;
}

export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const slot = typeof body?.slot === "string" ? body.slot.trim() : "";
  const choice = typeof body?.choice === "string" ? body.choice.trim() : "";
  const chip = typeof body?.chip === "string" ? body.chip.trim() : "";
  if (!slot || !choice || !chip) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const question = findQuestion(slot);
  if (!question || question.kind !== "options") {
    return NextResponse.json({ error: "unknown_slot" }, { status: 400 });
  }
  const base = baseSuggestions(question, choice);
  const known = new Set(base.map((b) => b.toLowerCase()));
  known.add(chip.toLowerCase());

  try {
    const result = await callModel({
      system: SYSTEM,
      messages: [{ role: "user", text: briefFor({ question, choice, chip }) }],
      temperature: 0.3,
      grounded: false,
      thinking: "low",
    });
    const suggestions = parseSuggestions(result?.text || "").filter(
      (s) => !known.has(s.toLowerCase()),
    );
    return NextResponse.json({ suggestions });
  } catch (err) {
    // A model outage should not break the interview. Return an empty set and
    // the client will simply show no additional chips for this pick.
    return NextResponse.json(
      { suggestions: [], error: err?.message || "model_error" },
      { status: 200 },
    );
  }
}
