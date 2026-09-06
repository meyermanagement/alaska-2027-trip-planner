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
import { saidNothing } from "@/lib/agent/asked";
import { rehearsal } from "@/lib/travelers/rehearse";

// One turn, not seven. A real model on a real prompt takes long enough that the
// page has to be able to show a question while the next one is still unwritten.
export const maxDuration = 120;

const TURN_MS = 60000;
// The only person in a brand-new account. Fixed rather than random so the page can
// name it before the first turn, and never written anywhere.
const NEW_PERSON = "00000000-0000-4000-8000-000000000001";

/**
 * The whole record of an account nobody has used yet.
 *
 * Everything empty, and the parts the welcome screen collects before the first
 * question: the household's home, every named traveler, every named animal.
 * The primary is the first name in `people`; the other names read exactly as
 * they would on a real family, so Aly opens on turn one knowing who is here
 * and does not have to ask.
 */
function blankAccount({ home, people, pets }) {
  const travelers = people.length
    ? people.map((p, i) => ({
        id: p.id,
        name: p.name,
        is_person: true,
        sort_order: i,
      }))
    : [
        {
          id: NEW_PERSON,
          name: "Sam",
          is_person: true,
          sort_order: 0,
        },
      ];
  const animals = (pets || []).map((a, i) => ({
    id: a.id,
    name: a.name,
    species: a.species || "other",
    sort_order: i,
  }));
  return {
    trips: [],
    itinerary: [],
    packing: [],
    tasks: [],
    notes: [],
    travelers,
    rosters: [],
    preferences: [],
    rewards: [],
    templates: [],
    templateItems: [],
    tripTemplates: [],
    lessons: [],
    pets: animals,
    tripPets: [],
    insights: [],
    costs: [],
    facts: [],
    slots: [],
    moments: [],
    userName: travelers[0]?.name || "Sam",
    home: home?.address
      ? {
          home_address: home.address,
          home_lat: Number.isFinite(home.lat) ? home.lat : null,
          home_lon: Number.isFinite(home.lon) ? home.lon : null,
          home_precise: home.precise === true,
        }
      : null,
  };
}
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
  // A first login, which is where this interview will mostly be met. The account
  // holds a name off the signup form and an address if they gave one, and nothing
  // else: no trips, no preferences, no animals, no paragraph about themselves.
  // Practising against Veda's five-year-old record answers a different question
  // than the one that matters, because Aly opens that one already knowing what
  // she likes.
  const blank = payload?.blank === true;
  // A brand-new account carries the parts the welcome screen collected --
  // where the family lives, everybody's name, every animal -- so Aly does not
  // spend her first two questions asking who is here. The primary traveler is
  // the first name in the list.
  const seededPeople = Array.isArray(payload?.people)
    ? payload.people
        .map((p, i) => ({
          id:
            typeof p?.id === "string" && p.id
              ? p.id
              : `${NEW_PERSON.slice(0, -1)}${(i + 1).toString(16)}`,
          name: String(p?.name || "")
            .trim()
            .slice(0, 60),
        }))
        .filter((p) => p.name)
    : [];
  const seededPets = Array.isArray(payload?.pets)
    ? payload.pets
        .map((p, i) => ({
          id:
            typeof p?.id === "string" && p.id ? p.id : `rehearsal-pet-${i + 1}`,
          name: String(p?.name || "")
            .trim()
            .slice(0, 60),
          species: String(p?.species || "other")
            .trim()
            .slice(0, 40),
        }))
        .filter((p) => p.name)
    : [];
  const seededHome =
    payload?.home && typeof payload.home === "object"
      ? {
          address: String(payload.home.address || "")
            .trim()
            .slice(0, 200),
          lat: Number.isFinite(payload.home.lat) ? payload.home.lat : null,
          lon: Number.isFinite(payload.home.lon) ? payload.home.lon : null,
          precise: payload.home.precise === true,
        }
      : { address: "", lat: null, lon: null, precise: false };
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

  const real = blank
    ? blankAccount({
        home: seededHome,
        people: seededPeople,
        pets: seededPets,
      })
    : await readEverything(supabase, user.id);
  const person = (real.travelers || []).find((t) => t.id === travelerId);
  if (!person) {
    return NextResponse.json({ error: "No such person." }, { status: 404 });
  }

  const focus = interviewFocus(travelerId);
  const run = rehearsal(travelerId, {
    preferences: [...(real.preferences || []), ...rows],
    facts: [...(real.facts || []), ...carriedFacts],
    slots: carriedSlots,
    pets: real.pets || [],
    people: real.travelers || [],
    moments: real.moments || [],
  });
  const before = run.standing();

  const ctx = buildContext({
    ...real,
    preferences: run.state.preferences,
    facts: run.state.facts,
    slots: run.state.slots,
    moments: run.state.moments,
    travelers: run.state.people,
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
  // The same second pass the chat route makes, on the same condition it now uses:
  // any turn that came back without words, whether or not it saved something.
  // Silence with no card beside it is the worst version -- the person is sitting
  // there waiting to be asked -- and it used to fall through both gates because
  // both counted the tool calls first.
  if (out && saidNothing(out.text)) {
    try {
      const again = await generate({
        system: [
          system,
          (out.calls || []).length
            ? "You are getting to know somebody, and you have just saved what they told you. Say in one line what you took from it, then put the one question the context hands you next, in words. Do not describe the card."
            : "Your last turn came back empty. You are getting to know somebody and they have just answered you. Say in one line what you took from it, then put the one question the context hands you next, in words.",
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

  // saidNothing, not merely empty: a turn that typed its tool call out as prose
  // said nothing anybody can answer.
  const spoke = (out?.text || "").trim();
  const reply = saidNothing(spoke) ? "" : spoke;
  // What the app would put on screen if this happened for real. The chat route
  // never shows an empty reply -- it says it lost the turn and offers another go
  // -- and a rehearsal that showed a blank where the app shows a sentence would
  // be reporting a worse bug than the one that happened.
  const shown =
    reply ||
    "Something went wrong at my end and I lost that one. Ask me again.";
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
      reply: shown,
      // Whether those were her words or the app's apology standing in for them.
      wordless: !reply,
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
