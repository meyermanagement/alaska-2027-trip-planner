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

// One turn, not seven. A real model on a real prompt takes long enough that the
// page has to be able to show a question while the next one is still unwritten.
export const maxDuration = 120;

const TURN_MS = 60000;
const MAX_HISTORY = 40;

/**
 * One turn of an interview, conducted for real and written down nowhere.
 *
 * Every part of this is the app: the context builder, the system prompt, the
 * toolset, the model ladder, the second pass that demands words when a turn
 * comes back as cards alone. Only the writes are diverted -- into arrays, under
 * the same rules the apply route enforces -- so the whole thing can be answered
 * by hand and read afterwards without having spent anybody's real file on it.
 *
 * The page holds the conversation and hands it back each turn, along with the
 * rows this run has "written" so far. Those rows are merged over a fresh read of
 * the real record, so what Aly sees on turn five is what she would have seen if
 * turns one to four had actually saved.
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
  const said = String(payload?.said || "").trim();
  const history = (Array.isArray(payload?.history) ? payload.history : [])
    .slice(-MAX_HISTORY)
    .map((turn) => ({
      role: turn?.role === "assistant" ? "assistant" : "user",
      text: String(turn?.text || "").slice(0, 4000),
    }))
    .filter((turn) => turn.text);
  // What earlier turns would have written. Client-held, because none of it
  // exists anywhere else; harmless, because nothing here is ever saved and the
  // worst a tampered payload can do is make one person's rehearsal wrong.
  const carried = payload?.carried || {};
  const rows = Array.isArray(carried.preferences) ? carried.preferences : [];
  const carriedFacts = Array.isArray(carried.facts) ? carried.facts : [];
  const carriedSlots = Array.isArray(carried.slots) ? carried.slots : [];

  if (!travelerId || !said) {
    return NextResponse.json(
      { error: "Pick somebody and write an answer." },
      { status: 400 },
    );
  }

  const real = await readEverything(supabase, user.id);
  const person = (real.travelers || []).find((t) => t.id === travelerId);
  if (!person) {
    return NextResponse.json({ error: "No such person." }, { status: 404 });
  }

  const focus = interviewFocus(travelerId);
  const run = rehearsal(travelerId, {
    preferences: [...(real.preferences || []), ...rows],
    facts: [...(real.facts || []), ...carriedFacts],
    slots: carriedSlots,
  });
  const before = run.standing();

  const ctx = buildContext({
    ...real,
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
  const messages = [...history, { role: "user", text: said }];

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
  // The route's own second pass. A turn that saves an answer and says nothing is
  // the failure this page exists to catch, so the rehearsal has to make the same
  // recovery the app makes or it will report a bug the family never sees.
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
      // itself the finding.
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
  const recorded = run.noteAsked(ctx.interviewSlot, reply);
  const wrote = run.written();

  return NextResponse.json({
    person: { id: person.id, name: person.name },
    turn: {
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
    },
    standing: run.standing(),
    // Handed straight back for the next turn, so the page never has to know what
    // a preference row looks like.
    carried: {
      preferences: wrote.preferences,
      facts: wrote.facts,
      slots: wrote.slots,
    },
  });
}
