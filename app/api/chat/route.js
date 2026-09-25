import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadEverything } from "@/lib/agent/load";
import { consentOnce, generate, ModelError } from "@/lib/agent/llm";
import {
  buildSystemPrompt,
  rightNowNote,
  isKnownFocus,
  NEW_TRIP_FOCUS,
  LOG_TRIP_FOCUS,
  expandAliases,
} from "@/lib/agent/context";
import {
  validateAction,
  pendingTripNames,
  pendingTripStatuses,
  pendingTemplateNames,
} from "@/lib/agent/tools";
import { toolsForRequest } from "@/lib/agent/toolset";
import { resolveAccess } from "@/lib/travelers/access";
import { readConsent } from "@/lib/beta/consent";
import { accountAge } from "@/lib/beta/accountAge";
import { chatPermissionError } from "@/lib/beta/chatPermission";
import { markSettled, noteAsked } from "@/lib/travelers/ledger";
import { SLOT_BY_ID, slotFromWords } from "@/lib/travelers/slots";
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
import {
  applyFloors,
  floorDropLine,
  ratingFloors,
  rentalFallback,
  withRatingFloor,
} from "@/lib/places/rated";
import { withPrograms } from "@/lib/places/stay";
import {
  needsCards,
  needsWords,
  showThePlaces,
  wordsWithCards,
  writeTheWords,
} from "@/lib/places/rollcall";
import { splitFollowupCalls, wordsWithFollowups } from "@/lib/agent/followups";
import {
  saidNothing,
  answerAsWell,
  asksAdvice,
  asksSomething,
  retryWhenEmpty,
  gistOf,
  needsReasons,
  wordlessLine,
} from "@/lib/agent/asked";
import { callsLine, finishFeature, finishTools, withFinishNote } from "@/lib/agent/finish";
import {
  splitRecallCalls,
  matchLessons,
  recallSection,
} from "@/lib/agent/lessons";
import { splitTipCalls, lookFrom, lookLine, stepsFor } from "@/lib/tips/ask";
import { enrich } from "@/lib/places/photos";
import { cardsFromReply } from "@/lib/places/named";
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
import { homeToday } from "@/lib/format";
import { tidyAnswer } from "@/lib/agent/tidy";
import {
  readConversationScope,
  scopeToConversation,
} from "@/lib/agent/conversationScope";

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
// A plain question has no search to wait on, so 40 seconds looked generous. It
// was not: the request's own allowance is 105 seconds and the reserve is 14, so a
// 40-second turn left about 48 seconds of a request that had already failed
// unspent. Worse, 40 seconds is one model's worth -- the primary spent all of it
// going quiet and the faster fallback was never asked, which is the whole reason
// there is a second model. 54 leaves room for two models to be asked properly and
// still keeps one follow-up turn inside the budget.
const PLAIN_TURN_MS = 54000;
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
// How long the model may deliberate before it starts answering.
//
// Left unset, Gemini decides for itself, and on the questions this app asks it
// decides to spend a long time: measured on the real packing list, thinking
// freely took 28 seconds and searched nothing, while "low" took 18 and ran four
// searches. Every other model call in this app -- the tips, the wallet, the day
// insight, the preference reader -- already asks for "low" for exactly that
// reason. The chat route was the one that never did, which is why a proposal
// could take most of a minute to appear while the change itself saved instantly.
//
// The follow-up turns get the same, and deserve it more: rewording a proposal
// she has already made is not a problem that rewards deliberation.
const THINKING = "low";
// A turn that is only putting words to something already decided -- the sentence
// above a proposal, the sentence above a shortlist, the cards under an answer.
// There is no search to wait on and nothing to work out, so a ceiling of 34
// seconds bought nothing except a longer wait on the rare turn that hangs. What
// the family sees when this one is cut off is the card without the sentence,
// which is the same thing they saw before these turns existed.
const REWORD_TURN_MS = 20000;
// The second go at a turn that came back with nothing, or with a card and no
// words. Warmer than the 0.2 the first turn runs at, because a second sample at
// the same temperature from the same model is mostly the same answer; not so
// warm that the words wander from the record.
const RETRY_TEMPERATURE = 0.5;

// The last thing said when there is nothing to say. Named because two places
// need it: the sentence itself, and the flag that tells the screen this is the
// one reply worth offering a second go on.
const LOST_IT =
  "Something went wrong at my end and I lost that one. Ask me again.";

/**
 * Did this turn come back with nothing anybody can use?
 *
 * Words are an answer. A proposed change is an answer. A shortlist of places is
 * an answer. Asking to go and research is an answer. Offering follow-up
 * questions is not: it is what she says next to, and a turn whose entire output
 * is "here are three things you could ask me" has not answered the thing that
 * was asked.
 */
function answeredNothing(turn) {
  if (String(turn?.text || "").trim()) return false;
  const { calls: rest, places } = splitPlaceCalls(turn?.calls || []);
  if (places.length) return false;
  const { calls: noFollowups, reply } = splitFollowupCalls(rest);
  // The answer written inside offer_followups is an answer.
  if (wordsWithFollowups("", reply)) return false;
  const { calls: changes, asked: tip } = splitTipCalls(noFollowups);
  return !tip && !changes.length;
}

export async function POST(request) {
  // Where the request's own allowance starts. Read by every model turn below.
  const startedAt = Date.now();
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const pageTripId = payload?.tripId;
  // Which section of the trip the user was looking at, or "new_trip" when they
  // came from the trip builder screen. Whitelisted so it can only ever be one of ours.
  const pageFocus = isKnownFocus(payload?.focus) ? payload.focus : null;
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

  // Asked before anything else is done, and before anything is written down.
  //
  // The refusal itself was never in doubt -- lib/agent/llm.js checks this account's
  // consent row on every single call and will not send without it. But it checked
  // it at the end of a pipeline that first read the whole household, opened a
  // conversation and filed the question, so a tester who had just turned Aly off
  // watched a thinking indicator run for about thirty seconds before being told
  // she was off. That reads exactly like the thing they asked to stop, and it left
  // a conversation row and a question behind for an answer that was never going to
  // come. Asked here, the refusal is immediate and nothing is recorded.
  //
  // The check in llm.js stays where it is. This one is for the person waiting; that
  // one is the guarantee, and it covers every other path into the model.
  // Two different noes, said differently, because "Aly is turned off" sent to
  // somebody whose agreement simply went out of date sends them to a switch that
  // is already on.
  let consentRow, age;
  try {
    [consentRow, age] = await Promise.all([
      readConsent(supabase, user.id, { strict: true }),
      accountAge(supabase, user.id),
    ]);
  } catch {
    return NextResponse.json(chatPermissionError(null, { unavailable: true }), { status: 503 });
  }
  const permissionError = chatPermissionError(consentRow, age);
  if (permissionError) return NextResponse.json(permissionError, {
    status: age.unavailable ? 503 : 403,
  });

  // Everything that only needs the signed-in user, asked for at once.
  //
  // These four used to be four separate awaits, and the round trips added up in
  // front of the model rather than behind it: whoever is asking, their display
  // name, the whole app, and the list of other conversations are all knowable
  // the moment we know who is asking, and none of them needs any of the others.
  // A slow context makes a fast model look like a slow one, and this was the
  // cheapest part of that to fix.
  //
  // Whether this person may ask Aly to change things, or only to answer; and
  // Aly always sees the whole app -- a trip id only says which trip is open, so
  // it becomes the default target for anything the user does not pin elsewhere.
  // The conversation's own trip, not the page's. See conversationScope.js.
  const named =
    typeof payload?.conversationId === "string" ? payload.conversationId : null;
  const conversationRow = await readConversationScope(supabase, named).catch(
    () => null,
  );
  const scoped = scopeToConversation({
    conversation: conversationRow,
    tripId: pageTripId,
    focus: pageFocus,
  });
  const tripId = scoped.tripId;
  const focus = isKnownFocus(scoped.focus) ? scoped.focus : null;

  const [access, snapshot, conversationList] = await Promise.all([
    resolveAccess(supabase, user),
    loadEverything(supabase, user.id, tripId || null, said, focus),
    // Best effort, and asked for here rather than after the conversation is
    // opened because it does not depend on which conversation this is.
    listConversations(supabase, 20).catch(() => ({ conversations: [] })),
  ]);
  if (tripId && !snapshot.focusTripId) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }
  const ctx = snapshot;
  const threadTripId = snapshot.focusTripId || null;

  // Which conversation this belongs to. The client sends one it picked from the
  // list, or nothing at all, in which case a new one starts here and its id goes
  // back with the reply.
  const { id: conversationId, created: conversationCreated } =
    await ensureConversation(supabase, user.id, {
      conversationId: named,
      known: conversationRow,
      tripId: threadTripId,
      focus,
    });
  if (!conversationId) {
    return NextResponse.json(
      { error: "Could not open that conversation." },
      { status: 500 },
    );
  }

  // This conversation, and the lines in the others that this question touches.
  // Conversations are separate, but not sealed off from each other: Aly is told
  // what the others were about, and the words of this question are used to pull
  // the closest lines out of them. Both need the conversation id and neither
  // needs the other, so they go together. Best effort on the recall — a failure
  // there only costs her the cross-reference, so it must never cost the answer.
  const [{ messages: past }, recalled] = await Promise.all([
    loadThread(supabase, conversationId, CONTEXT_MESSAGES),
    recallOtherConversations(supabase, {
      message: said,
      exclude: conversationId,
    }).catch(() => ({ hits: [] })),
  ]);
  const extras = {
    others: (conversationList?.conversations || []).filter(
      (c) => c.id !== conversationId,
    ),
    recall: recalled?.hits || [],
  };

  // Where they are standing, if they chose to say. Nothing infers it: the button
  // and the typed override are the only two ways it arrives.
  const here = normalizeHere(payload?.here);
  // A pet's own name is often the only clue that a question is about an animal,
  // so the names on file go in with the message — and into the prompt, so the
  // new-trip questions can ask about the dog by name instead of in the abstract.
  const petNames = ctx.known?.pets ? Array.from(ctx.known.pets.values()) : [];
  // What changes from one question to the next -- today's date, where they
  // are, the notes ranked by this question, the other conversations -- rides on
  // the question itself rather than in the system prompt. See rightNowNote in
  // lib/agent/context.js: in front of the conversation it kept every earlier
  // turn out of the cache.
  const nowNote = rightNowNote({ ...extras, here, tail: ctx.tail });
  const system = buildSystemPrompt(ctx.text, focus, ctx.focusTripName, {
    ...extras,
    rightNow: "note",
    here,
    petNames,
    level: access?.level,
    travelerName: access?.travelerName,
    // The roster, so her opening line names whoever actually uses this account.
    people: ctx.travelerNames,
    // Whose blanks are being filled in, when that is what this screen is for.
    intervieweeName: ctx.intervieweeName,
  });
  // The record prints every id as a short handle (see shortenIds in the
  // context). Every tool call that comes back is turned into real ids here,
  // before anything reads, validates or saves it.
  const withIds = (out) =>
    out && Array.isArray(out.calls) && ctx.known?.alias?.size
      ? {
          ...out,
          calls: out.calls.map((call) => ({
            ...call,
            args: expandAliases(call.args, ctx.known.alias),
          })),
        }
      : out;
  // The consent check once for the whole request. Every model call used to make
  // it again -- the same two rows read three or four times a question -- and it
  // sits on the path before the first byte comes back.
  const consent = consentOnce();
  // Whether this turn is one question of an interview. Set when the screen asked
  // for a person's blanks and there is still a blank to fill.
  const interviewing = Boolean(ctx.interviewSlot && ctx.intervieweeId);
  // Not all 28 of them: the ones this screen and these words could plausibly
  // need. See lib/agent/toolset.js for why fewer is more accurate as well as
  // cheaper.
  const tools = toolsForRequest({
    focus,
    message: said,
    petNames,
    level: access?.level,
  });

  // The note is sent, never stored: the transcript keeps what was said, and the
  // next question carries its own.
  const messages = [
    ...toModelMessages(past),
    { role: "user", text: said, ...(nowNote ? { notes: [nowNote] } : {}) },
  ];

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
  //
  // Started here and awaited below, so the write travels alongside the model's
  // first turn instead of in front of it. It still has to land before the reply
  // goes back -- the transcript has to be in the order it was said -- but there
  // is no reason for the family to wait out a round trip twice.
  const questionWritten = alreadyAsked
    ? Promise.resolve(null)
    : appendMessage(supabase, {
        userId: user.id,
        conversationId,
        tripId: threadTripId,
        role: "user",
        body: said,
        askId,
      }).catch(() => null);

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
  // How much of the request went on building the trip's context before a model
  // was asked anything. It comes out of the same allowance as the answer, so a
  // slow context makes a fast model look like a slow one.
  const beforeMs = askedAt - startedAt;
  const firstBy =
    clock(lookUp ? GROUNDED_TURN_MS : PLAIN_TURN_MS) ||
    Date.now() + MIN_TURN_MS;
  const gaveMs = firstBy - Date.now();
  // Whether the call that produced the answer was grounded. The finishing turn
  // copies it so its request starts with the same tools and shares the cached
  // prefix; only the rescue, which drops the search to save time, turns it off.
  let answeredGrounded = lookUp;
  try {
    result = await generate({
      feature: "chat.answer",
      system,
      messages,
      tools,
      grounded: lookUp,
      thinking: THINKING,
      deadline: firstBy,
      consent,
    });
    result = withIds(result);
  } catch (first) {
    failed = first;
    // Out of time on a question that was searching the web. The search is the
    // slow half, so there is one more go without it: she answers from the trip
    // and from what she knows, and the app adds the line saying she did not get
    // to look, which it does for every unsearched answer already.
    const rescueBy = first?.timedOut && lookUp ? clock(RESCUE_TURN_MS) : null;
    if (rescueBy) {
      try {
        answeredGrounded = false;
        result = await generate({
          feature: "chat.rescue",
          system,
          messages,
          tools,
          grounded: false,
          thinking: THINKING,
          deadline: rescueBy,
          consent,
        });
        result = withIds(result);
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
    // The question has to be on the record even when the answer never came.
    await questionWritten;
    // Why it failed, kept where it can be looked up tomorrow.
    await recordRefusals(supabase, {
      userId: user.id,
      asked: said,
      wantedSearch: lookUp,
      searched: false,
      refusals: err?.refusals,
      turn: { gaveMs, beforeMs, grounded: lookUp },
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
      // Whatever the failure says it is. This used to turn 403 into 500, from a
      // time when nothing here answered 403 and the remap was harmless. It is
      // not harmless now: turning the AI off and then asking a question is
      // refused with a 403, the browser's fault watch files any own-origin
      // response of 500 or more, and every tester who tried it filed a fault
      // against a message the app meant to send them.
      { status },
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
        feature: "chat.recall",
        system: `${system}\n\n${recallSection(found, recallAsk)}`,
        messages,
        tools: tools.filter((tool) => tool.name !== "recall_lessons"),
        grounded: lookUp,
        // Drawn from the same allowance as everything else. When the first turn
        // has already spent it, her notes go unread rather than the whole
        // request being cut off with nothing written down.
        thinking: THINKING,
        deadline: extraBy,
        consent,
      });
      // Only take the second answer if there is one: a reply that came back empty
      // would throw away a perfectly good first attempt.
      if (second && (second.text || (second.calls || []).length))
        result = withIds(second);
    } catch {
      // Keep the first reply. Its text will not mention the notes, which is
      // a worse answer rather than a broken one.
    }
    result = {
      ...result,
      calls: splitRecallCalls(result.calls).calls,
    };
  }

  // One more go when the first turn came back with nothing anybody can use.
  //
  // This is the hole that produced "Something went wrong at my end and I lost
  // that one." Both of the retries further down are guarded on there being
  // something to improve -- a proposal to explain, or a shortlist to write over
  // -- so a turn that came back with no words, no change, no places and no
  // research request fell past both of them and out the bottom, where the only
  // thing left to say is that it broke. A model that answers a question about a
  // trip in two and a half seconds with a single follow-up call and no prose has
  // not refused anything; it has just not answered, and the cheapest fix is to
  // ask again.
  //
  // Asked of the same model again, one attempt, a little warmer. This used to
  // walk the ladder to a different model on the theory that the same model at
  // the same temperature produces the same nothing; the ledger showed what that
  // cost -- every silent turn went to the slower model next in line and paid its
  // full prompt again. A turn that came back with nothing is not a broken model,
  // it is a sample that landed on nothing, and the temperature is the knob for
  // that. A real error on the first turn still walks the ladder as before.
  //
  // Not for a plain question, though. An empty answer to one is exactly what the
  // finishing turn below already handles -- no words, so words are owed, and it
  // asks for them against the same request the answer just sent, so most of it
  // is read from the cache. Retrying first paid for that request in full and
  // then, when the retry came back thin, the finishing turn paid again: three
  // calls for one question. What the finishing turn cannot do is propose a
  // change, so anything that might be asking for one -- and the interview,
  // where the answer is usually something to save -- still gets the retry.
  const retryEmpty = retryWhenEmpty({ said, interviewing });
  if (
    retryEmpty &&
    answeredNothing(result) &&
    clock(lookUp ? EXTRA_TURN_MS : REWORD_TURN_MS)
  ) {
    const againBy = clock(lookUp ? EXTRA_TURN_MS : REWORD_TURN_MS);
    try {
      const again = await generate({
        feature: "chat.retry",
        system,
        messages,
        tools,
        grounded: lookUp,
        thinking: THINKING,
        deadline: againBy,
        models: result.model ? [result.model] : undefined,
        attempts: 1,
        temperature: RETRY_TEMPERATURE,
        consent,
      });
      // Only if it is actually an answer this time. Two empty turns leave the
      // first one standing, which changes nothing but costs nothing either.
      if (!answeredNothing(again)) {
        result = {
          ...withIds(again),
          // The first turn's refusals are still worth recording even though its
          // words are being thrown away: they are why this second turn happened.
          refusals: (result.refusals || []).concat(again.refusals || []),
        };
      }
    } catch {
      // Nothing to keep and nothing to lose. The sentence below still stands,
      // and now the screen offers a way to put the question again.
    }
  }

  // A shortlist of places is an answer, not a change, so it is taken out before
  // anything here treats a tool call as something to save.
  const {
    calls: withoutPlaces,
    places: shortlist,
    reply: cardWords,
  } = splitPlaceCalls(result.calls);
  // The words show_places brought with it. Taken before anything below decides
  // whether the turn owes words, so a shortlist that came with its answer is
  // not sent back for a second one. See wordsWithCards.
  if (cardWords && shortlist.length) {
    const own = saidNothing(result.text) ? "" : result.text;
    const chosen = wordsWithCards(own, cardWords, shortlist);
    if (chosen && chosen !== String(result.text || "").trim()) {
      result = { ...result, text: chosen };
    }
  }
  // The questions she offered next are neither a change nor part of the answer,
  // so they come out here too.
  let {
    calls: withoutFollowups,
    followups,
    reply: followupWords,
  } = splitFollowupCalls(withoutPlaces);
  // And the answer that came inside offer_followups, taken before anything
  // below decides the turn was silent. A turn that was only the buttons used to
  // pay a whole second call for its words. See wordsWithFollowups.
  if (followupWords) {
    const own = saidNothing(result.text) ? "" : result.text;
    const chosen = wordsWithFollowups(own, followupWords);
    if (chosen && chosen !== String(result.text || "").trim()) {
      result = { ...result, text: chosen };
    }
  }
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
  const wantsAdvice = asksAdvice(said);

  // The photographs, prices, maps and ratings for whatever the first turn
  // already named. Started now, so the lookups run while any finishing turn
  // below is still being written rather than after it.
  const floors = ratingFloors(ctx.preferences || []);
  const enriching = enrich(withPrograms(shortlist, ctx.rewards), {
    bias: bias(here),
  });

  // One finishing turn, where there used to be up to three in a row.
  //
  // The three things a first turn can leave undone are all the same debt seen
  // from different sides. Silence with nothing beside it -- no words and no
  // card, the turn the family sees as an empty reply, and in an interview the
  // worst one, because the question they were waiting for never arrived. A
  // change with a card and no words, when they had asked something: "What do
  // you recommend?" came back as a change to the trip's getting-around line and
  // nothing else, right answer and none of the answering; the thin version
  // ("Updated for you.") is caught alongside the silent one because it passes
  // any test for having spoken while saying nothing a person could weigh. Cards
  // with nothing worth reading above them -- the names read out again, or
  // nothing at all, when "Which of these should we add?" was a question asking
  // to be advised. And the reverse: real recommendations written out as a bold
  // list with nothing underneath to tap.
  //
  // Each used to be its own turn, each paying the whole prompt again, and a
  // turn that owed both words and cards paid twice. The prompts are the same
  // ones; they are handed over together now, and she settles the whole debt in
  // one go.
  const silent = saidNothing(result.text);
  const owesReasons =
    needsReasons(result.text, changeCalls) &&
    (asksSomething(said) || interviewing);
  const owesWords = needsWords(result.text, shortlistAll);
  const needWords = silent || owesReasons || owesWords;
  // Nothing proposed. A change she has just carried out reads like a
  // recommendation -- it names the place, the day and the time -- and cards for
  // somewhere they have already asked to add are noise sitting under a receipt.
  let needCards =
    needsCards(said, result.text, shortlistAll) && !changeCalls.length;
  // Places named in prose with nothing to tap: the lookup can usually card them
  // straight from the names, in the trip's own area, with no second model turn.
  // Only when it cannot vouch for at least two of them is the model asked.
  // See lib/places/named.js.
  let cardedHere = [];
  if (needCards) {
    cardedHere = await cardsFromReply({
      text: result.text,
      said,
      area: ctx.focusTripDestination,
      here,
    });
    if (cardedHere.length) {
      shortlistAll = mergePlaces(shortlistAll, cardedHere);
      needCards = false;
    }
  }
  if ((needWords || needCards) && clock(REWORD_TURN_MS)) {
    // Searching again is only worth waiting for if the first turn never got to
    // look, and only when words are owed. Where it did, its sources are already
    // on this answer and the second turn would spend ten seconds fetching the
    // same pages to say the same thing.
    const lookAgain = needWords && lookUp && !result.searched;
    const finishBy = clock(lookAgain ? EXTRA_TURN_MS : REWORD_TURN_MS);
    // The same grounding as the call that answered, so the request starts with
    // the same tools. Where searching again is not wanted, she is told so,
    // because the search tool being there is now a matter of the cache and not
    // an invitation. See lib/agent/finish.js.
    const finishGrounded = lookAgain || answeredGrounded;
    const mayCall = finishTools({
      silent,
      needCards,
      shortlistCount: shortlistAll.length,
    });
    try {
      const finished = await generate({
        feature: finishFeature({ silent, owesReasons, owesWords, needCards }),
        // The same system prompt as the answer, word for word. The finishing
        // instructions ride in a note after the last message instead, so the
        // whole request up to that note is the one that just answered and can
        // be read from the cache. See withFinishNote in lib/agent/finish.js.
        system,
        messages: withFinishNote(messages, [
          // What she proposed, handed back to her. The confirmation cards' own
          // summaries are built further down the route, so this turn was being
          // told "you already proposed something" without being told what.
          // Nothing to hand back when the turn proposed nothing.
          needWords && !owesWords
            ? changeCalls.length
              ? answerAsWell(said, gistOf(changeCalls), { advice: wantsAdvice })
              : "Your last turn came back empty. Answer what was just said, in words, and if the context hands you a question to ask, ask it."
            : "",
          // The interview's own version of the same debt: what she saved is on a
          // card, and the person is still sitting there waiting to be asked
          // something. The slot to ask about is in the context above.
          needWords && interviewing
            ? "You are getting to know somebody, and you have just saved what they told you. Say in one line what you took from it, then put the one question the context hands you next, in words. Do not describe the card."
            : "",
          owesWords ? writeTheWords(said, shortlistAll) : "",
          needCards ? showThePlaces(said, result.text) : "",
          finishGrounded && !lookAgain
            ? "Do not search the web on this turn. What the answer needed from the web is already in it."
            : "",
          callsLine(mayCall),
        ]),
        // The first turn's tools, all of them, its grounding, and no narrowed
        // tool config: any of those differing from the answer's request made
        // the finish a cache miss. What she may call -- show_places when cards
        // are owed or there is no shortlist yet, nothing otherwise -- is said
        // in the note and enforced below, where every other call is dropped.
        // Asked the same trip twice, a model does not repeat itself exactly --
        // it offers "Quinta da Regaleira" and then "Quinta da Regaleira Guided
        // Tour" -- so a second set of places would put one on two cards; change
        // tools are dropped so what she proposed cannot be proposed twice, and
        // offer_followups because a model asked for words can answer by
        // calling it and writing nothing.
        tools,
        grounded: finishGrounded,
        thinking: THINKING,
        deadline: finishBy,
        // The same model that just answered, one attempt, a little warmer. See
        // the retry above for why this no longer walks to a different model.
        models: result.model ? [result.model] : undefined,
        attempts: 1,
        temperature: RETRY_TEMPERATURE,
        consent,
      });
      const finish = withIds(finished);
      // Only the calls it was allowed. The request no longer narrows them, so
      // this is the lock: anything outside mayCall is dropped here, and it is
      // what the tests hold the route to.
      const { places: named } = splitPlaceCalls(
        (finish?.calls || []).filter((call) => mayCall.includes(call?.name)),
      );
      // Words are taken only when there are some, and -- where the debt was a
      // roll call of the cards -- only when they are not the same roll call
      // again. Thin words above the cards beat no words above the cards. Where
      // the first turn's words were fine and only cards were owed, they stand:
      // anything written on this turn is a second copy of what they have read.
      const betterText =
        needWords && finish?.text && !(owesWords && needsWords(finish.text, shortlistAll))
          ? finish.text
          : null;
      if (betterText || named.length) {
        if (named.length) shortlistAll = mergePlaces(shortlistAll, named);
        result = {
          ...result,
          text: betterText || result.text,
          searched: result.searched || finish.searched,
          sources: (result.sources || []).concat(finish.sources || []),
          refusals: (result.refusals || []).concat(finish.refusals || []),
        };
      }
    } catch {
      // Whatever the first turn produced still stands: the change without its
      // words, the cards under a thin line, or the names with no cards. The
      // same answer they got before, and no worse for having tried.
    }
  }

  // A perk is only shown when it is theirs. A model asked about hotels will
  // offer Hilton Honors breakfast to somebody with no Hilton account, and a perk
  // that turns out not to exist is worse than none, because it was a reason to
  // book. So every program named is checked against the family's own rows here,
  // once, after the shortlist has finished being assembled. Places the first
  // turn named were looked up while the finishing turn ran; only the ones it
  // added are looked up now.
  // The floors are checked here and not by the model, because the model does
  // not know the ratings: it picks the names, Google answers with the number,
  // and only then can anybody tell whether a card clears the 4.5 the family
  // asked for.
  //
  // And they are enforced, not annotated. Printing "below the 4.5 you asked
  // for" on a 4.3 hotel was the first go at this and Mark was right to come
  // back about it: the hotel was still on his screen, in a shortlist he had
  // asked to be above a number. So a card under the floor comes out, and the
  // reply says which ones went and what Google gave them -- a name that
  // disappears silently is a filter nobody can argue with.
  const firstNames = new Set(shortlist.map((p) => p?.name).filter(Boolean));
  // Cards built from the reply's own names were looked up already.
  const looked = new Set(cardedHere.map((p) => p.name));
  const added = shortlistAll.filter(
    (p) => !firstNames.has(p?.name) && !looked.has(p?.name),
  );
  const enrichedFirst = await enriching;
  const enrichedAdded = added.length
    ? await enrich(withPrograms(added, ctx.rewards), { bias: bias(here) })
    : [];
  const carded = cardedHere.map(({ looked: _looked, ...place }) => place);
  const { places, dropped: belowFloor } = applyFloors(
    withRatingFloor(
      withDistance(
        mergePlaces(mergePlaces(enrichedFirst, enrichedAdded), carded),
        here,
      ),
      floors,
    ),
    floors,
  );
  const floorNote = floorDropLine(belowFloor, {
    kept: places,
    fallback: rentalFallback(ctx.preferences || []),
  });

  // A save made in an interview with no blank named on it. The model is told to
  // name one and leaves it off often enough that four answers in a row settled
  // nothing: the rows were written, the ledger stayed at 11%, and Aly asked the
  // same things again. The handed blank is not the answer -- the question she
  // actually asked is not always the blank she was handed -- so the words of the
  // save decide, and a save whose words are unclear is left alone.
  if (interviewing) {
    for (const call of changeCalls) {
      const a = call?.args;
      // A slot id that is not on the list counts as missing. The model handed back
      // "comfort" -- a blank retired when the list was cut to ten -- which the
      // cleaner drops, so the row was written with no blank on it and nothing
      // settled.
      if (!a) continue;
      if (a.slot && SLOT_BY_ID.has(a.slot)) continue;
      if (
        call.name !== "add_preference" &&
        call.name !== "record_household_fact"
      )
        continue;
      const guess = slotFromWords(`${a.body || ""} ${a.reason || ""}`);
      if (guess) a.slot = guess;
    }
  }

  const proposed = [];
  const problems = [];
  // Refusals the family has to hear even when the rest of the reply worked.
  // An ordinary problem only surfaces when there is nothing else to say, which
  // is right for "I could not tell which trip you meant" and wrong for a rule:
  // if Aly has just written "and I will start the packing list" and the app
  // will not, the sentence and the screen have to agree.
  const tells = [];
  // A trip being created in this same turn has no id yet, so the itinerary and
  // packing rows that came with it are filed against its name instead.
  const pendingTrips = pendingTripNames(changeCalls);
  const pendingStatuses = pendingTripStatuses(changeCalls);
  const pendingTemplates = pendingTemplateNames(changeCalls);
  for (const call of changeCalls) {
    const { action, error, tell } = validateAction(call, {
      travelerNames: ctx.travelerNames,
      travelerIds: ctx.travelerIds,
      known: ctx.known,
      focusTripId: ctx.focusTripId,
      pendingTrips,
      pendingTemplates,
      pendingTripStatuses: pendingStatuses,
      newTripDraft: focus === NEW_TRIP_FOCUS,
      loggedTrip: focus === LOG_TRIP_FOCUS,
    });
    if (action) proposed.push(action);
    else if (error) {
      problems.push(error);
      if (tell) tells.push(error);
    }
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
          .gte("item_date", homeToday())
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

  // A tool call typed out as prose is not words. It reached the screen once as
  // the whole of an interview question, so it is cleared here as well as retried
  // above: everything below treats an empty reply properly and nothing below
  // would recognise this.
  let reply = saidNothing(result.text) ? "" : tidyAnswer(result.text);
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
      turn: { gaveMs, beforeMs, grounded: lookUp },
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
  // A card and no words, after the retry above also came back with nothing. Rare
  // now, but it has to say something: a proposal sitting alone under a question
  // reads as an answer that was never given, and there is no way for the family
  // to tell a considered call from a failure.
  if (!reply && actions.length && (asksSomething(said) || interviewing))
    reply = wordlessLine();
  if (!reply && actions.length === 0 && places.length === 0) {
    reply = problems.length ? Array.from(new Set(problems)).join(" ") : LOST_IT;
  }

  if (tells.length) {
    const unsaid = Array.from(new Set(tells)).filter(
      (t) => !(reply || "").includes(t),
    );
    if (unsaid.length) reply = [reply, ...unsaid].filter(Boolean).join("\n\n");
  }

  // What Aly proposed matters as much as what she said, so the transcript keeps
  // the proposal alongside the reply.
  // The floor's own sentence rides with the answer rather than replacing it:
  // Aly has written about the places she found, and this says what happened to
  // the ones the family's number ruled out.
  const spoken = [reply || (places.length ? placesLine(places) : ""), floorNote]
    .filter(Boolean)
    .join("\n\n");
  const record = actions.length
    ? [spoken, `(Proposed: ${actions.map((a) => a.summary).join("; ")})`]
        .filter(Boolean)
        .join("\n\n")
    : spoken;
  // The interview's own bookkeeping, and the app's rather than hers. She was
  // handed one blank at the top of this turn; if she came back with words, that
  // question was put, and the count and the wording are written here so a later
  // conversation neither repeats it nor asks it in the same sentence. Doing it
  // from the reply is what stopped the question disappearing into a tool
  // argument and leaving the family a card with nothing to answer.
  // A question mark rather than merely words: some turns save an answer and say
  // only "so the afternoon is yours", which is a sentence but not a question, and
  // writing it down as the question asked would retire a blank nobody was asked
  // about.
  if (ctx.interviewSlot && ctx.intervieweeId && (reply || "").includes("?")) {
    await noteAsked(supabase, {
      familyId: access.familyId,
      travelerId: ctx.intervieweeId,
      slot: ctx.interviewSlot,
      question: reply,
      userId: user.id,
    }).catch(() => null);
  }

  // An interview answer about the animals lands on the animal, not in a fact, so
  // the ledger would read the blank as never asked and Aly would ask about the
  // horse again on the very next turn.
  if (interviewing && ctx.intervieweeId) {
    const aboutAnimals = (proposed || []).some(
      (a) =>
        a?.tool === "add_pet" ||
        a?.tool === "update_pet" ||
        a?.tool === "set_pet_trip",
    );
    if (aboutAnimals) {
      await markSettled(supabase, {
        familyId: access.familyId,
        travelerId: ctx.intervieweeId,
        slot: "animals",
        userId: user.id,
      }).catch(() => null);
    }
  }

  if (record) {
    // The question first, always: a transcript that reads answer-then-question
    // is worse than a slow one.
    await questionWritten;
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
    // Whether the screen should offer to put the question again.
    //
    // Set only on the one reply that asks to be asked again. Every other answer
    // here is an answer -- a refusal, a proposal, a shortlist, a complaint about
    // what was asked -- and offering a retry on those invites the family to ask
    // twice for something that already happened. Without this the sentence
    // "Ask me again" arrived with no way to, because the request succeeded and
    // the panel only offers a retry when it fails.
    retryable: reply === LOST_IT,
    conversationId,
    // Whether this message opened the conversation or joined one already going.
    // The panel needs to know: a thread it did not manage to resume is older
    // than the screen it is on, and the rest of it has to be read back rather
    // than assumed to be absent.
    conversationCreated,
    sources: result.sources || [],
    places,
    followups,
    // What the screen should go and do once the reply is on screen.
    look,
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
