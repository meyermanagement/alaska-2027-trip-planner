import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generate, ModelError } from "@/lib/agent/llm";
import {
  buildContext,
  buildSystemPrompt,
  isKnownFocus,
  NEW_TRIP_FOCUS,
} from "@/lib/agent/context";
import { validateAction, pendingTripNames } from "@/lib/agent/tools";
import { toolsForRequest } from "@/lib/agent/toolset";
import {
  asksToSave,
  heldBackNote,
  noSearchNote,
  isClarifying,
  holdBackChanges,
  shouldLookUp,
} from "@/lib/agent/ideas";
import { recordRefusals } from "@/lib/agent/refusals";
import { splitPlaceCalls } from "@/lib/places/cards";
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
export const maxDuration = 60;

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const tripId = payload?.tripId;
  // Which section of the trip the user was looking at, or "new_trip" when they
  // came from "Create with Aly". Whitelisted so it can only ever be one of ours.
  const focus = isKnownFocus(payload?.focus) ? payload.focus : null;
  // The client sends only what was just typed. The conversation itself lives in
  // chat_messages, so it survives a reload, a different device, and a change of
  // model provider.
  const said =
    typeof payload?.message === "string" ? payload.message.trim() : "";
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
  const system = buildSystemPrompt(ctx.text, focus, ctx.focusTripName, {
    ...extras,
    here,
  });
  // Not all 28 of them: the ones this screen and these words could plausibly
  // need. See lib/agent/toolset.js for why fewer is more accurate as well as
  // cheaper.
  const tools = toolsForRequest({ focus, message: said });

  const messages = [...toModelMessages(past), { role: "user", text: said }];

  // "Where should we have dinner in Anchorage" cannot be answered from the
  // family's own trip data, and answering it from what a model half-remembers
  // about a city is how you end up recommending a restaurant that closed in 2024.
  // On these questions only, Aly is allowed to search.
  const lookUp = shouldLookUp(said, messages);

  // Store the question before answering it, so a failed or timed-out reply still
  // leaves the transcript honest about what was asked.
  await appendMessage(supabase, {
    userId: user.id,
    conversationId,
    tripId: threadTripId,
    role: "user",
    body: said,
  });

  let result;
  const askedAt = Date.now();
  try {
    result = await generate({ system, messages, tools, grounded: lookUp });
  } catch (err) {
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
      { error: err.message || "The assistant is unavailable right now." },
      { status: status === 403 ? 500 : status },
    );
  }

  // Her notes, when the slice in the context was not enough. This is the one
  // place the model gets a second turn: it asked a question of its own store, and
  // an answer it cannot see is no use to it. Once only, and with the tool taken
  // away the second time, so a recall cannot become a loop.
  const { asked: recallAsk } = splitRecallCalls(result.calls);
  if (recallAsk) {
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
  // Asking to go and research is neither a change nor an answer: it is a thing
  // that happens after she has finished speaking, so it comes out here too.
  const { calls: changeCalls, asked: tipCall } = splitTipCalls(withoutPlaces);
  const places = withDistance(
    await enrich(shortlist, { bias: bias(here) }),
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
  if (!reply && actions.length === 0 && places.length === 0) {
    reply = problems.length
      ? Array.from(new Set(problems)).join(" ")
      : "I am not sure how to help with that yet.";
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
      .select("id, name, email, user_id, invited_at")
      .order("sort_order"),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
    supabase
      .from("travel_preferences")
      .select("id, topic, body, traveler_id")
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
  ]);

  return buildContext({
    trips: trips.data || [],
    focusTripId,
    itinerary: itinerary.data || [],
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
    message: said,
    userName,
  });
}

// What the transcript says when the answer was entirely cards. Reopening a
// conversation to a blank assistant message would look like a fault.
function placesLine(places) {
  const names = places.map((p) => p.name).join("; ");
  const tap = places.length === 1 ? "it" : "any one";
  return `${names}. Tap Add to itinerary on ${tap}, or tell me which.`;
}
