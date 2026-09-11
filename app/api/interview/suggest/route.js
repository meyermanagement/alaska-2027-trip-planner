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

const SYSTEM = `You are the travel assistant for one family. The primary is answering the household interview, and every chip they tap becomes something you plan against on future trips. Your job here is to propose THREE OR FOUR follow-up chips that let you understand their preference well enough to plan a trip that actually fits them -- not more slogans in the same direction, but the meaningful VARIATIONS of the shape they just described.

The question is asking about a real-world axis (how full a day is, when the day starts, where they sleep, how they get around, what they will eat, whether they queue for the famous thing, where money is worth spending). The primary has picked one side of that axis, and tapped one chip that says WHY.

Your follow-ups should surface the variations of THIS side of the axis that would change how you plan for them. Ask yourself, before each chip: "if a family said this out loud, would it change what I put on the itinerary tomorrow?" If the answer is no, drop the chip. If two chips would produce the same plan, they are the same chip; write only one.

Good variations do at least one of these:

- Name a real-world SHAPE this preference takes ("three activities but always an afternoon off" vs "three activities back to back").
- Name a CONSTRAINT that decides between two plans that would otherwise look the same ("only if the kids can nap in the car", "only if one of them is short").
- Name a TRADE the family is willing to make ("we pay for the guide, we skip the fancy dinner").
- Name an EDGE CASE they want honored ("a rest day after a travel day", "one splurge meal, the rest simple").
- Name a specific TIME, DISTANCE, NUMBER or PLACE that pins the preference to reality ("nothing over an hour's drive", "nine is early enough", "two nights minimum before we move again").

Worked examples:

- Question: how full a day should be. Picked: A packed day. Tapped: "The kids do better when they are busy." Good follow-ups (each shifts the plan): "Three activities, one of them physical." / "Back-to-back is fine as long as lunch is real." / "Downtime works if it's in the pool, not the room." / "Every day, not just weekends -- travel days too." BAD (all rephrasings): "The kids get bored without a plan." / "Idle kids fight." / "They need structure."
- Question: when the day starts. Picked: Dawn. Tapped: "The best light is early." Good: "Golden hour on the water beats golden hour on land." / "We want the first tee time / trail slot / boat." / "We would rather nap after lunch than sleep in." / "Sunset counts too -- both ends, not just morning." BAD (all same point): "Pretty pictures need morning light." / "Early light is softer."
- Question: how they get around. Picked: A rental car. Tapped: "The good places are not on a bus line." Good: "Nothing over two hours in one stretch." / "Automatic, and we can pick it up at the airport." / "We would rather park once and walk than move the car three times a day." / "A driver on the arrival day, a rental after that."
- Question: where money is worth spending. Picked: The experiences. Tapped: "The experience is what we will actually remember." Good: "One splurge experience per trip, not one per day." / "We will pay a guide over a group tour." / "Skip the fancy dinners; the room can be simple." / "Private is worth it when the kids are with us."

Rules:
1. Each chip must produce a DIFFERENT trip plan from the tapped chip and from the other follow-ups. If two chips would result in the same itinerary, keep the more specific one and drop the other.
2. Stay on the SIDE of the axis the primary picked. If they picked "One thing done well," do not write chips that argue for a packed day. But variations WITHIN their pick are exactly what you want ("one big thing in the morning, nothing after," "a hike, then the pool," "nothing planned but dinner").
3. Do not repeat the tapped chip or any listed already-shown chip (case-insensitively). Different words for the SAME shape are duplicates -- only one gets to stay.
4. First person plural: "We," "The kids," "Our," "Nobody at our table." Never "You."
5. One idea per chip.
6. Under 90 characters. Ideally under 60. It sits on a pill.
7. Return STRICT JSON of the shape {"suggestions": ["...", "...", "..."]}. No commentary, no markdown fence.

If you cannot think of three that would each produce a different plan, return fewer. An empty array is a valid answer. Two chips that each move the plan are worth more than four that all point at the same day.`;

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

// The signature a chip reduces to when we compare it for redundancy.
//
// Exact case-insensitive equality is the floor -- "We travel to do" and "we
// travel to do." are the same chip -- but almost every duplicate the model
// produces is one level off from that: a punctuation difference, a swapped
// pronoun ("we" for "the family"), a filler verb ("we would rather", "we like
// to", "we prefer"), a boilerplate ending ("in general", "most of the time",
// "on trips"). Two chips that only differ on those axes plan the same day, so
// they are one chip. This normalization strips those axes and keeps the
// content words the family actually said something with.
//
// It is not a full stemmer -- that would over-collapse ("walk" and "walkable"
// mean different things about how a place feels) -- but it is aggressive
// enough to catch the classes of redundancy the model produces in this
// prompt.
function signatureOf(value) {
  const s = String(value || "")
    .toLowerCase()
    // Filler and hedge phrases that add zero information about the plan.
    // "we would rather do X" and "we do X" are the same preference chip; the
    // rather / would rather / prefer / like to just declares an opinion the
    // pick itself already declared.
    .replace(
      /\b(we|the family|the kids|our family)\s+(?:would\s+(?:rather|prefer)|prefer(?:red)?\s+to|like(?:d)?\s+to|love\s+to|want\s+to|need\s+to|have\s+to|tend\s+to|try\s+to|are\s+going\s+to|are\s+used\s+to|end\s+up|always|usually|often|sometimes|mostly|never|rarely)\b/g,
      "$1",
    )
    // Pronouns and family nouns collapsed to a single token.
    .replace(/\b(?:we|us|our|ours|the family|our family)\b/g, "we")
    .replace(
      /\b(?:the kids|the children|our kids|our children|the boys|the girls)\b/g,
      "kids",
    )
    // Common boilerplate endings that pad a chip without changing what it
    // says about a trip.
    .replace(
      /\b(?:in general|most of the time|most days|most trips|on trips|when we travel|either way|no matter what|for us|for our family|as a rule|as a family)\b/g,
      " ",
    )
    // Filler verbs on the boundary between a chip's subject and its point.
    .replace(
      /\b(?:really|actually|honestly|simply|just|kind of|sort of|a bit)\b/g,
      " ",
    )
    // Everything the family did not literally say -- punctuation, quotes,
    // ampersands, ellipses -- becomes whitespace. Digits stay because "one
    // hour" and "two hours" are different plans.
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

// Whether a candidate chip is a duplicate of anything already-known. Known is
// a set of signatures; the candidate is a raw chip.
function isRedundant(chip, knownSignatures) {
  const sig = signatureOf(chip);
  if (!sig) return true;
  if (knownSignatures.has(sig)) return true;
  // Subset test both ways: "the kids fight when idle" and "kids fight when
  // they are idle" collapse to the same word-set after normalization, but
  // "we drive on trips" and "we drive everywhere" should not. So we require
  // one signature to be a whitespace-bounded substring of the other AND for
  // the shorter one to be at least three words. Under three words is too
  // short to be safely a subset ("we drive" would swallow "we drive at
  // dawn").
  const words = sig.split(" ").filter(Boolean);
  if (words.length < 3) return false;
  for (const other of knownSignatures) {
    const otherWords = other.split(" ").filter(Boolean);
    if (otherWords.length < 3) continue;
    const [shorter, longer] =
      words.length <= otherWords.length ? [sig, other] : [other, sig];
    if (shorter === longer) continue; // handled by the direct check above.
    if (` ${longer} `.includes(` ${shorter} `)) return true;
  }
  return false;
}

// Chips that pass the parser but are still not worth showing:
// wrapper-only responses, planning-vacuous slogans, and empty strings after
// normalization. A too-short signature ("we travel", "the kids") is a chip
// that never named a real shape, constraint, trade, edge case, or number; it
// is a slogan the prompt asked the model not to write.
function isVacuous(chip) {
  const sig = signatureOf(chip);
  if (!sig) return true;
  const words = sig.split(" ").filter(Boolean);
  if (words.length < 2) return true;
  // A chip that is entirely the picked-option label restated ("a packed
  // day", "the room") is not a follow-up. Two words is the floor for a
  // planning-relevant chip.
  return false;
}

function parseSuggestions(text, alreadyKnown = []) {
  if (typeof text !== "string") return [];
  const parsed = firstJson(text);
  const raw =
    parsed && Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  // Everything the client (or the parent scope) has already committed to
  // showing -- the tapped chip and the whole primary row -- starts inside
  // the known set so we never propose a rewording of any of them.
  const knownSignatures = new Set(
    alreadyKnown.map(signatureOf).filter(Boolean),
  );
  const out = [];
  for (const item of raw) {
    const chip = normalizeChip(item);
    if (!chip) continue;
    if (isVacuous(chip)) continue;
    if (isRedundant(chip, knownSignatures)) continue;
    knownSignatures.add(signatureOf(chip));
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
  // Ranked questions carry the same per-option reason chips as picked ones --
  // the chips shown are those of whatever is in first place -- so follow-ups
  // are generated for them the same way.
  if (!question || (question.kind !== "options" && question.kind !== "rank")) {
    return NextResponse.json({ error: "unknown_slot" }, { status: 400 });
  }
  // Everything the client is already showing goes into the redundancy set
  // before we look at the model's output: the tapped chip, every reason for
  // the picked option (that whole row is already on screen), and the
  // question's neutral otherReasons (which the More row anchors with, so a
  // follow-up matching one would double the anchor). The parser inside
  // parseSuggestions treats "already-known" as signatures, not raw strings,
  // so a chip that only differs from a known one by pronoun or filler is
  // dropped too.
  const alreadyKnown = [
    chip,
    ...baseSuggestions(question, choice),
    ...(question.otherReasons || []),
  ];

  try {
    const result = await callModel({
      system: SYSTEM,
      messages: [{ role: "user", text: briefFor({ question, choice, chip }) }],
      temperature: 0.3,
      grounded: false,
      thinking: "low",
    });
    const suggestions = parseSuggestions(result?.text || "", alreadyKnown);
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
