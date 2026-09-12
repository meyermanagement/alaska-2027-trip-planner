"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  FAULT_KIND,
  FEEDBACK_STATUSES,
  faultSourceLabel,
  issueName,
  kindLabel,
  routeLabel,
  statusLabel,
} from "@/lib/feedback/shared";
import CopyWord from "../CopyWord";

/**
 * The issue log: every report, from a person or from the app itself, in one
 * list that is meant to be worked through rather than admired.
 *
 * Its own page, because a beta's worth of reports is longer than a section. The
 * beta desk keeps a count and a way in; the reading, filtering and dispatching
 * happen here.
 *
 * Three things each row carries that a plain feed does not:
 *
 * A name. Every report has a number of its own, shown in mono with a copy
 * button, because the way this log is actually used is that somebody reads a row
 * and then asks for it in a sentence. "Fix ISS-014" is a whole instruction; a
 * UUID is not something anybody retypes.
 *
 * A way to fix it. Whether the thing to do is already decided, or whether it
 * wants a conversation first. Rows nobody has judged show a suggestion, marked
 * as a guess, so a long log can be split into replies and commits at a glance
 * without the guess ever being mistaken for a decision.
 *
 * A suspicion that it is already done. Set by hand, and offered by the log
 * itself when a report was filed against a build that is no longer running --
 * the commonest way an hour gets wasted on a beta is re-fixing something that
 * shipped last week.
 *
 * The filters start with fixed and not doing put away. Anything settled is
 * still one tap from view, but the list you land on is the list of things that
 * still want doing.
 */

const KIND_FILTERS = [
  { id: "all", label: "Everything" },
  { id: "problem", label: "Something is wrong" },
  { id: "idea", label: "Ideas" },
  { id: FAULT_KIND, label: "Broke on its own" },
];

const ROUTE_FILTERS = [
  { id: "all", label: "Either way" },
  { id: "auto", label: "Can be fixed as asked" },
  { id: "talk", label: "Needs a conversation" },
];

export default function IssueLog({ issues = [], build = "" }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");

  const [hideFixed, setHideFixed] = useState(true);
  const [hideDeclined, setHideDeclined] = useState(true);
  const [kind, setKind] = useState("all");
  const [route, setRoute] = useState("all");
  const [onlyMaybeFixed, setOnlyMaybeFixed] = useState(false);
  const [find, setFind] = useState("");

  async function save(id, patch) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "That did not save.");
        return;
      }
      router.refresh();
    } catch {
      setError("That did not save.");
    } finally {
      setBusy("");
    }
  }

  const shown = useMemo(() => {
    const needle = find.trim().toLowerCase();
    return issues.filter((one) => {
      if (hideFixed && one.status === "fixed") return false;
      if (hideDeclined && one.status === "declined") return false;
      if (kind !== "all" && one.kind !== kind) return false;
      if (route !== "all" && (one.route || one.guess) !== route) return false;
      if (onlyMaybeFixed && !(one.maybeFixed || one.oldBuild)) return false;
      if (!needle) return true;
      return [
        issueName(one.ref),
        one.body,
        one.path,
        one.email,
        one.tripName,
      ].some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [issues, hideFixed, hideDeclined, kind, route, onlyMaybeFixed, find]);

  const waiting = issues.filter((one) => one.status === "new").length;

  return (
    <main className="screen px-5 pb-16 pt-7">
      <a href="/admin" className="text-sm text-teal underline">
        Back to the beta desk
      </a>
      <h1 className="mt-3 font-display text-3xl font-semibold">Issue log</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">
        {issues.length
          ? `${issues.length} ${issues.length === 1 ? "report" : "reports"}, ${waiting} not looked at yet. Every one has a name you can copy into a message.`
          : "Nothing yet. Reports arrive from the flag inside the app, and faults record themselves."}
      </p>

      <div className="card mt-5 p-4">
        <div className="flex flex-wrap gap-1.5">
          <Toggle on={hideFixed} onClick={() => setHideFixed(!hideFixed)}>
            Hide fixed
          </Toggle>
          <Toggle
            on={hideDeclined}
            onClick={() => setHideDeclined(!hideDeclined)}
          >
            Hide not doing
          </Toggle>
          <Toggle
            on={onlyMaybeFixed}
            onClick={() => setOnlyMaybeFixed(!onlyMaybeFixed)}
          >
            Only what may be fixed
          </Toggle>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-sand-deep pt-3">
          {KIND_FILTERS.map((one) => (
            <Toggle
              key={one.id}
              on={kind === one.id}
              onClick={() => setKind(one.id)}
            >
              {one.label}
            </Toggle>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-sand-deep pt-3">
          {ROUTE_FILTERS.map((one) => (
            <Toggle
              key={one.id}
              on={route === one.id}
              onClick={() => setRoute(one.id)}
            >
              {one.label}
            </Toggle>
          ))}
        </div>

        <label className="mt-3 block border-t border-sand-deep pt-3">
          <span className="sr-only">Find a report</span>
          <input
            type="search"
            value={find}
            onChange={(event) => setFind(event.target.value)}
            placeholder="Find a word, a screen, or ISS-014"
            className="field w-full"
          />
        </label>

        <p className="mt-3 text-xs text-ink-soft">
          Showing {shown.length} of {issues.length}.
        </p>
      </div>

      {error && <p className="mt-3 text-sm text-rose">{error}</p>}

      <ul className="mt-5 space-y-3">
        {shown.map((one) => {
          const judged = one.route || one.guess;
          return (
            <li key={one.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <span className="font-mono text-sm font-semibold tracking-tight">
                    {issueName(one.ref) || "no number"}
                  </span>
                  {issueName(one.ref) && <CopyWord text={issueName(one.ref)} />}
                </span>
                <span className="min-w-0 break-words text-xs text-ink-soft">
                  {one.kind === FAULT_KIND
                    ? faultSourceLabel(one.source)
                    : kindLabel(one.kind)}
                  {one.at ? ` · ${one.at}` : ""}
                  {one.seenCount > 1 ? ` · ${one.seenCount} times` : ""}
                </span>
              </div>

              <p
                className={`mt-2 whitespace-pre-wrap leading-relaxed ${
                  one.kind === FAULT_KIND
                    ? "break-words font-mono text-sm"
                    : "text-sm"
                }`}
              >
                {one.body}
              </p>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Tag tone={judged === "auto" ? "teal" : "amber"}>
                  {routeLabel(judged)}
                  {one.route ? "" : ", probably"}
                </Tag>
                {one.status !== "new" && <Tag>{statusLabel(one.status)}</Tag>}
                {(one.maybeFixed || one.oldBuild) && (
                  <Tag tone="teal">
                    {one.maybeFixed
                      ? "May already be fixed"
                      : "Filed on an older build"}
                  </Tag>
                )}
              </div>

              {one.shots.length > 0 && (
                <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {one.shots.map((shot, n) => (
                    <li key={shot}>
                      <a
                        href={shot}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border border-sand-deep"
                      >
                        <img
                          src={shot}
                          alt={`Screenshot ${n + 1}`}
                          className="block h-24 w-full object-cover"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 text-xs text-ink-soft">
                {[
                  one.path ? `On ${one.path}` : null,
                  one.email || null,
                  one.tripName ? `Trip: ${one.tripName}` : null,
                  one.skin ? `Look: ${one.skin}` : null,
                  one.viewport || null,
                  one.build ? `Build ${one.build}` : null,
                  one.browser || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {one.trail.length > 0 && (
                <p className="mt-1.5 text-xs text-ink-soft">
                  Before this: {one.trail.join(" \u2190 ")}
                </p>
              )}

              {one.thrownAt && (
                <p className="mt-1.5 break-all text-xs text-ink-soft">
                  Thrown at {one.thrownAt}
                </p>
              )}

              {one.stack && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(open === one.id ? "" : one.id)}
                    className="btn btn-ghost btn-sm"
                    aria-expanded={open === one.id}
                  >
                    {open === one.id ? "Hide the stack" : "Show the stack"}
                  </button>
                  {open === one.id && (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-sand-deep p-3 text-xs leading-relaxed text-ink-soft">
                      {one.stack}
                    </pre>
                  )}
                </div>
              )}

              <div
                className="mt-3 flex flex-wrap gap-1.5 border-t border-sand-deep pt-3"
                role="group"
                aria-label="Where this report stands"
              >
                {FEEDBACK_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => save(one.id, { status })}
                    disabled={busy === one.id || one.status === status}
                    aria-pressed={one.status === status}
                    className={`chip ${one.status === status ? "chip-shade" : ""}`}
                  >
                    {statusLabel(status)}
                  </button>
                ))}
              </div>

              <div
                className="mt-2 flex flex-wrap gap-1.5"
                role="group"
                aria-label="How to handle this report"
              >
                {["auto", "talk"].map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      save(one.id, { route: one.route === id ? "" : id })
                    }
                    disabled={busy === one.id}
                    aria-pressed={one.route === id}
                    className={`chip ${one.route === id ? "chip-shade" : ""}`}
                  >
                    {routeLabel(id)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => save(one.id, { maybeFixed: !one.maybeFixed })}
                  disabled={busy === one.id}
                  aria-pressed={one.maybeFixed}
                  className={`chip ${one.maybeFixed ? "chip-shade" : ""}`}
                >
                  May already be fixed
                </button>
              </div>
            </li>
          );
        })}
        {!shown.length && issues.length > 0 && (
          <li className="text-sm text-ink-soft">
            Nothing matches those filters.
          </li>
        )}
      </ul>

      {build && (
        <p className="mt-6 text-xs text-ink-soft">
          Running build {build}. Anything filed against an older one may have
          been fixed since.
        </p>
      )}
    </main>
  );
}

/** A filter, which is a chip that remembers whether it is on. */
function Toggle({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`chip ${on ? "chip-shade" : ""}`}
    >
      {children}
    </button>
  );
}

/** A fact about a row, not a control. Reads as a chip and does nothing. */
function Tag({ tone = "faint", children }) {
  const color =
    tone === "teal"
      ? "border-teal/40 text-teal"
      : tone === "amber"
        ? "border-amber/40 text-amber"
        : "border-sand-deep text-ink-soft";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${color}`}
    >
      {children}
    </span>
  );
}
