"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AlyeskaMark from "./AlyeskaMark";
import { groupActions } from "@/lib/agent/groups";
import {
  applyLabel,
  chosenActions,
  forgetGroup,
  locked,
  nothingChosen,
  pickable,
  tickKey,
  toggle,
} from "@/lib/agent/picking";
import PlaceCards, {
  addRequest,
  alternativesRequest,
  asksForPlaces,
  findMoreRequest,
  moreRequest,
} from "./PlaceCards";
import WhereIAm, { readStored } from "./WhereIAm";
import { runLook } from "@/lib/tips/run";
import { foundLine } from "@/lib/tips/ask";
import TripArtifact from "./TripArtifact";
import { buildArtifact } from "@/lib/trips/artifact";
import { receiptTone, receiptLabel } from "@/lib/agent/receipt";
import Thinking from "./Thinking";
import RichText from "./RichText";
import { askPlaceholder } from "@/lib/agent/placeholders";
import Followups from "./Followups";

// What a receipt looks like once it has earned its colour. Amber is the honest
// answer for a card where some of it landed and some of it did not: neither the
// green that says "done" nor the red that says "nothing happened".
const RECEIPT_TONE = {
  saved: "bg-teal-soft text-teal",
  mixed: "border border-amber/60 bg-amber/15 text-ink",
  failed: "border border-rose/60 bg-rose/10 text-ink",
};

// Prompts follow whichever section the user was looking at.
const SUGGESTIONS = {
  itinerary: [
    "What's on the schedule the first day?",
    "What still needs to be booked?",
    "Add dinner Thursday at 7",
  ],
  packing: [
    "What's left to pack for Veda?",
    "Add sunscreen and bug spray for everyone",
    "I packed the swimsuits",
  ],
  tasks: [
    "What still isn't done?",
    "Remind me to do online check-in the day before we fly",
    "Add a task to refill prescriptions a week before",
  ],
  notes: [
    "What notes do we have?",
    "Save a note that Veda wants Space Mountain first",
  ],
  // Opened on the trip builder screen. Each of these is deliberately partial —
  // one names a place with no dates, one names a time with no place, one is a
  // whole trip in a sentence. Between them they say the thing the screen is
  // trying to say, which is that you do not need to have decided anything yet.
  new_trip: [
    "A week somewhere warm over spring break",
    "The big island of Hawaii, sometime next spring, to see the volcanoes",
    "Somewhere we can drive to in a day, over a long weekend",
  ],
  // Opened from the Wallet tab.
  rewards: [
    "What are our points worth right now?",
    "Which card should I book the Alaska hotel on?",
    "I have 68,000 Marriott points",
  ],
  // No trip open: Aly works across all of them.
  general: [
    "Which trip is next and how far away is it?",
    "How is packing coming along across our trips?",
    "Start a new trip for Italy in spring 2028",
  ],
};

const SECTION_LABELS = {
  itinerary: "Itinerary",
  packing: "Packing",
  tasks: "Tasks",
  notes: "Notes",
};

// A dead gateway or a killed function answers with HTML, or with nothing at
// all, so reading it as JSON throws and the real story is lost. This keeps the
// status and turns it into something true.
async function readReply(res) {
  const body = await res.text();
  let data = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    /* not JSON: a gateway or proxy answered, not our route */
  }
  if (data && typeof data === "object") return data;
  if (res.status === 504 || res.status === 502 || res.status === 503) {
    return {
      error:
        "That took too long to finish. Try it in two smaller pieces — a long list is easier in halves.",
    };
  }
  if (res.status === 413) {
    return { error: "That was too much to send at once. Try it in halves." };
  }
  return {
    error: res.ok
      ? "I could not read the answer that came back. Try that again."
      : `Something went wrong on the way back (${res.status}). Try that again.`,
  };
}

// Where a looked-up answer came from. Shown quietly under the reply rather than
// woven into it: the family should be able to check a restaurant recommendation
// without the answer reading like a bibliography.
//
// Somewhere to go once a change has been saved. A receipt that only says
// "Saved 3 changes" makes the family go and find the thing they just asked for,
// so every applied batch offers the screen its result is actually on.
function ReceiptLinks({ links, onGo }) {
  if (!links?.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {links.map((l) => (
        <button
          key={l.href}
          type="button"
          onClick={() => onGo(l.href)}
          className="rounded-full border border-teal/25 bg-white/80 px-2.5 py-1 text-xs font-semibold text-teal transition hover:bg-white"
        >
          {l.label} →
        </button>
      ))}
    </div>
  );
}

// The links are Google's redirects, which is what they ask you to link to, and
// they stop working after about a month - so an old conversation keeps the names
// of the sites and loses the ability to open them, which is the right way round.
function MessageSources({ sources }) {
  if (!Array.isArray(sources) || !sources.length) return null;
  return (
    <span className="mt-2 block border-t border-ink-faint/25 pt-2 text-xs text-ink-soft">
      <span className="mr-1">Looked up:</span>
      {sources.map((source, i) => (
        <span key={`${source?.url || i}`}>
          {i > 0 ? <span aria-hidden="true"> · </span> : null}
          <a
            href={source?.url || "#"}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-ink-faint underline-offset-2 hover:text-teal"
          >
            {shortSource(source?.title)}
          </a>
        </span>
      ))}
    </span>
  );
}

// Google hands back either a bare domain or a page title. A long title in a row
// of links is unreadable, so it is cut at the first sensible break.
function shortSource(title) {
  const text = String(title || "").trim();
  if (!text) return "source";
  if (text.length <= 28) return text;
  return `${text.slice(0, 27).trimEnd()}\u2026`;
}

// Two labels that would read as the same line. Used to keep the trip's name out
// of the panel's subheading when it is already the heading.
function sameThing(a, b) {
  const left = String(a || "")
    .trim()
    .toLowerCase();
  const right = String(b || "")
    .trim()
    .toLowerCase();
  return Boolean(left) && left === right;
}

export default function ChatPanel({
  trip,
  onApplied,
  onClose,
  onBack,
  focus,
  seed,
  autoSendSeed = false,
  // The conversation being read. Null means a new one, which has no id until the
  // first reply comes back and tells us what it was filed as.
  conversationId = null,
  conversationTitle = null,
  conversationTripName = null,
  onConversationStarted,
  fill = false,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Progress while she is off researching. Separate from busy because the
  // question has already been answered by then — what is still running is the
  // looking, and the difference matters to whoever is reading the panel.
  const [looking, setLooking] = useState("");
  // Proposals are held as chunks: one per part of the app they touch, each
  // approved on its own. See lib/agent/groups.js.
  const [pending, setPending] = useState(null); // { groups: [...] }
  // Where they are standing, when they have said so. Read back from the session
  // so closing the drawer in a taxi does not mean saying it again.
  const [here, setHere] = useState(null);
  const [applyingKey, setApplyingKey] = useState(null);
  // Lines the family has turned off, by chunk. Everything arrives ticked, so
  // this stays empty until somebody says otherwise.
  const [skipped, setSkipped] = useState(() => new Set());
  const applying = applyingKey !== null;
  const [packingBusy, setPackingBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  // What this conversation has actually written, in the order it was written.
  // The strip above the messages is derived from these plus whatever is on the
  // cards, so there is no second copy of the trip to fall out of step with them.
  const [savedActions, setSavedActions] = useState([]);
  // The generated packing list, which is built on the server and so has no card
  // and no rows to show. One line saying it happened.
  const [packingNote, setPackingNote] = useState("");
  const [error, setError] = useState("");
  // The question to put again, when the last one never reached the model. Held
  // separately from the error text because most errors are not retryable: a
  // refusal, a problem with what was asked, or a save that may have half landed
  // are all answers, and offering "try again" on them invites the family to ask
  // twice for something that already happened.
  const [retryAsk, setRetryAsk] = useState(null);
  // Only the two screens that build a trip out of a conversation show it. Inside
  // an existing trip the page behind the panel already IS the artifact, and a
  // second copy over the top would be one more thing to keep in step.
  const buildingTrip = focus === "new_trip" || focus === "log_trip";
  const artifact = useMemo(
    () =>
      buildingTrip
        ? buildArtifact(
            savedActions,
            (pending?.groups || []).flatMap((g) => g.actions),
          )
        : null,
    [buildingTrip, savedActions, pending],
  );
  // Every place shown so far, and which message holds the newest set. Both are
  // read off the thread rather than kept in state, so a conversation read back
  // from the database behaves the same as one that happened on this screen.
  const shownPlaces = useMemo(
    () => messages.flatMap((m) => (Array.isArray(m.places) ? m.places : [])),
    [messages],
  );
  // The newest set of cards, and only when the question underneath it was asking
  // to be shown places. "What should we book first" answers with hotels, so
  // cards appear under it -- and a second helping there is an answer to a
  // question nobody asked, because what they wanted was the order to book the
  // ones they already have.
  const lastPlaces = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (!messages[i]?.places?.length) continue;
      let asked = "";
      for (let j = i; j >= 0; j -= 1) {
        if (messages[j]?.role === "user") {
          asked = messages[j].text || "";
          break;
        }
      }
      return asksForPlaces(asked) ? i : -1;
    }
    return -1;
  }, [messages]);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  // The request in flight, so the Stop offered after five seconds does something
  // rather than merely hiding the fact that it is still going.
  const askRef = useRef(null);
  const tripId = trip?.id || null;
  const router = useRouter();
  // Held in a ref as well as a prop because a brand-new conversation gets its id
  // mid-flight, and the very next request — approving a card, say — has to be
  // filed against it rather than starting a second one.
  const conversationRef = useRef(conversationId);
  useEffect(() => {
    conversationRef.current = conversationId;
  }, [conversationId]);
  // Read after mounting rather than during, because the server has no session
  // storage and rendering from it would not match.
  useEffect(() => {
    setHere(readStored());
  }, []);
  // Held in a ref as well, so a message sent the instant after the button is
  // pressed still carries the position.
  const hereRef = useRef(null);
  useEffect(() => {
    hereRef.current = here;
  }, [here]);
  // A conversation that started here is already on screen. Remembering that it
  // was ours stops the id arriving from the server from reading the whole thing
  // back and throwing away what is already there.
  const startedHereRef = useRef(null);

  // Conversations live in the database, so picking one from the list reads back
  // exactly what was said — same on a phone as on a laptop.
  useEffect(() => {
    let alive = true;
    if (conversationId && conversationId === startedHereRef.current) {
      setLoadingHistory(false);
      return () => {
        alive = false;
      };
    }
    setMessages([]);
    setPending(null);
    if (!conversationId) {
      setLoadingHistory(false);
      return () => {
        alive = false;
      };
    }
    setLoadingHistory(true);
    fetch(
      `/api/chat/history?conversationId=${encodeURIComponent(conversationId)}`,
    )
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data) => {
        if (!alive) return;
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingHistory(false);
      });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  // Where the panel jumps when something new lands.
  //
  // It used to jump to the bottom of the panel every time, which is right for a
  // question you just asked and wrong for an answer: a long answer from Aly
  // arrived with the family staring at its last sentence, having to scroll back
  // up to find where it started. So a new answer is pinned to its own first
  // line instead -- her answers get read from the top like anything else -- and
  // everything else still goes to the bottom, because your own question, the
  // thinking line, and a receipt saying what just saved are all things you want
  // to see the end of.
  const answerRef = useRef(null);
  const seenAnswers = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const answers = messages.filter(
      (m) => m.role === "assistant" && m.kind !== "receipt",
    ).length;
    // A saved thread arriving all at once is not an answer landing: reopening a
    // conversation should show you where you left off, at the end of it.
    const landed = !loadingHistory && answers > seenAnswers.current;
    seenAnswers.current = answers;
    const node = answerRef.current;
    if (landed && node) {
      // Measured rather than read off offsetTop, which is relative to whichever
      // ancestor happens to be positioned and not to the box that scrolls.
      const top =
        el.scrollTop +
        node.getBoundingClientRect().top -
        el.getBoundingClientRect().top -
        12;
      el.scrollTop = Math.max(0, top);
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, pending, busy, loadingHistory]);

  // Opened with an opening message already written. It waits for the saved
  // thread to arrive first, because that fetch replaces the whole message list
  // and would otherwise swallow the message we just sent. Once per opening: the
  // panel is unmounted when the drawer closes, so the guard resets on its own.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seed || loadingHistory || seededRef.current) return;
    seededRef.current = true;
    if (autoSendSeed) {
      send(seed);
    } else {
      setInput(seed);
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, autoSendSeed, loadingHistory]);

  // The message box grows with what is in it, between a floor and a ceiling set
  // in CSS below: three lines tall even when empty, so it reads as somewhere you
  // can paste a list, and never taller than a third of the panel.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  async function send(text, { again = false } = {}) {
    const clean = text.trim();
    if (!clean || busy) return;

    setError("");
    setRetryAsk(null);
    setPending(null);
    // On a retry the question is already the last thing in the thread, on the
    // screen and in the database. Adding it again would show the family asking
    // twice when they pressed one button.
    if (!again) {
      setInput("");
      setMessages((m) => [...m, { role: "user", text: clean }]);
    }
    setBusy(true);

    const control = new AbortController();
    // One id for this press, written on the question and on everything answered
    // on the back of it. One question came back as two answers on screen and the
    // rows kept no record of which press each belonged to, so afterwards there
    // was no telling that from two questions asked.
    const askId =
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random()}`.slice(0, 36);
    askRef.current = { control, asked: clean, stopped: false, askId };

    try {
      // Only the new message goes up; the server reads the rest of the thread
      // from the database.
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: control.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          focus,
          message: clean,
          conversationId: conversationRef.current,
          // So the route does not write the question down a second time.
          retry: again || undefined,
          askId,
          // Only ever what they chose to share, and only for this question.
          here: hereRef.current || undefined,
        }),
      });
      const data = await readReply(res);

      // A new conversation is filed by the server on the first message, so the
      // rest of this one goes to the same place.
      if (data?.conversationId && !conversationRef.current) {
        conversationRef.current = data.conversationId;
        startedHereRef.current = data.conversationId;
        onConversationStarted?.(data.conversationId);
      }

      if (!res.ok) {
        setError(data?.error || "The assistant is unavailable right now.");
        // Nothing was answered, so the question is still worth asking. Almost
        // every failure here is a model that was busy or slow, which is exactly
        // the kind that comes good on a second go.
        setRetryAsk(clean);
        setBusy(false);
        return;
      }

      // Cards with no words are still an answer. Keying this on the reply alone
      // meant a card-only answer landed nowhere until the screen was reloaded.
      if (data.reply || data.places?.length) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: data.reply || "",
            sources: data.sources?.length ? data.sources : undefined,
            places: data.places?.length ? data.places : undefined,
            followups: data.followups?.length ? data.followups : undefined,
            // Kept with the message so changing position later does not put new
            // directions on an old answer.
            here: hereRef.current || undefined,
          },
        ]);
      }
      if (data.actions?.length) {
        setPending({ groups: groupActions(data.actions) });
      } else if (!data.reply && !data.places?.length) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "I could not work out a change for that.",
          },
        ]);
      }
      if (data.problems?.length && !data.reply) {
        setError(data.problems.join(" "));
      }
      // She asked to go and look. The reply above already said she was going to,
      // so this is the part that actually happens: the same loop the button
      // drives, with the panel standing in for the button's progress line.
      if (data.look) {
        await carryOut(data.look, askId);
      }
    } catch (err) {
      // Stopping it yourself is not a failure, and should not be reported as one.
      // The question stays in the box so pressing Stop costs a wait and not the
      // sentence you typed.
      if (err?.name === "AbortError" || askRef.current?.stopped) {
        // The browser stopped listening; the route did not stop working, and it
        // writes her answer down whether or not anyone is waiting for it. Saying
        // otherwise would be a lie the transcript then contradicts.
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "Stopped waiting. If she had already finished, her answer will be here the next time you open this conversation.",
          },
        ]);
        // Asked again rather than retyped, and marked as a retry so the question
        // is not written into the thread a second time.
        setRetryAsk(clean);
      } else {
        setError("I could not reach the app just then. Check your signal.");
        setRetryAsk(clean);
      }
    }
    askRef.current = null;
    setBusy(false);
  }

  /** Called by the waiting line's Stop. Abandons the answer, keeps the question. */
  function stopAsking() {
    const live = askRef.current;
    if (!live) return;
    live.stopped = true;
    live.control.abort();
  }

  // Aly's own look, run from here for the same reason the button's is: one
  // grounded question uses most of a route's sixty seconds, and walking a trip
  // takes five. Whatever it finds is saved as it goes, so closing the drawer
  // halfway costs the rest of the look and nothing that was already found.
  async function carryOut(look, askId = null) {
    setLooking("Looking…");
    const { found, error } = await runLook({
      tripId: look.tripId,
      steps: look.steps,
      onNote: setLooking,
    });
    setLooking("");
    const said = error
      ? found
        ? `${foundLine(found, look)} I stopped early though — ${error}`
        : `I could not finish looking. ${error}`
      : foundLine(found, look);
    setMessages((m) => [...m, { role: "assistant", text: said }]);
    // And written down, because this line only ever existed in the browser. It
    // arrives under her answer some seconds later -- which is what "one
    // question, two responses" looks like -- and was gone the next time the
    // conversation was opened. A transcript that loses half of what was read is
    // worse than one that never showed it.
    const conversationId = conversationRef.current;
    if (conversationId) {
      fetch("/api/chat/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, body: said, askId }),
      }).catch(() => {
        // It is on screen either way. Saying it could not be filed would be a
        // second interruption about the app rather than about the trip.
      });
    }
    // The tips are rows on the page behind this drawer, so the page has to be
    // told. Without this they appear on the next navigation and look late.
    if (found) router.refresh();
  }

  // One chunk at a time. Everything else stays on screen, still pending, so a
  // long paste can be approved in the order the family cares about.
  async function apply(group) {
    if (!pending || applying || !group?.actions?.length) return;
    // Only the lines still ticked go up. Everything the family turned off is
    // dropped with the chunk, never saved and never mentioned again.
    const sending = chosenActions(group, skipped);
    if (!sending.length) return;
    setApplyingKey(group.key);
    setError("");
    try {
      const res = await fetch("/api/chat/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          actions: sending,
          conversationId: conversationRef.current,
        }),
      });
      const data = await readReply(res);

      if (!res.ok) {
        setError(data?.error || "Could not save those changes.");
        setApplyingKey(null);
        return;
      }

      // The server writes the receipt into the thread and hands it back, so the
      // screen and the stored conversation always say the same thing.
      const failed = (data.results || []).filter((r) => !r.ok);
      const okCount = data.applied || 0;
      const fallback =
        (okCount > 0
          ? `Saved ${okCount} change${okCount === 1 ? "" : "s"}.`
          : "Nothing was saved.") +
        (failed.length
          ? ` ${failed.length} failed: ${failed
              .map((f) => f.error || f.summary)
              .join("; ")}`
          : "");

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.receipt || fallback,
          kind: "receipt",
          // Green is a claim that the change landed, so it is worked out from
          // the counts the server sent rather than given to every receipt.
          tone: receiptTone({ applied: okCount, failed: failed.length }),
          links: data.links || [],
        },
      ]);
      // The strip above the conversation follows what the family approved, so a
      // change that failed on the server must not be shown as though it had
      // landed. Results come back in the order the actions went up.
      if (okCount > 0) {
        const results = data.results || [];
        setSavedActions((prev) => [
          ...prev,
          ...sending.filter((a, i) =>
            results[i] ? results[i].ok !== false : true,
          ),
        ]);
      }

      // Drop just the chunk that went through; keep the rest waiting.
      setPending((p) => {
        const left = (p?.groups || []).filter((g) => g.key !== group.key);
        return left.length ? { groups: left } : null;
      });
      setSkipped((prev) => forgetGroup(prev, group));
      // The trip this panel belongs to is gone, so refreshing would re-render a
      // page for a trip that no longer exists and land on a 404. Replace rather
      // than push: going Back should not return to a trip that was deleted.
      if (tripId && (data.deletedTripIds || []).includes(tripId)) {
        router.replace("/trips");
        // The trips list was rendered before the trip was deleted, and moving to
        // it reuses what the router already has, so the trip they just deleted
        // is still sitting there until something says otherwise. This is the one
        // place the refresh cannot wait for the drawer to close: the page being
        // left is gone, so there is no conversation left to protect.
        router.refresh();
        setApplyingKey(null);
        return;
      }

      onApplied?.();

      // A new trip starts with the family base template so it is never empty,
      // then the real list is worked out from past trips, the destination and
      // the time of year. That takes a model call, so it happens after the save
      // rather than inside it.
      if (data.packingTripId) await workOutPackingList(data.packingTripId);
    } catch {
      setError("Network hiccup while saving. Nothing may have been applied.");
    }
    setApplyingKey(null);
  }

  // Best effort by design: the trip already has a usable list, so anything that
  // goes wrong here is worth nothing more than silence.
  async function workOutPackingList(newTripId) {
    setPackingBusy(true);
    try {
      const res = await fetch("/api/packing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: newTripId,
          replace: true,
          conversationId: conversationRef.current,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.receipt) {
        setPackingNote(data.receipt);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            kind: "receipt",
            text: data.receipt,
            tone: receiptTone({ text: data.receipt }),
          },
        ]);
        onApplied?.();
      }
    } catch {
      // The base template is already saved, so there is nothing to report.
    }
    setPackingBusy(false);
  }

  function dismissGroup(key) {
    if (applying) return;
    setPending((p) => {
      const left = (p?.groups || []).filter((g) => g.key !== key);
      return left.length ? { groups: left } : null;
    });
    setSkipped((prev) => forgetGroup(prev, { key }));
  }

  return (
    <section
      className={
        fill
          ? "flex h-full min-h-0 flex-col overflow-hidden bg-white"
          : "card flex h-[32rem] flex-col overflow-hidden"
      }
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to your conversations"
              title="Your conversations"
              className="-ml-1 shrink-0 rounded-full p-1.5 text-ink-soft transition hover:bg-sand hover:text-ink"
            >
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M11.5 5 6.5 10l5 5" />
              </svg>
            </button>
          ) : null}
          <AlyeskaMark className="h-7 w-7 shrink-0 text-teal" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold leading-none">
              {conversationTitle || "Ask Aly"}
            </h2>
            <p className="mt-1 truncate text-xs text-ink-soft">
              {conversationId
                ? // The trip is the heading on a resumed trip thread, so saying
                  // it again underneath would only push the section out of view.
                  sameThing(
                    conversationTitle,
                    conversationTripName || trip?.name,
                  )
                  ? "Carrying on"
                  : conversationTripName || (trip ? trip.name : "All trips")
                : focus === "log_trip"
                  ? "A trip you have taken"
                  : focus === "new_trip"
                    ? "A new trip"
                    : focus === "rewards"
                      ? "Points, miles and cards"
                      : conversationTripName || trip?.name
                        ? `New conversation · ${conversationTripName || trip.name}`
                        : "New conversation"}
              {trip && SECTION_LABELS[focus]
                ? ` · ${SECTION_LABELS[focus]}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the assistant"
              className="rounded-full p-1.5 text-ink-soft transition hover:bg-sand hover:text-ink"
            >
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M5 5l10 10M15 5 5 15" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {/* The trip as it stands, pinned so it is still there four exchanges
            later. Nothing renders until there is something in it. */}
        {buildingTrip && (
          <TripArtifact
            artifact={artifact}
            logged={focus === "log_trip"}
            packingNote={packingNote}
          />
        )}
        {messages.length === 0 && !busy && !loadingHistory && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              {trip ? (
                <>
                  Aly is working on{" "}
                  <span className="font-semibold text-ink">{trip.name}</span>
                  {SECTION_LABELS[focus]
                    ? `, and assumes you mean the ${SECTION_LABELS[focus].toLowerCase()} unless you say otherwise.`
                    : "."}
                </>
              ) : focus === "rewards" ? (
                <>
                  Aly can see{" "}
                  <span className="font-semibold text-ink">
                    every program and card
                  </span>{" "}
                  you have saved, and what each one earns. Ask what a balance is
                  worth, or tell her a new one.
                </>
              ) : focus === "log_trip" ? (
                <>
                  Tell Aly about a trip you have{" "}
                  <span className="font-semibold text-ink">already taken</span>{" "}
                  and she files it with your past trips. She keeps the packing
                  list you used as you wrote it, and will not suggest anything
                  to book.
                </>
              ) : focus === "new_trip" ? (
                <>
                  Tell Aly what you have in mind and she will build it with you,{" "}
                  <span className="font-semibold text-ink">
                    a piece at a time
                  </span>
                  . Rough answers are fine — you do not need dates. It lands in
                  Drafts until you move it to Upcoming trips.
                </>
              ) : (
                <>
                  Aly is looking across{" "}
                  <span className="font-semibold text-ink">all your trips</span>
                  . She can start a new one or remove one from here — open a
                  trip to work on what is inside it.
                </>
              )}{" "}
              You approve every change before it saves.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                SUGGESTIONS[focus] ||
                (trip ? SUGGESTIONS.itinerary : SUGGESTIONS.general)
              ).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-left text-xs font-semibold text-ink-soft transition hover:border-teal hover:text-teal"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            /* The newest answer, so the panel can scroll to the top of it. */
            ref={
              i === messages.length - 1 &&
              m.role === "assistant" &&
              m.kind !== "receipt"
                ? answerRef
                : undefined
            }
            className={
              m.role === "user" ? "flex justify-end" : "flex justify-start"
            }
          >
            <div
              className={`${m.places?.length ? "w-full" : "max-w-[85%]"} rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-teal text-white"
                  : m.kind === "receipt"
                    ? RECEIPT_TONE[m.tone || "saved"] || RECEIPT_TONE.saved
                    : "bg-sand text-ink"
              }`}
            >
              {m.kind === "receipt" && receiptLabel(m.tone) && (
                /* The words as well as the box: a receipt that failed has to
                   read as a failure in grayscale, in a screenshot, and to
                   somebody who cannot tell the two boxes apart. */
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide">
                  {receiptLabel(m.tone)}
                </span>
              )}
              {/* A receipt is one flat line by design -- it is a statement about
                  what happened, not an answer with parts to it. Everything else
                  gets laid out: headers, lists and links, so a four-part answer
                  reads as four parts instead of a paragraph you have to search. */}
              {m.role === "assistant" && m.kind !== "receipt" ? (
                <RichText text={m.text} />
              ) : (
                <span className="whitespace-pre-wrap">{m.text}</span>
              )}
              <ReceiptLinks
                links={m.links}
                onGo={(href) => {
                  // Close first: the drawer sits over the screen being opened,
                  // and the refresh the drawer holds back until it closes is
                  // exactly what makes the new row show up on arrival.
                  onClose?.();
                  router.push(href);
                }}
              />
              <MessageSources sources={m.sources} />
              <PlaceCards
                places={m.places}
                busy={busy}
                here={m.here || here}
                onAdd={(place) => send(addRequest(place))}
                onMore={(place) => send(moreRequest(place))}
                /* Only under the newest shortlist, and asking for more of what
                   this list is -- not of whatever else the conversation has
                   shown. Everything on screen is passed as well, but only so
                   that pressing the button twice cannot hand back the first
                   helping; the kind being asked for comes from these cards. */
                onFindMore={
                  i === lastPlaces && !busy && !pending
                    ? () => send(findMoreRequest(shownPlaces, m.places))
                    : undefined
                }
                /* Offered beside it, on the same list, and for the same
                   reason: the app filters every shortlist through the
                   preferences, and a filter nobody can see is a decision
                   nobody made. This asks what the place is known for instead,
                   and makes each answer say which preference it cuts against. */
                onAlternatives={
                  i === lastPlaces && !busy && !pending
                    ? () => send(alternativesRequest(shownPlaces, m.places))
                    : undefined
                }
              />
              {/* Only under the last answer, and never while she is mid-sentence
                  on the next one. */}
              {i === messages.length - 1 && !busy && !pending && (
                <Followups
                  questions={m.followups}
                  busy={busy}
                  onAsk={(q) => send(q)}
                />
              )}
            </div>
          </div>
        ))}

        {busy && !looking && <Thinking onStop={stopAsking} />}

        {/* The look reports its own real steps -- which trip, which day, what it
            is reading -- so those words are handed straight through and get the
            movement and the clock around them. */}
        {looking && <Thinking label={looking} />}

        {packingBusy && <Thinking label="Working out the packing list…" />}

        {pending && (
          <div className="space-y-2.5">
            {pending.groups.length > 1 && (
              <p className="text-xs text-ink-soft">
                {pending.groups.reduce((n, g) => n + g.actions.length, 0)}{" "}
                proposed changes, in {pending.groups.length} groups. Save them
                one group at a time.
              </p>
            )}

            {pending.groups.map((group) => {
              const saving = applyingKey === group.key;
              const count = group.actions.length;
              // Contents of a trip that has not been created yet cannot be
              // saved until that trip's own chunk has been approved.
              const waitingOn =
                group.needsTrip &&
                pending.groups.some((g) =>
                  g.actions.some((a) => a.createsTrip === group.needsTrip),
                )
                  ? group.needsTrip
                  : null;
              // A new list cannot be saved before the old one is emptied, or
              // the emptying would take the new list with it.
              const waitingForWipe =
                !waitingOn &&
                group.waitsForWipe &&
                pending.groups.some(
                  (g) => g.wipes && g.category === group.category,
                );
              const blocked = Boolean(waitingOn) || waitingForWipe;
              const canPick = pickable(group);
              const noneLeft = nothingChosen(group, skipped);
              return (
                <div
                  key={group.key}
                  className={`rounded-[0.875rem] border bg-white p-4 ring-1 ${
                    group.destructive
                      ? "border-rose/50 ring-rose/20"
                      : "border-teal/40 ring-teal/20"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    {group.label} · {count} change{count === 1 ? "" : "s"}
                  </p>
                  {canPick && (
                    <p className="mt-1 text-xs text-ink-soft">
                      Untick anything you do not want. Only the ticked lines are
                      saved.
                    </p>
                  )}
                  {/* A pasted list can be dozens of rows. Cap the height so the
                      buttons stay in reach without scrolling the card away. */}
                  <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                    {group.actions.map((a, i) => {
                      const k = tickKey(group, i);
                      const held = locked(a, group);
                      const on = held || !skipped.has(k);
                      // The whole line toggles, not just the box: an 18px target
                      // is a fiddle with a thumb, and the words beside it are the
                      // thing being decided about.
                      const Tag = canPick && !held ? "label" : "div";
                      return (
                        <li key={i} className="text-sm text-ink">
                          <Tag
                            className={`flex gap-2 ${
                              canPick && !held ? "cursor-pointer" : ""
                            }`}
                          >
                            {canPick ? (
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={held || applying}
                                onChange={() =>
                                  setSkipped((prev) => toggle(prev, group, i))
                                }
                                aria-label={a.summary}
                                title={
                                  held
                                    ? "The rest of this group goes inside this one, so it stays"
                                    : undefined
                                }
                                className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-teal"
                              />
                            ) : (
                              <span
                                aria-hidden="true"
                                className={
                                  group.destructive ? "text-rose" : "text-teal"
                                }
                              >
                                •
                              </span>
                            )}
                            <span
                              className={on ? "" : "text-ink-soft line-through"}
                            >
                              {a.summary}
                              {a.caution && (
                                /* Something the change could not do, said before it
                               is approved rather than in the receipt afterwards:
                               an animal the family has no record of is left off,
                               and the trip still goes through. */
                                <span className="mt-0.5 block text-xs text-ink-soft">
                                  {a.caution}
                                </span>
                              )}
                            </span>
                          </Tag>
                        </li>
                      );
                    })}
                  </ul>
                  {waitingOn && (
                    <p className="mt-2 text-xs text-ink-soft">
                      These go inside {waitingOn}. Create that trip first and
                      this will unlock.
                    </p>
                  )}
                  {waitingForWipe && (
                    <p className="mt-2 text-xs text-ink-soft">
                      This is the replacement list. Empty the old one above
                      first, then this will unlock.
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => apply(group)}
                      disabled={applying || blocked || noneLeft}
                      className={`btn px-4 py-1.5 text-sm ${
                        group.destructive
                          ? "bg-rose text-white hover:bg-[#8c364e]"
                          : "btn-primary"
                      }`}
                    >
                      {saving
                        ? "Saving…"
                        : group.destructive
                          ? "Yes, delete"
                          : applyLabel(group, skipped)}
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissGroup(group.key)}
                      disabled={applying}
                      className="btn btn-ghost px-4 py-1.5 text-sm"
                    >
                      Discard
                    </button>
                    {noneLeft && (
                      <p className="self-center text-xs text-ink-soft">
                        Nothing is ticked.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {pending.groups.length > 1 && (
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={applying}
                className="btn btn-ghost px-3 py-1 text-xs"
              >
                Discard everything
              </button>
            )}
          </div>
        )}

        {/* A stopped question is not a failed one, so it gets the same one-press
            way back without the red. */}
        {retryAsk && !error && !busy && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => send(retryAsk, { again: true })}
          >
            Ask again
          </button>
        )}

        {error && (
          <div className="rounded-xl bg-rose/10 px-3 py-2 text-sm text-rose">
            <p>{error}</p>
            {/* The same question again, on one press. Without this the family has
                to find what they typed, which is gone from the box, and type it
                out a second time -- and a long question asked at a bad moment is
                exactly the one worth putting again. Offered only when nothing was
                answered, so pressing it cannot repeat something that worked. */}
            {retryAsk && (
              <button
                type="button"
                className="btn btn-ghost mt-2"
                disabled={busy}
                onClick={() => send(retryAsk, { again: true })}
              >
                Ask again
              </button>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="shrink-0 border-t border-[var(--line)] bg-sand/50 px-3 py-3"
      >
        <div className="mb-2">
          <WhereIAm here={here} onChange={setHere} />
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="field max-h-48 min-h-[7rem] resize-none overflow-y-auto leading-relaxed"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter still sends. Shift-Enter makes a new line, so a whole
              // itinerary can be typed or pasted as one message.
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={askPlaceholder({ focus, hasTrip: Boolean(trip) })}
            disabled={busy}
            aria-label="Message Aly"
          />
          <button
            className="btn btn-primary shrink-0 px-4"
            disabled={busy || !input.trim()}
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 text-[0.7rem] text-ink-soft">
          Enter sends · Shift-Enter starts a new line
        </p>
      </form>
    </section>
  );
}
