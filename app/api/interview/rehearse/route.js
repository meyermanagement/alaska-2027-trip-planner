import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import { readEverything } from "@/lib/agent/load";
import {
  buildContext,
  buildSystemPrompt,
  interviewFocus,
} from "@/lib/agent/context";
import { toolsForRequest } from "@/lib/agent/toolset";
import { generate } from "@/lib/agent/llm";
import { rehearsal } from "@/lib/travelers/rehearse";

// Seven turns against a real model, none of them quick. The page says what it is
// doing while it waits, which is the only reason a wait this long is bearable.
export const maxDuration = 300;

const MAX_TURNS = 10;
const TURN_MS = 60000;

/**
 * A whole interview, conducted for real and written down nowhere.
 *
 * Every part of this is the app: the context builder, the system prompt, the
 * toolset, the model ladder, the second pass that demands words when a turn
 * comes back as cards alone. Only the writes are diverted -- into arrays, under
 * the same rules the apply route enforces -- so a run can be read afterwards
 * without having spent a twelve-year-old's attention on it.
 *
 * The answers are supplied by whoever is running it, one per turn, which is what
 * makes the run repeatable: the same seven answers should produce the same seven
 * saves, and when they stop doing so something has changed in the prompt.
 */
export async function POST(request) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }
  const access = await resolveAccess(supabase, user);
  if (access?.can?.isSecondary) {
    return NextResponse.json(
      { error: "Only an organizer can run a rehearsal." },
      { status: 403 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const travelerId =
    typeof payload?.travelerId === "string" ? payload.travelerId : null;
  const answers = (Array.isArray(payload?.answers) ? payload.answers : [])
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .slice(0, MAX_TURNS);
  if (!travelerId || answers.length === 0) {
    return NextResponse.json(
      { error: "Pick somebody and write at least one answer." },
      { status: 400 },
    );
  }

  const rows = await readEverything(supabase, user.id);
  const person = (rows.travelers || []).find((t) => t.id === travelerId);
  if (!person) {
    return NextResponse.json({ error: "No such person." }, { status: 404 });
  }

  const focus = interviewFocus(travelerId);
  const run = rehearsal(travelerId, {
    preferences: rows.preferences,
    facts: rows.facts,
  });
  const messages = [];
  const turns = [];

  for (const said of answers) {
    const before = run.standing();
    const ctx = buildContext({
      ...rows,
      preferences: run.state.preferences,
      facts: run.state.facts,
      slots: run.state.slots,
      focus,
      message: said,
    });
    const system = buildSystemPrompt(ctx.text, focus, ctx.focusTripName, {
      people: ctx.travelerNames,
      intervieweeName: ctx.intervieweeName,
      petNames: ctx.known?.pets ? Array.from(ctx.known.pets.values()) : [],
      level: access?.level,
    });
    const tools = toolsForRequest({ focus, message: said });
    messages.push({ role: "user", text: said });

    const started = Date.now();
    let out = null;
    let failed = null;
    try {
      out = await generate({
        system,
        messages,
        tools,
        temperature: 0.7,
        deadline: Date.now() + TURN_MS,
      });
    } catch (error) {
      failed = error?.message || "The model did not answer.";
    }
    let askedAgain = false;
    // The route's own second pass. An interview turn that saves an answer and
    // says nothing is the failure this whole page exists to catch, so the
    // rehearsal has to make the same recovery attempt the app makes or it will
    // report a bug the family would never have seen.
    if (out && !(out.text || "").trim() && (out.calls || []).length) {
      try {
        const again = await generate({
          system: [
            system,
            "You are getting to know somebody, and you have just saved what they told you. Say in one line what you took from it, then put the one question the context hands you next, in words. Do not describe the card.",
          ].join("\n\n"),
          messages,
          tools: [],
          temperature: 0.7,
          deadline: Date.now() + 40000,
          avoid: out.model ? [out.model] : [],
        });
        if ((again?.text || "").trim()) {
          out.text = again.text;
          askedAgain = true;
        }
      } catch {
        // Nothing to report: the turn is already recorded as wordless, which is
        // the finding.
      }
    }

    const reply = (out?.text || "").trim();
    const calls = (out?.calls || []).map((call) => {
      const result = run.apply(call);
      return {
        name: call.name,
        args: call.args || {},
        refused: result?.refused || null,
      };
    });
    messages.push({ role: "assistant", text: reply });
    const recorded = run.noteAsked(ctx.interviewSlot, reply);

    turns.push({
      said,
      reply,
      failed,
      model: out?.model || null,
      seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      contextChars: ctx.text.length,
      toolCount: tools.length,
      handed: ctx.interviewSlot || null,
      recorded,
      askedAgain,
      calls,
      before,
      after: run.standing(),
    });
    if (failed) break;
  }

  return NextResponse.json({
    person: { id: person.id, name: person.name },
    turns,
    standing: run.standing(),
    written: run.written(),
  });
}
