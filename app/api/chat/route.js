import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sortItinerary } from "@/lib/day/order";
import { generate, ModelError } from "@/lib/agent/llm";
import {
  buildContext,
  buildSystemPrompt,
  isKnownFocus,
  NEW_TRIP_FOCUS,
  LOG_TRIP_FOCUS,
} from "@/lib/agent/context";
import { validateAction, pendingTripNames } from "@/lib/agent/tools";
import { toolsForRequest } from "@/lib/agent/toolset";
import { resolveAccess } from "@/lib/travelers/access";
import {
  asksToSave,
  heldBackNote,
  noSearchNote,
  isClarifying,
  holdBackChanges,
  shouldLookUp,
} from "@/lib/agent/ideas";
import { recordRefusals } from "@/lib/agent/refusals";
import { mergePlaces, splitPlaceCalls } from "@/lib/places/cards";
import { needsWords, writeTheWords } from "@/lib/places/rollcall";
import { splitFollowupCalls } from "@/lib/agent/followups";
import {
  ANSWERING_TOOLS,
  answerAsWell,
  asksSomething,
} from "@/lib/agent/asked";
import {
  splitRecallCalls,
  matchLessons,
  recallSection,
} from "@/lib/agent/lessons";
import { splitTipCalls, lookFrom, lookLine, stepsFor } from "@/lib/tips/ask";
import { enrich } from "@/lib/places/photos";
import { bias, hereLine, normalizeHere, withDistance } from "@/lib/places/here";
import {
  CONTEXT_MESSAGES,
  appendMessage,
  ensureConversation,
  listConversations,
  loadThread,
  recallOtherConversations,
  toModelMessages,
} from "@/lib/agent/thread";

export const runtime = "nodejs";
// Sixty seconds was the whole request, and one grounded question no longer fits
// in it. Two questions in a row came back as "That took longer than I am allowed
// to think" -- both of them the trip-wide kind, both of them searching the web,
// and the one before them that did answer took 45.2 of the model's 46 seconds. It
// was not a large paste, which is what that message blames, and there was nothing
// to ask less of.
export const maxDuration = 120;

// One clock for the whole request, so every model turn is drawn from the same
// allowance instead of each one assuming it has the full 46 seconds. Three turns
// each helping themselves to 46 is how a route with a sixty-second limit gets cut
// off mid-sentence with nothing written down.
const ROUTE_BUDGET_MS = 105000;
// Held back for the work after the model: finding photographs for the cards,
// measuring distances, writing the answer down, and getting the response out.
const RESERVE_MS = 14000;
// A grounded question is a search and then an answer about what came back, and it
// is the search that is slow.
const GROUNDED_TURN_MS = 62000;
const PLAIN_TURN_MS = 40000;
// When the grounded attempt runs out of time, one more without the searching. An
// answer from what she already knows, saying it did not get to look, beats an
// apology with the question left hanging.
const RESCUE_TURN_MS = 26000;
// The turns that improve an answer she has already given -- her own notes, the
// words above a proposal, the words above a shortlist. Worth having and never
// worth the whole allowance.
const EXTRA_TURN_MS = 34000;
// Below this there is no point starting: a call that gets cut off mid-sentence
// costs the same as one that was never made and produces less.
const MIN_TURN_MS = 12000;

export async function POST(request) {
  // Where the request's own allowance starts. Read by every model turn below.
  const startedAt = Date.now();
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const tripId = payload?.tripId;
  // Which section of the trip the user was looking at, or "new_trip" when they
  // came from the trip builder screen. Whitelisted so it can only ever be one of ours.
  const focus = isKnownFocus(payload?.focus) ? payload.focus : null;
  // The client sends only what was just typed. The conversation itself lives in
  // chat_messages, so it survives a reload, a different device, and a change of
  // model provider.
  const said =
    typeof payload?.message === "string" ? payload.message.trim() : "";
  // A second go at a question that failed to reach the model at all.
  const retry = payload?.retry === true;
  // One id per press of Send, made by the screen and written on the question and
  // on everything answered on the back of it. One question came back as two
  // answers on screen and the rows kept no record of which press each belonged
  // to, so there was no way afterwards to tell that from two questions asked.
  const askId =
    typeof payload?.askId === "string" && /^[0-9a-f-]{36}$/i.test(payload.askId)
      ? payload.askId
      : null;
  if (!said) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  // Whether this person may ask Aly to change things, or only to answer.
  const access = await resolveAccess(supabase, user);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const userName = profileRow?.display_name;

  // Aly always sees the whole app. A trip id only says which trip is open, so
  // it becomes the default target for anything the user does not pin elsewhere.
  const snapshot = await loadEverything(
    supabase,
    userName,
    tripId || null,
    said,
  );
  if (tripId && !snapshot.focusTripId) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }
  const ctx = snapshot;
  const threadTripId = snapshot.focusTripId || null;

  // Which conversation this belongs to. The client sends one it picked from the
  // list, or nothing at all, in which case a new one starts here and its id goes
  // back with the reply.
  const { id: conversationId } = await ensureConversation(supabase, user.id, {
    conversationId:
      typeof payload?.conversationId === "string"
        ? payload.conversationId
        : null,
    tripId: threadTripId,
    focus,
  });
  if (!conversationId) {
    return NextResponse.json(
      { error: "Could not open that conversation." },
      { status: 500 },
    );
  }

  const { messages: past } = await loadThread(
    supabase,
    conversationId,
    CONTEXT_MESSAGES,
  );

  // Conversations are separate, but not sealed off from each other: Aly is told
  // what the others were about, and the words of this question are used to pull
  // the closest lines out of them. Best effort — a failure here only costs her
  // the cross-reference, so it must never cost the answer.
  let extras = {};
  try {
    const [{ conversations }, { hits }] = await Promise.all([
      listConversations(supabase, 20),
      recallOtherConversations(supabase, {
        message: said,
        exclude: conversationId,
      }),
    ]);
    extras = {
      others: (conversations || []).filter((c) => c.id !== conversationId),
      recall: hits || [],
    };
  } catch {
    extras = {};
  }

  // Where they are standing, if they chose to say. Nothing infers it: the button
  // and the typed override are the only two ways it arrives.
  const here = normalizeHere(payload?.here);
  // A pet's own name is often the only clue that a question is about an animal,
  // so the names on file go in with the message — and into the prompt, so the
  // new-trip questions can ask about the dog by name instead of in the abstract.
  const petNames = ctx.known?.pets ? Array.from(ctx.known.pets.values()) : [];
  const system = buildSystemPrompt(ctx.text, focus, ctx.focusTripName, {
    ...extras,
    here,
    petNames,
    level: access?.level,
    travelerName: access?.travelerName,
  });
  // Not all 28 of them: the ones this screen and these words could plausibly
  // need. See lib/agent/toolset.js for why fewer is more accurate as well as
  // cheaper.
  const tools = toolsForRequest({
    focus,
    message: said,
    petNames,
    level: access?.level,
  });

  const messages = [...toModelMessages(past), { role: "user", text: said }];

  // "Where should we have dinner in Anchorage" cannot be answered from the
  // family's own trip data, and answering it from what a model half-remembers
  // about a city is how you end up recommending a restaurant that closed in 2024.
  // On these questions only, Aly is allowed to search.
  const lookUp = shouldLookUp(said, messages);

  // Store the question before answering it, so a failed or timed-out reply still
  // leaves the transcript honest about what was asked.
  //
  // Unless this IS that failed question coming back. The screen offers a retry
  // when the model could not be reached, and the first attempt already wrote the
  // question down -- storing it again would leave the family reading their own
  // sentence twice and Aly answering a question she was asked once. Checked
  // against the thread rather than trusted: the flag only permits the skip, the
  // identical last line is what earns it.
  const lastSaid = past.at(-1);
  const alreadyAsked =
    retry &&
    lastSaid?.role === "user" &&
    String(lastSaid.body || lastSaid.text || "").trim() === said;
  if (!alreadyAsked) {
    await appendMessage(supabase, {
      userId: user.id,
      conversationId,
      tripId: threadTripId,
      role: "user",
      body: said,
      askId,
    });
  }

  let result;
  let failed = null;
  const askedAt = Date.now();
  // What is left of the request's own allowance, once the work after the model is
  // set aside. Every turn below asks this rather than assuming.
  const spare = () => ROUTE_BUDGET_MS - (Date.now() - startedAt) - RESERVE_MS;
  // The clock a turn should be given: what it wants, or what is left, whichever
  // is less. Null when there is not enough left to be worth starting.
  const clock = (want) => {
    const room = Math.min(want, spare());
    return room >= MIN_TURN_MS ? Date.now() + room : null;
  };
  try {
    result = await generate({
      system,
      messages,
      tools,
      grounded: lookUp,
      deadline:
        clock(lookUp ? GROUNDED_TURN_MS : PLAIN_TURN_MS) ||
        Date.now() + MIN_TURN_MS,
    });
  } catch (first) {
    failed = first;
    // Out of time on a question that was searching the web. The search is the
    // slow half, so there is one more go without it: she answers from the trip
    // and from what she knows, and the app adds the line saying she did not get
    // to look, which it does for every unsearched answer already.
    const rescueBy = first?.timedOut && lookUp ? clock(RESCUE_TURN_MS) : null;
    if (rescueBy) {
      try {
        result = await generate({
          system,
          messages,
          tools,
          grounded: false,
          deadline: rescueBy,
        });
        failed = null;
      } catch {
        // Keep the first failure. It is the one worth reporting: it says the
        // time ran out, and it did.
      }
    }
  }
  if (failed) {
    const err = failed;
    const status = err instanceof ModelError ? err.status : 502;
    // Why it failed, kept where it can be looked up tomorrow.
    await recordRefusals(supabase, {
      userId: user.id,
      asked: said,
      wantedSearch: lookUp,
      searched: false,
      refusals: err?.refusals,
    });
    return NextResponse.json(
      {
        error: err.timedOut
          ? // The provider says only that it ran out of time. What to do about it
            // depends on what was asked, and the old advice -- ask less, split
            // your paste in half -- was wrong for the questions this actually
            // happens on. Both of the ones that failed were one sentence about a
            // whole trip, with the web being searched behind them, and there was
            // nothing to ask less of. So say which half is slow and what a
            // smaller version of the same question looks like.
            `${err.message} Searching the web about a whole trip is the slow part. Ask me about one day, one town or one evening and I will get there — or ask me the same thing again and I will answer it from what I already know about the trip.`
          : err.message || "The assistant is unavailable right now.",
      },
      { status: status === 403 ? 500 : status },
    );
  }

  // Her notes, when the slice in the context was not enough. This is the one
  // place the model gets a second turn: it asked a question of its own store, and
  // an answer it cannot see is no use to it. Once only, and with the tool taken
  // away the second time, so a recall cannot become a loop.
  const { asked: recallAsk } = splitRecallCalls(result.calls);
  if (recallAsk && clock(EXTRA_TURN_MS)) {
    const extraBy = clock(EXTRA_TURN_MS);
    let found = [];
    try {
      const { data: store } = await supabase
        .from("lessons")
        .select(
          "id, trip_id, subject, body, kind, learned_from, status, times_recalled, created_at",
        )
        .eq("status", "active")
        .limit(500);
      found = matchLessons(store || [], recallAsk);
      // Which notes keep proving useful, so the slice can favour them later.
      if (found.length) {
        await Promise.all(
          found.map((row) =>
            supabase
              .from("lessons")
              .update({
                times_recalled: (Number(row.times_recalled) || 0) + 1,
                last_recalled_at: new Date().toISOString(),
              })
              .eq("id", row.id),
          ),
        );
      }
    } catch {
      found = [];
    }
    try {
      const second = await generate({
        system: `${system}\n\n${recallSection(found, recallAsk)}`,
        messages,
        tools: tools.filter((tool) => tool.name !== "recall_lessons"),
        grounded: lookUp,
        // Drawn from the same allowance as everything else. When the first turn
        // has already spent it, her notes go unread rather than the whole
        // request being cut off with nothing written down.
        deadline: extraBy,
      });
      // Only take the second answer if there is one: a reply that came back empty
      // would throw away a perfectly good first attempt.
      if (second && (second.text || (second.calls || []).length))
        result = second;
    } catch {
      // Keep the first reply. Its text will not mention the notes, which is
      // a worse answer rather than a broken one.
    }
    result = {
      ...result,
      calls: splitRecallCalls(result.calls).calls,
    };
  }

  // A shortlist of places is an answer, not a change, so it is taken out before
  // anything here treats a tool call as something to save.
  const { calls: withoutPlaces, places: shortlist } = splitPlaceCalls(
    result.calls,
  );
  // The questions she offered next are neither a change nor part of the answer,
  // so they come out here too.
  let { calls: withoutFollowups, followups } =
    splitFollowupCalls(withoutPlaces);
  // Asking to go and research is neither a change nor an answer: it is a thing
  // that happens after she has finished speaking, so it comes out here too.
  const { calls: changeCalls, asked: tipCall } =
    splitTipCalls(withoutFollowups);

  // Two things in one breath -- a correction and a question -- and she answered
  // the change with a card and said nothing, so the question vanished. A proposal
  // is not an answer. She gets one more turn for the words alone, with every
  // change tool taken away so what she has already proposed cannot be proposed
  // twice, and with the shortlist tools left in because "where can we go from
  // Lisbon" is answered in cards.
  let shortlistAll = shortlist;
  if (
    !result.text &&
    changeCalls.length &&
    asksSomething(said) &&
    clock(EXTRA_TURN_MS)
  ) {
    const wordsBy = clock(EXTRA_TURN_MS);
    try {
      const words = await generate({
        system: [system, answerAsWell(said)].join("\n\n"),
        messages,
        // A shortlist already on screen means the shortlist tool comes away.
        // Asked the same trip twice, a model does not repeat itself exactly --
        // it offers "Quinta da Regaleira" and then "Quinta da Regaleira Guided
        // Tour" -- and the family gets the same place on two cards.
        tools: tools.filter(
          (tool) =>
            ANSWERING_TOOLS.has(tool.name) &&
            !(shortlist.length && tool.name === "show_places"),
        ),
        grounded: lookUp,
        deadline: wordsBy,
      });
      if (words?.text || (words?.calls || []).length) {
        const { places: more } = splitPlaceCalls(words.calls);
        const { followups: nextQuestions } = splitFollowupCalls(words.calls);
        shortlistAll = mergePlaces(shortlist, more);
        if (nextQuestions.length) followups = nextQuestions;
        result = {
          ...result,
          text: words.text || result.text,
          searched: result.searched || words.searched,
          sources: (result.sources || []).concat(words.sources || []),
          refusals: (result.refusals || []).concat(words.refusals || []),
        };
      }
    } catch {
      // The change still stands. It arrives without words, which is the same
      // answer they got before and no worse for having tried.
    }
  }

  // Cards, and nothing worth reading above them. Either she wrote the shortlist
  // out again -- the names are already on the cards and the button is already on
  // every card, so that reply says nothing -- or she wrote nothing at all and
  // treated the cards as the whole answer, which is worse: "Which of these
  // should we add?" is a question asking to be advised, and it came back as ten
  // names. One more turn for the words alone, with show_places taken away so a
  // third listing is not available to her, and with every change tool still
  // withheld for the same reason as above.
  if (needsWords(result.text, shortlistAll) && clock(EXTRA_TURN_MS)) {
    const betterBy = clock(EXTRA_TURN_MS);
    try {
      const better = await generate({
        system: [system, writeTheWords(said, shortlistAll)].join("\n\n"),
        messages,
        tools: tools.filter((tool) => tool.name === "offer_followups"),
        // The words are the point of this turn and the searching is not: she is
        // being asked to say something about a shortlist that is already on the
        // screen. Taking the search away is what makes it affordable at the end
        // of a request that has already spent most of its allowance.
        grounded: false,
        deadline: betterBy,
      });
      // Only if the second try is actually an answer. A model that comes back
      // with the same roll call, or with nothing, leaves the first reply alone:
      // thin words above the cards beat no words above the cards.
      if (better?.text && !needsWords(better.text, shortlistAll)) {
        const { followups: nextQuestions } = splitFollowupCalls(
          better.calls || [],
        );
        if (nextQuestions.length) followups = nextQuestions;
        result = {
          ...result,
          text: better.text,
          searched: result.searched || better.searched,
          sources: (result.sources || []).concat(better.sources || []),
          refusals: (result.refusals || []).concat(better.refusals || []),
        };
      }
    } catch {
      // The cards still stand, and so does the thin line above them.
    }
  }

  const places = withDistance(
    await enrich(shortlistAll, { bias: bias(here) }),
    here,
  );

  const proposed = [];
  const problems = [];
  // A trip being created in this same turn has no id yet, so the itinerary and
  // packing rows that came with it are filed against its name instead.
  const pendingTrips = pendingTripNames(changeCalls);
  for (const call of changeCalls) {
    const { action, error } = validateAction(call, {
      travelerNames: ctx.travelerNames,
      travelerIds: ctx.travelerIds,
      known: ctx.known,
      focusTripId: ctx.focusTripId,
      pendingTrips,
      newTripDraft: focus === NEW_TRIP_FOCUS,
      loggedTrip: focus === LOG_TRIP_FOCUS,
    });
    if (action) proposed.push(action);
    else if (error) problems.push(error);
  }

  // Asked for ideas, and asked to save nothing: whatever she proposed goes no
  // further than a sentence saying it is there for the asking.
  const { kept: actions, held } = holdBackChanges(proposed, { message: said });

  // The looking itself, worked out but not started. The route hands back the
  // steps and the screen runs them, because one grounded look uses most of the
  // sixty seconds this route is given and a trip takes five of them.
  let look = null;
  if (tipCall) {
    const resolved = lookFrom(tipCall, {
      tripId: ctx.focusTripId,
      tripName: ctx.focusTripName,
      known: ctx.known,
    });
    if (resolved.problem) problems.push(resolved.problem);
    if (resolved.look) {
      // Only a trip-level look needs to know which bookings are coming up, so
      // the query for them is paid for only on that path.
      let upcoming = [];
      if (resolved.look.scope === "trip") {
        const { data } = await supabase
          .from("itinerary_items")
          .select("id, item_date")
          .eq("trip_id", resolved.look.tripId)
          .not("item_date", "is", null)
          .gte("item_date", new Date().toISOString().slice(0, 10))
          .order("item_date", { ascending: true })
          .limit(3);
        upcoming = data || [];
      }
      look = {
        ...resolved.look,
        steps: stepsFor(resolved.look, upcoming),
      };
    }
  }

  let reply = result.text;
  // Asked to look something up, and the looking up did not happen: the allowance
  // is spent or the vendor that answered cannot search. The answer still stands,
  // but it is a recollection rather than a reading, and it says so.
  // Worth writing down whenever a look-up was wanted and did not happen, even
  // when nobody refused us: a row with no refusal in it means the vendor that
  // answered cannot search at all, which is a different problem with a different
  // fix, and guessing between the two is what cost this evening.
  const refusals = result.refusals?.length
    ? result.refusals
    : lookUp && !result.searched
      ? [{ model: result.model, grounded: false }]
      : [];
  if (refusals.length) {
    await recordRefusals(supabase, {
      userId: user.id,
      asked: said,
      wantedSearch: lookUp,
      searched: result.searched,
      refusals,
    });
  }
  if (lookUp && !result.searched && reply && !isClarifying(reply)) {
    reply = `${reply}\n\n${noSearchNote()}`;
  }
  const note = heldBackNote(held);
  if (note && reply && !asksToSave(said)) {
    reply = `${reply}\n\n${note}`;
  } else if (note && !reply) {
    reply = note;
  }
  // She called the tool and said nothing, which is common when the tool call was
  // the whole answer. The waiting sentence has to come from somewhere.
  if (look && !reply) reply = lookLine(look);
  // Nothing at all: no words, no change, no shortlist, and no complaint to pass
  // on. This used to say "I am not sure how to help with that yet.", which reads
  // as a limit of the app and blames the question. It is not either of those --
  // reaching this line means something upstream came back empty, and the honest
  // thing is to say so and let them press again, which now usually works because
  // the ladder no longer accepts silence as an answer.
  if (!reply && actions.length === 0 && places.length === 0) {
    reply = problems.length
      ? Array.from(new Set(problems)).join(" ")
      : "Something went wrong at my end and I lost that one. Ask me again.";
  }

  // What Aly proposed matters as much as what she said, so the transcript keeps
  // the proposal alongside the reply.
  const spoken = reply || (places.length ? placesLine(places) : "");
  const record = actions.length
    ? [spoken, `(Proposed: ${actions.map((a) => a.summary).join("; ")})`]
        .filter(Boolean)
        .join("\n\n")
    : spoken;
  if (record) {
    await appendMessage(supabase, {
      userId: user.id,
      conversationId,
      tripId: threadTripId,
      role: "assistant",
      body: record,
      // Which model answered, and how hard it was to get an answer. Without this
      // there is no way to tell a slow first choice from a fast third fallback
      // when someone says Aly felt wrong today.
      provider: result.provider,
      model: result.model,
      latencyMs: Date.now() - askedAt,
      fallbackDepth: result.fallbackDepth,
      // Where a looked-up answer came from, kept with the answer so it is still
      // checkable when the conversation is reopened next week.
      sources: result.sources,
      // The cards belong to the answer. Without this, reopening the conversation
      // tomorrow would leave five names and nothing to tap.
      places,
      // And so do the ways on from it.
      followups,
      // Same id as the question above, so one press is one query.
      askId,
    });
  }

  return NextResponse.json({
    // The spoken line, not the raw reply: when the model answers entirely in
    // cards it says nothing at all, and a reply of "" left the panel with
    // nothing to hang the cards on until the screen was reloaded. Sending what
    // was written to the transcript means the live answer and the reopened
    // conversation read the same way.
    reply: spoken,
    actions,
    problems,
    conversationId,
    sources: result.sources || [],
    places,
    followups,
    // What the screen should go and do once the reply is on screen.
    look,
  });
}

// Everything the family has, in one snapshot. RLS keeps it to their own rows.
async function loadEverything(supabase, userName, focusTripId, said = "") {
  const [
    trips,
    itinerary,
    packing,
    tasks,
    notes,
    travelers,
    rosters,
    preferences,
    rewards,
    templates,
    templateItems,
    lessons,
    pets,
    tripPets,
    insights,
  ] = await Promise.all([
    supabase.from("trips").select("*").order("start_date", { ascending: true }),
    supabase
      .from("itinerary_items")
      .select("*")
      .order("item_date", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("packing_items")
      .select("*")
      // Rows set aside when somebody came off a roster are not on any list, so
      // they are not part of what Aly is looking at either.
      .is("stashed_at", null)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("predeparture_tasks")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_notes")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("travelers")
      .select(
        // The three profile groups ride along, because they are what turns
        // Aly's advice from a travel article into advice about these people.
        "id, name, email, user_id, invited_at, date_of_birth, gender, phone_carrier, phone_device, mobility_aids, accessibility_notes, languages, about_me",
      )
      .order("sort_order"),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
    supabase
      .from("travel_preferences")
      .select("id, topic, topics, body, traveler_id")
      .order("topic", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("rewards_programs")
      .select("*")
      .eq("is_active", true)
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("packing_templates")
      .select("id, name, description, is_base")
      .order("is_base", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("packing_template_items")
      .select("id, template_id, category, item, assignee, quantity")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true }),
    // Her own notes. Ranked in lib/agent/lessons.js rather than here, because
    // which ones matter depends on the question as much as on the trip.
    supabase
      .from("lessons")
      .select(
        "id, trip_id, subject, body, kind, learned_from, status, times_recalled, created_at",
      )
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("pets")
      .select(
        "id, name, species, breed, date_of_birth, sex, is_sterilized, weight_lb, travel_style, carrier_size, is_service_animal, rabies_expiration, health_certificate_expiration, medications, dietary_notes, temperament_notes, notes",
      )
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_pets")
      .select("trip_id, pet_id, arrangement, arrangement_notes"),
    // What the day view already found out about individual bookings. Loaded so
    // that a question asked out loud gets the same answer as the line on the
    // screen -- and so Aly does not go and search for a dress code the app is
    // already displaying two inches above the chat.
    supabase
      .from("item_insights")
      .select(
        "item_id, trip_id, fingerprint, dress_code, arrive_minutes, arrive_why, heads_up, bring",
      ),
  ]);

  return buildContext({
    trips: trips.data || [],
    focusTripId,
    // In the same order the family sees it. Aly reading a day bottom-up is how
    // "what is first tomorrow" comes back as the last thing on it.
    itinerary: sortItinerary(itinerary.data || []),
    packing: packing.data || [],
    tasks: tasks.data || [],
    notes: notes.data || [],
    travelers: travelers.data || [],
    rosters: rosters.data || [],
    preferences: preferences.data || [],
    rewards: rewards.data || [],
    templates: templates.data || [],
    templateItems: templateItems.data || [],
    lessons: lessons.data || [],
    pets: pets.data || [],
    tripPets: tripPets.data || [],
    insights: insights.data || [],
    message: said,
    userName,
  });
}

// What the transcript says when the answer was entirely cards.
//
// This is now the last resort rather than the ordinary case: cards with nothing
// said above them get a second turn for the words, so reaching this line means
// that turn came back empty too. It used to read the names out -- every one of
// them already on a card three inches below, which is what "Livraria Bertrand;
// Quinta da Regaleira; ... Tap Add to itinerary on any one" was -- and reading
// them out is not an answer however many times it is written. So it says what
// actually happened instead, and reopening the conversation next week shows the
// cards with an honest line above them rather than a blank message.
function placesLine(places) {
  const these = places.length === 1 ? "One place" : `${places.length} places`;
  return `${these} to look at below. I did not manage to get the words out this time — ask me again and I will say which one I would pick and why.`;
}
