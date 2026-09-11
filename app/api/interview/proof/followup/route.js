import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { generate } from "@/lib/agent/llm";
import { resolveStandIn } from "@/lib/practice/standIn";
import { proofFacts } from "@/lib/interview/proofContext";

/**
 * One follow-up question about the day the proof screen just planned.
 *
 * The plan answers four decisions and says which of the family's own answers
 * drove each one. The question a person actually has next is about one of those
 * lines -- is that walkable, what if it rains, is the restaurant a problem for
 * the peanut allergy, what else is near the museum -- and until now the screen
 * had no way to take it. They had to finish onboarding, make a trip and find
 * Ask Aly before they could ask the obvious thing about what they were looking
 * at.
 *
 * Deliberately narrow. The plan on screen and the place it is about travel with
 * the question, so the answer is about what the person can see rather than a
 * second general opinion about the destination. It answers in prose, because a
 * follow-up is a sentence or two and forcing it into the plan's row shape would
 * make an answer look like a decision it did not make.
 *
 * Same access rule as the plan: the primary, and in a rehearsal the typed
 * family and nothing saved.
 */

// Shorter than the plan's 28 seconds. This is a couple of sentences with the
// plan already in the prompt, and a follow-up that takes as long as the plan
// did feels broken in a way the plan does not.
const DEADLINE_MS = 18000;

// A person's own words reaching a prompt, so flattened to one line and capped.
// Long enough for a real question with a sentence of context, short enough that
// nobody writes a system prompt in the box.
const MAX_QUESTION = 320;

function cleanText(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * The plan the question is about, rebuilt from what the client is showing.
 *
 * Rebuilt from the rows rather than trusted as a blob: each row is flattened to
 * one line and the list is capped, so a caller cannot smuggle a second prompt
 * through a field the screen fills in for them.
 */
function planText(rows) {
  return (Array.isArray(rows) ? rows : [])
    .slice(0, 12)
    .map((row) =>
      [
        cleanText(row?.when, 40),
        cleanText(row?.what, 200),
        cleanText(row?.why, 240),
      ]
        .filter(Boolean)
        .join(" -- "),
    )
    .filter(Boolean)
    .join("\n");
}

export async function POST(req) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const access = await resolveAccess(supabase, user);
  if (!access?.familyId || access.level !== PRIMARY) {
    return NextResponse.json({ error: "not allowed here" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const demo = Boolean(body?.demo);
  const standIn = demo ? resolveStandIn(body?.standIn) : null;
  const destination = cleanText(body?.destination, 60);
  const question = cleanText(body?.question, MAX_QUESTION);
  const plan = planText(body?.planRows);
  const extras = planText(body?.extraRows);

  if (!question) {
    return NextResponse.json({ error: "ask me something" }, { status: 400 });
  }
  if (!destination) {
    return NextResponse.json({ error: "name a place first" }, { status: 400 });
  }

  const { familyLinesText, prefsText } = await proofFacts({
    supabase,
    familyId: access.familyId,
    demo,
    standIn,
  });

  // The last two sentences are the same guard the plan carries: an answer that
  // invents a taste and attributes it to the family is worse than an answer
  // that says it does not know, on a screen whose entire claim is that the
  // advice comes from what the family actually said.
  const system = `You are Aly, a travel assistant. Answer in American English. No emoji, no source citations, no preamble. Answer in at most three short sentences, or up to four short lines when a list is genuinely clearer.

You have just planned a day in ${destination} for this family, and they are asking a follow-up about it.

What you know about the family:
${familyLinesText || "(nothing extra)"}

Their travel preferences from their interview:
${prefsText || "(no preferences recorded)"}

The day you planned:
${plan || "(the plan did not come through)"}${extras ? `\n\nWhat you said to pack, and your tips:\n${extras}` : ""}

Answer the question they asked, about this place and this plan. Where one of their own answers bears on it, say which one. If the answer would change one of the four choices, say what you would swap it for and why. Do not invent a preference, an age, a limit or a habit you were not told, and do not imply you were told one. If you do not know something specific -- a price, an opening time, whether a particular place takes reservations -- say you would check it rather than guessing.`;

  const res = await generate({
    system,
    messages: [{ role: "user", text: question }],
    tools: [],
    grounded: false,
    deadline: Date.now() + DEADLINE_MS,
  }).catch(() => null);

  const text = (res?.text || "").trim();
  if (!text) {
    return NextResponse.json(
      { error: "That didn't come through." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, question, answer: text });
}
