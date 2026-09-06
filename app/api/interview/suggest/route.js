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

const SYSTEM = `You are the travel assistant for one family. The primary is answering the household interview, has picked an answer to one question, and has tapped one reason chip that fits their answer. Your job is to propose THREE OR FOUR short follow-up reasons in the same direction as the chip they tapped -- a natural extension of that specific angle, in the primary's own voice.

The chip they tapped is a first-person sentence like "The kids do better when they are busy" or "The best light is early". Your follow-ups should sound like the same person continued talking: same tense, same voice, no address to a "you". Each follow-up is one short sentence, ideally under 60 characters and never over 90, that fits on a pill.

Rules:
1. Extend the chip they tapped. If they tapped "The kids do better when they are busy", propose more reasons about kids' energy, momentum, boredom -- not new reasons about the parents or the scenery.
2. Never contradict the answer they picked. If they picked "One thing done well", do not propose "We travel to do, not to rest."
3. Do not repeat the chip they tapped or any of the base suggestions listed below (case-insensitively). Give them NEW ways to say the same thing.
4. First person plural ("We", "The kids", "Our", "Nobody at our table"). Never "You".
5. One idea per chip. If two ideas belong together, pick one.
6. Return STRICT JSON of the shape {"suggestions": ["...", "...", "..."]}. No commentary, no markdown fence.

If you cannot think of three that pass, return fewer. An empty array is a valid answer.`;

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
      temperature: 0.6,
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
