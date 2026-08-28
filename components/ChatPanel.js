"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AlyeskaMark from "./AlyeskaMark";
import { groupActions } from "@/lib/agent/groups";
import PlaceCards, { addRequest } from "./PlaceCards";
import WhereIAm, { readStored } from "./WhereIAm";
import { runLook } from "@/lib/tips/run";
import { foundLine } from "@/lib/tips/ask";

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
  // Started from "Create with Aly" on the Trips page.
  new_trip: [
    "A week somewhere warm over spring break",
    "Somewhere we can drive to in three days",
    "A repeat of Europe 2026, but slower",
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
  const applying = applyingKey !== null;
  const [packingBusy, setPackingBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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

  async function send(text) {
    const clean = text.trim();
    if (!clean || busy) return;

    setError("");
    setPending(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: clean }]);
    setBusy(true);

    try {
      // Only the new message goes up; the server reads the rest of the thread
      // from the database.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          focus,
          message: clean,
          conversationId: conversationRef.current,
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
        await carryOut(data.look);
      }
    } catch {
      setError(
        "I could not reach the app just then. Check your signal and try again.",
      );
    }
    setBusy(false);
  }

  // Aly's own look, run from here for the same reason the button's is: one
  // grounded question uses most of a route's sixty seconds, and walking a trip
  // takes five. Whatever it finds is saved as it goes, so closing the drawer
  // halfway costs the rest of the look and nothing that was already found.
  async function carryOut(look) {
    setLooking("Looking…");
    const { found, error } = await runLook({
      tripId: look.tripId,
      steps: look.steps,
      onNote: setLooking,
    });
    setLooking("");
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        text: error
          ? found
            ? `${foundLine(found, look)} I stopped early though — ${error}`
            : `I could not finish looking. ${error}`
          : foundLine(found, look),
      },
    ]);
    // The tips are rows on the page behind this drawer, so the page has to be
    // told. Without this they appear on the next navigation and look late.
    if (found) router.refresh();
  }

  // One chunk at a time. Everything else stays on screen, still pending, so a
  // long paste can be approved in the order the family cares about.
  async function apply(group) {
    if (!pending || applying || !group?.actions?.length) return;
    setApplyingKey(group.key);
    setError("");
    try {
      const res = await fetch("/api/chat/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          actions: group.actions,
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
        { role: "assistant", text: data.receipt || fallback, kind: "receipt" },
      ]);
      // Drop just the chunk that went through; keep the rest waiting.
      setPending((p) => {
        const left = (p?.groups || []).filter((g) => g.key !== group.key);
        return left.length ? { groups: left } : null;
      });
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
        setMessages((m) => [
          ...m,
          { role: "assistant", kind: "receipt", text: data.receipt },
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
              className="-ml-1 shrink-0 rounded-lg p-1.5 text-ink-soft transition hover:bg-sand hover:text-ink"
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
                ? conversationTripName || (trip ? trip.name : "All trips")
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
              className="rounded-lg p-1.5 text-ink-soft transition hover:bg-sand hover:text-ink"
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
              ) : focus === "new_trip" ? (
                <>
                  Tell Aly what you have in mind and she will draft{" "}
                  <span className="font-semibold text-ink">a new trip</span> —
                  it lands in Drafts until you move it to Upcoming trips.
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
            className={
              m.role === "user" ? "flex justify-end" : "flex justify-start"
            }
          >
            <div
              className={`${m.places?.length ? "w-full" : "max-w-[85%]"} rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-teal text-white"
                  : m.kind === "receipt"
                    ? "bg-teal-soft text-teal"
                    : "bg-sand text-ink"
              }`}
            >
              <span className="whitespace-pre-wrap">{m.text}</span>
              <MessageSources sources={m.sources} />
              <PlaceCards
                places={m.places}
                busy={busy}
                here={m.here || here}
                onAdd={(place) => send(addRequest(place))}
              />
            </div>
          </div>
        ))}

        {busy && !looking && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-sand px-3.5 py-2.5 text-sm text-ink-soft">
              Thinking…
            </div>
          </div>
        )}

        {looking && (
          <div className="flex justify-start">
            <div
              className="rounded-xl bg-sand px-3.5 py-2.5 text-sm text-ink-soft"
              aria-live="polite"
            >
              {looking}
            </div>
          </div>
        )}

        {packingBusy && (
          <div className="flex justify-start">
            <div
              className="rounded-xl bg-sand px-3.5 py-2.5 text-sm text-ink-soft"
              aria-live="polite"
            >
              Working out the packing list…
            </div>
          </div>
        )}

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
              return (
                <div
                  key={group.key}
                  className={`rounded-xl border bg-white p-4 ring-1 ${
                    group.destructive
                      ? "border-rose/50 ring-rose/20"
                      : "border-teal/40 ring-teal/20"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    {group.label} · {count} change{count === 1 ? "" : "s"}
                  </p>
                  {/* A pasted list can be dozens of rows. Cap the height so the
                      buttons stay in reach without scrolling the card away. */}
                  <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
                    {group.actions.map((a, i) => (
                      <li key={i} className="flex gap-2 text-sm text-ink">
                        <span
                          aria-hidden="true"
                          className={
                            group.destructive ? "text-rose" : "text-teal"
                          }
                        >
                          •
                        </span>
                        <span>{a.summary}</span>
                      </li>
                    ))}
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
                      disabled={applying || blocked}
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
                          : "Apply"}
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissGroup(group.key)}
                      disabled={applying}
                      className="btn btn-ghost px-4 py-1.5 text-sm"
                    >
                      Discard
                    </button>
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

        {error && (
          <p className="rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">
            {error}
          </p>
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
            placeholder={
              trip
                ? "Add dinner Thursday at 6, or paste a whole list…"
                : "Ask about any trip, or paste a whole list…"
            }
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
