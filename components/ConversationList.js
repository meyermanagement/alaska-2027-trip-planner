"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AlyeskaMark from "./AlyeskaMark";

// What you land on when you open Aly: the conversations you have already had,
// newest first, so you carry on with one instead of scrolling back through a
// single endless transcript. The search box above them looks through every word
// anyone has ever said to her.
//
// Highlighting comes back from the server wrapped in [[ ]] — the search does the
// marking in Postgres, and the text itself is still rendered as text, never as
// markup.
const OPEN = "[[";
const CLOSE = "]]";

export default function ConversationList({ onPick, onNew, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  // Deleting takes two taps. A conversation is a record of things the family
  // worked out, and the transcript goes with it, so one stray tap on a phone
  // should not be enough.
  const [confirmId, setConfirmId] = useState(null);
  // Conversations start shared with the other parents, so the list has to say
  // whose each one is -- and only offer to delete, or to unshare, the ones that
  // belong to the person reading it.
  const [me, setMe] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const searchBox = useRef(null);

  // Pulling one back to yourself, or letting the other parents have it again.
  const share = async (id, visibility) => {
    setSharing(id);
    setError("");
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, visibility }),
      });
      if (!res.ok) {
        setError("Could not change who can see that.");
        return;
      }
      setConversations((list) =>
        list.map((c) => (c.id === id ? { ...c, visibility } : c)),
      );
    } catch {
      setError("Could not change who can see that.");
    } finally {
      setSharing(null);
    }
  };

  const remove = async (id) => {
    setDeletingId(id);
    setError("");
    try {
      const res = await fetch(
        `/api/chat/conversations?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      // A conversation someone else already deleted is still gone, which is the
      // outcome that was wanted, so drop it from the list rather than complain.
      if (!res.ok && res.status !== 404) {
        setError(data?.error || "Could not delete that conversation.");
        return;
      }
      setConversations((list) => list.filter((c) => c.id !== id));
      setResults((list) =>
        list ? list.filter((r) => r.conversationId !== id) : list,
      );
      setConfirmId(null);
    } catch {
      setError("Could not delete that conversation.");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    let alive = true;
    fetch("/api/chat/conversations")
      .then((res) => (res.ok ? res.json() : { conversations: [] }))
      .then((data) => {
        if (!alive) return;
        setConversations(
          Array.isArray(data?.conversations) ? data.conversations : [],
        );
        setMe(data?.me || null);
      })
      .catch(() => {
        if (alive) setError("Could not load your conversations.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Typed searches are debounced so a fast typist makes one request, not eight.
  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/chat/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => {
          if (!alive) return;
          setResults(Array.isArray(data?.results) ? data.results : []);
        })
        .catch(() => {
          if (alive) setResults([]);
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const searchingNow = trimmed.length >= 2;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AlyeskaMark className="h-7 w-7 shrink-0 text-teal" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold leading-none">
              Ask Aly
            </h2>
            <p className="mt-1 truncate text-xs text-ink-soft">
              Your conversations
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the assistant"
            className="shrink-0 rounded-full p-1.5 text-ink-soft transition hover:bg-sand hover:text-ink"
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
      </header>

      <div className="shrink-0 space-y-2.5 border-b border-[var(--line)] px-4 py-3">
        <button
          type="button"
          onClick={onNew}
          className="btn btn-primary w-full"
        >
          New conversation
        </button>
        <div className="relative">
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <circle cx="9" cy="9" r="5.25" />
            <path d="m13 13 4 4" />
          </svg>
          <input
            ref={searchBox}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything you have asked Aly"
            aria-label="Search your conversations"
            className="field w-full"
            style={{ paddingLeft: "2.25rem" }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && <p className="text-sm text-rose">{error}</p>}

        {searchingNow ? (
          <SearchResults
            query={trimmed}
            results={results}
            searching={searching}
            onPick={onPick}
            me={me}
          />
        ) : loading ? (
          <p className="text-sm text-ink-soft">Looking these up…</p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Nothing yet. Start a conversation and it will be waiting here next
            time — ask about a trip, paste a list, or think out loud about
            somewhere new.
          </p>
        ) : (
          <ul className="space-y-2">
            {conversations.map((c) => (
              <li
                key={c.id}
                className="card relative transition hover:border-teal/50"
              >
                <button
                  type="button"
                  onClick={() =>
                    onPick({
                      ...c,
                      ownerName: mineHere(c, me) ? null : c.ownerName,
                    })
                  }
                  className="w-full rounded-[0.875rem] px-3.5 py-3 text-left transition hover:bg-sand/60"
                >
                  <p
                    className={`truncate text-sm font-semibold text-ink ${
                      mineHere(c, me) ? "pr-28" : "pr-10"
                    }`}
                  >
                    {c.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">
                    {meta(c, me)}
                  </p>
                  {c.preview && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-ink-soft">
                      {c.preview}
                    </p>
                  )}
                </button>
                {/* Siblings of the row rather than children of it, because a
                    button cannot live inside another button. Both are the
                    owner's alone: somebody reading a shared conversation can
                    neither delete it nor decide who else sees it. */}
                {mineHere(c, me) && (
                  <button
                    type="button"
                    disabled={sharing === c.id}
                    onClick={() =>
                      share(
                        c.id,
                        c.visibility === "private" ? "family" : "private",
                      )
                    }
                    className="absolute right-11 top-1 flex h-9 items-center rounded-full px-3 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-soft transition hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50"
                  >
                    {c.visibility === "private" ? "Just you" : "Shared"}
                  </button>
                )}
                {mineHere(c, me) && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmId((was) => (was === c.id ? null : c.id))
                    }
                    aria-label={`Delete the conversation ${c.title}`}
                    className="absolute right-1.5 top-1 flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:bg-rose/10 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M4 6.5h12M8 6.5V4.75h4V6.5M6.5 6.5 7 16h6l.5-9.5M9 9.5v4M11 9.5v4" />
                    </svg>
                  </button>
                )}
                {confirmId === c.id && (
                  <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-3.5 py-2">
                    <p className="text-xs text-ink-soft">
                      Delete this and everything said in it?
                    </p>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="rounded-full px-2.5 py-1 text-xs font-semibold text-ink-soft transition hover:bg-sand"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        disabled={deletingId === c.id}
                        className="rounded-full bg-rose/10 px-2.5 py-1 text-xs font-semibold text-rose transition hover:bg-rose/20 disabled:opacity-50"
                      >
                        {deletingId === c.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SearchResults({ query, results, searching, onPick, me = null }) {
  if (results === null) {
    return <p className="text-sm text-ink-soft">Searching…</p>;
  }
  if (!results.length) {
    return (
      <p className="text-sm text-ink-soft">
        {searching
          ? "Searching…"
          : `Nothing matching “${query}” in anything you have asked her.`}
      </p>
    );
  }
  return (
    <>
      <p className="mb-2 text-xs text-ink-soft">
        {results.length === 1
          ? "One conversation mentions that."
          : `${results.length} conversations mention that.`}
      </p>
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.conversationId}>
            <button
              type="button"
              onClick={() =>
                onPick({
                  id: r.conversationId,
                  title: r.title,
                  tripId: r.tripId,
                  tripName: r.tripName,
                  ownerName:
                    me && r.ownerId && r.ownerId !== me ? r.ownerName : null,
                })
              }
              className="card w-full px-3.5 py-3 text-left transition hover:border-teal/50 hover:bg-sand/60"
            >
              <p className="truncate text-sm font-semibold text-ink">
                {r.title}
              </p>
              {r.ownerName && me && r.ownerId && r.ownerId !== me && (
                <p className="mt-0.5 text-xs text-ink-soft">
                  {r.ownerName} asked
                </p>
              )}
              {r.tripName && (
                <p className="mt-0.5 text-xs text-ink-soft">{r.tripName}</p>
              )}
              {r.titleMatch && !r.hits?.length && (
                <p className="mt-0.5 text-xs text-ink-soft">
                  The name of the conversation matches.
                </p>
              )}
              <ul className="mt-1.5 space-y-1.5">
                {(r.hits || []).map((hit) => (
                  <li key={hit.messageId} className="text-xs text-ink-soft">
                    <span className="text-ink-soft">
                      {hit.role === "assistant" ? "Aly" : "You"}
                      {hit.createdAt ? ` · ${when(hit.createdAt)}` : ""}
                    </span>
                    <span className="mt-0.5 block text-ink">
                      <Marked text={hit.snippet} />
                    </span>
                  </li>
                ))}
              </ul>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// The matched words come back wrapped in markers. Split on them and render the
// pieces, so what is shown is always plain text with some of it emphasised.
function Marked({ text }) {
  const parts = useMemo(() => splitMarks(text), [text]);
  return (
    <>
      {parts.map((part, i) =>
        part.hit ? (
          <mark key={i} className="rounded bg-amber/20 px-0.5 text-ink">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function splitMarks(text) {
  const source = String(text || "");
  const parts = [];
  let at = 0;
  while (at < source.length) {
    const start = source.indexOf(OPEN, at);
    if (start < 0) break;
    const end = source.indexOf(CLOSE, start + OPEN.length);
    if (end < 0) break;
    if (start > at) parts.push({ text: source.slice(at, start), hit: false });
    parts.push({
      text: source.slice(start + OPEN.length, end),
      hit: true,
    });
    at = end + CLOSE.length;
  }
  if (at < source.length) parts.push({ text: source.slice(at), hit: false });
  return parts.length ? parts : [{ text: source, hit: false }];
}

function mineHere(c, me) {
  return !c.ownerId || !me || c.ownerId === me;
}

function meta(c, me) {
  const bits = [];
  const mine = !c.ownerId || !me || c.ownerId === me;
  if (!mine && c.ownerName) bits.push(`${c.ownerName} asked`);
  // Not "Just you" here as well: the toggle beside the title already says it,
  // and saying it twice in one card read like a warning.
  if (c.tripName) bits.push(c.tripName);
  if (c.updatedAt) bits.push(when(c.updatedAt));
  bits.push(`${c.messageCount} message${c.messageCount === 1 ? "" : "s"}`);
  return bits.join(" · ");
}

// Close enough to be useful without a date library: minutes and hours today,
// then a plain date.
export function when(value) {
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "";
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year:
      then.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}
