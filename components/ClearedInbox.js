"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/LinkPending";
import { tripPath } from "@/lib/trips/route";

/**
 * The messages that have left the inbox, kept where they can be found again.
 *
 * At the bottom of the Inbox and shut by default, because that is what it is for:
 * a record rather than a screen. Nothing is fetched until it is opened, so the
 * list costs nothing on the days nobody wonders. Same shape as the put-away tips
 * at the bottom of Reminders, deliberately -- the two answer the same question.
 *
 * Worth keeping at all because reaching zero in the inbox is the point of the
 * screen, and anything that makes zero feel risky makes the screen worse. A
 * confirmation thrown out on a Tuesday is unrecoverable today; the family
 * either files everything defensively or loses things. This is the drawer that
 * makes clearing safe to do quickly.
 *
 * Reopening a filed message takes its rows back off the trip, so the row asks
 * first and says the number. Reopening a thrown-out message cannot bring the
 * attachments back -- those bytes went when it was thrown out -- and the row
 * says that where somebody can read it before pressing, not after.
 */
export default function ClearedInbox() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [askingId, setAskingId] = useState(null);
  const [workingId, setWorkingId] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    setProblem("");
    try {
      const res = await fetch("/api/inbox/cleared");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "");
      setRows(json.messages || []);
    } catch {
      setProblem("Could not fetch those. Try opening it again.");
    }
    setBusy(false);
  }, []);

  const reopen = useCallback(
    async (message) => {
      setAskingId(null);
      setWorkingId(message.id);
      setProblem("");
      try {
        const res = await fetch(`/api/inbox/${message.id}/reopen`, {
          method: "POST",
        });
        if (!res.ok) throw new Error();
        setRows((prev) => (prev || []).filter((row) => row.id !== message.id));
        // The pending list above this drawer was rendered on the server and does
        // not know the message came back. Refresh so it appears up there rather
        // than only disappearing from down here.
        router.refresh();
      } catch {
        setProblem("That did not save. It is still where it was.");
      }
      setWorkingId(null);
    },
    [router],
  );

  return (
    <details
      className="no-print mt-10 border-t border-[var(--line)] pt-5"
      onToggle={(event) => {
        const isOpen = event.currentTarget.open;
        setOpen(isOpen);
        if (isOpen && rows === null && !busy) load();
      }}
    >
      <summary className="cursor-pointer list-none text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-ink-faint transition hover:text-ink-soft">
        {open ? "Hide" : "Show"} messages that have left the inbox
      </summary>

      <div className="mt-4">
        {problem ? (
          <p role="alert" className="text-[0.82rem] text-rose">
            {problem}
          </p>
        ) : null}
        {busy && rows === null ? (
          <p className="text-[0.84rem] text-ink-soft">Fetching…</p>
        ) : null}
        {rows && !rows.length ? (
          <p className="text-[0.84rem] leading-relaxed text-ink-soft">
            Nothing has left the inbox yet. Everything you file or throw out
            ends up here, and can be put back.
          </p>
        ) : null}
        {rows && rows.length ? (
          <ul className="space-y-3">
            {rows.map((message) => {
              const trip = message.trips;
              const wasFiled = message.status === "filed";
              const asking = askingId === message.id;
              const working = workingId === message.id;
              return (
                <li
                  key={message.id}
                  aria-busy={working || undefined}
                  className={`rounded-xl border border-[var(--line)] bg-white/60 p-4 transition-opacity duration-200 ${
                    working ? "opacity-60" : ""
                  }`}
                >
                  <h4 className="font-semibold leading-snug text-ink-soft">
                    {message.subject || "(no subject)"}
                  </h4>
                  <p className="mt-1 text-[0.86rem] leading-relaxed text-ink-faint">
                    {message.from_name ||
                      message.from_email ||
                      "Unknown sender"}
                    {", "}
                    {dayOf(message.received_at)}
                  </p>
                  <p className="mt-1 text-[0.86rem] leading-relaxed text-ink-faint">
                    {wasFiled ? (
                      <>
                        {message.auto_filed ? "Aly filed it" : "Filed"} to{" "}
                        {trip?.slug || trip?.public_id ? (
                          <Link
                            href={tripPath(trip)}
                            className="font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                          >
                            {trip.name}
                          </Link>
                        ) : (
                          "a trip"
                        )}
                        {message.itinerary_rows > 0
                          ? `, and it added ${rowCount(message.itinerary_rows)}.`
                          : "."}
                      </>
                    ) : (
                      "Thrown out. Anything attached to it was not kept."
                    )}
                  </p>

                  {asking ? (
                    <div className="mt-3 rounded-lg border border-[var(--line-strong)] bg-sand p-3">
                      <p className="text-[0.84rem] leading-relaxed text-ink-soft">
                        {message.itinerary_rows > 0
                          ? `Putting this back takes ${rowCount(
                              message.itinerary_rows,
                            )} off ${trip?.name || "the trip"}.`
                          : "Putting this back leaves the trip as it is."}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => reopen(message)}
                          className="btn btn-primary px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em]"
                        >
                          Put it back
                        </button>
                        <button
                          type="button"
                          onClick={() => setAskingId(null)}
                          className="rounded-lg px-2 py-1 text-[0.78rem] text-ink-soft underline underline-offset-2 transition hover:text-teal"
                        >
                          Leave it
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        wasFiled ? setAskingId(message.id) : reopen(message)
                      }
                      disabled={working}
                      className="btn btn-ghost mt-3 inline-flex items-center gap-1.5 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em] disabled:cursor-progress disabled:opacity-60"
                    >
                      {working ? (
                        <>
                          <Spinner className="h-3 w-3" />
                          <span>Putting it back…</span>
                        </>
                      ) : (
                        "Put it back in the inbox"
                      )}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </details>
  );
}

// "one itinerary row" reads worse than "1 itinerary row" in a sentence that is
// about a number, and "rows" with a 1 in front of it is the tell of a screen
// nobody read aloud.
function rowCount(n) {
  return n === 1 ? "one itinerary row" : `${n} itinerary rows`;
}

function dayOf(value) {
  if (!value) return "date unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "date unknown";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
