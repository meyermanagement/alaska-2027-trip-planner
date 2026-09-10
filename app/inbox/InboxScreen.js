"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/LinkPending";
import { tripPath } from "@/lib/trips/route";

/**
 * The screen a family reads their inbox on.
 *
 * The address strip at the top is the affordance -- copy it, forward things
 * to it. Beneath, one card per pending message, with three actions each:
 *
 *   - File it. Opens a small picker where the primary picks the trip the
 *     message belongs to and, if the sender was unknown, which traveler it
 *     is from. A filed message drops off the list and lives on the trip
 *     for the parser to pick up in a follow-up commit.
 *
 *   - Trust the sender. Opens the same person picker, links the sender's
 *     address to that person for all future messages, and marks this
 *     message and any other pending message from the same sender as
 *     forwarder-classified.
 *
 *   - Throw it out. A confirm-then-delete that removes the attachment
 *     bytes and marks the row deleted.
 *
 * Unknown-sender messages are flagged in the header so the primary sees
 * at a glance which rows need attribution before they can be filed cleanly.
 */
export default function InboxScreen({
  address,
  messages,
  attachments,
  parsedItems,
  autoFiled = [],
  upcomingTrips,
  pastTrips,
  travelers,
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState(null);
  const [mode, setMode] = useState(null); // "file" | "trust" | null
  const [busyId, setBusyId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [undoBusyId, setUndoBusyId] = useState(null);
  const [clearBusyId, setClearBusyId] = useState(null);

  async function handleClearAutoFile(messageId) {
    setClearBusyId(messageId);
    try {
      const res = await fetch(`/api/inbox/${messageId}/dismiss`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || "We could not clear that. Try again.");
        return;
      }
      router.refresh();
    } catch {
      window.alert("We could not reach the server. Try again.");
    } finally {
      setClearBusyId(null);
    }
  }

  async function handleUndoAutoFile(messageId) {
    setUndoBusyId(messageId);
    try {
      const res = await fetch(`/api/inbox/${messageId}/unfile`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        window.alert(body.error || "We could not undo that. Try again.");
        return;
      }
      router.refresh();
    } catch {
      window.alert("We could not reach the server. Try again.");
    } finally {
      setUndoBusyId(null);
    }
  }

  const byMessage = useMemo(() => {
    const m = new Map();
    for (const a of attachments || []) {
      const list = m.get(a.message_id) || [];
      list.push(a);
      m.set(a.message_id, list);
    }
    return m;
  }, [attachments]);

  const parsedByMessage = useMemo(() => {
    const m = new Map();
    for (const p of parsedItems || []) {
      const list = m.get(p.message_id) || [];
      list.push(p);
      m.set(p.message_id, list);
    }
    return m;
  }, [parsedItems]);

  const travelerById = useMemo(() => {
    const m = new Map();
    for (const t of travelers) m.set(t.id, t);
    return m;
  }, [travelers]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers -- do nothing rather than crashing. The address is
      // visible on the strip so the person can still copy it by selection.
    }
  }

  async function fileMessage(id, tripId, travelerId, approveItemIds) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/inbox/${id}/file`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          traveler_id: travelerId,
          approve_item_ids: approveItemIds || [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOpenId(null);
      setMode(null);
      router.refresh();
    } catch (e) {
      window.alert("Could not file that message: " + (e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  async function trustSender(id, travelerId) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/inbox/${id}/forwarder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ traveler_id: travelerId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOpenId(null);
      setMode(null);
      router.refresh();
    } catch (e) {
      window.alert("Could not add that sender: " + (e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  async function throwOut(id) {
    if (
      !window.confirm(
        "Throw this message out? The attachments go with it. This cannot be undone.",
      )
    )
      return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/inbox/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      window.alert("Could not delete that message: " + (e?.message || e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-[0.02em] text-ink">
        Inbox
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        Forward booking confirmations to the address below and Aly will file
        them onto the right trip. Airline confirmations, hotel bookings, the
        rental car -- any one of them, from any address.
      </p>

      <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-[var(--line)] bg-sand p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.08em] text-ink-faint">
            The family address
          </div>
          <div className="mt-1 truncate font-mono text-base text-ink">
            {address}
          </div>
        </div>
        <button
          type="button"
          onClick={copyAddress}
          className="shrink-0 rounded-xl border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-teal hover:text-teal"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {autoFiled.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-[var(--line)] bg-sand p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-ink">
              Just filed by Aly
            </h2>
            <span className="text-xs text-ink-faint">Undo good for a day</span>
          </div>
          <ul className="mt-3 space-y-2">
            {autoFiled.map((m) => {
              const trip = m.trips;
              const tripName = trip?.name || "a trip";
              const subject = m.subject || "(no subject)";
              const href = trip
                ? m.filed_date
                  ? `${tripPath(trip, "itinerary")}&date=${m.filed_date}`
                  : tripPath(trip, "itinerary")
                : null;
              const isClearing = clearBusyId === m.id;
              const isUndoing = undoBusyId === m.id;
              const rowBusy = isClearing || isUndoing;
              return (
                <li
                  key={m.id}
                  aria-busy={rowBusy || undefined}
                  className={`flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-white p-3 transition-opacity duration-200 sm:flex-row sm:items-center sm:justify-between ${
                    rowBusy ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink">{subject}</div>
                    <div className="text-xs text-ink-soft">
                      Filed to {tripName}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {href ? (
                      <Link
                        href={href}
                        aria-disabled={rowBusy || undefined}
                        tabIndex={rowBusy ? -1 : undefined}
                        className={`rounded-xl border border-[var(--line-strong)] bg-white px-3 py-1.5 text-sm font-medium text-ink transition hover:border-teal hover:text-teal ${
                          rowBusy ? "pointer-events-none opacity-60" : ""
                        }`}
                      >
                        Go to trip
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleClearAutoFile(m.id)}
                      disabled={rowBusy}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line-strong)] bg-white px-3 py-1.5 text-sm text-ink transition hover:border-teal hover:text-teal disabled:cursor-progress disabled:opacity-60"
                    >
                      {isClearing ? (
                        <>
                          <Spinner className="h-3.5 w-3.5" />
                          <span>{"Clearing\u2026"}</span>
                        </>
                      ) : (
                        "Clear"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUndoAutoFile(m.id)}
                      disabled={rowBusy}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-soft underline underline-offset-2 transition hover:text-teal disabled:cursor-progress disabled:opacity-60"
                    >
                      {isUndoing ? (
                        <>
                          <Spinner className="h-3 w-3" />
                          <span>{"Undoing\u2026"}</span>
                        </>
                      ) : (
                        "Undo"
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {messages.length === 0 ? (
        autoFiled.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-dashed border-[var(--line)] bg-white/60 p-8 text-center text-sm text-ink-soft">
            Nothing in the inbox. Anything forwarded to the address above will
            show up here within about a minute.
          </p>
        ) : null
      ) : (
        <div className="mt-6 space-y-3">
          {messages.map((m) => {
            const isOpen = openId === m.id;
            const isUnknown = m.classification === "unknown";
            const attributed = m.attributed_traveler_id
              ? travelerById.get(m.attributed_traveler_id)
              : null;
            const files = byMessage.get(m.id) || [];
            return (
              <article
                key={m.id}
                className="card overflow-hidden border border-[var(--line)]"
              >
                <header className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {isUnknown ? (
                        <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-amber">
                          Needs a person
                        </span>
                      ) : attributed ? (
                        <span
                          className="rounded-full bg-sand-deep/60 px-2 py-0.5 text-[0.7rem] text-ink-soft"
                          style={
                            attributed.color
                              ? {
                                  boxShadow: `inset 0 0 0 1px ${attributed.color}`,
                                }
                              : undefined
                          }
                        >
                          From {attributed.name}
                        </span>
                      ) : null}
                      <div className="text-xs text-ink-faint">
                        {formatWhen(m.received_at)}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium text-ink">
                      {m.subject || "(no subject)"}
                    </div>
                    <div className="truncate text-xs text-ink-soft">
                      {m.from_name
                        ? `${m.from_name} · ${m.from_email}`
                        : m.from_email}
                    </div>
                    {files.length > 0 && (
                      <div className="mt-2 text-xs text-ink-soft">
                        {files.length === 1
                          ? "1 attachment"
                          : `${files.length} attachments`}
                        : {files.map((f) => f.original_filename).join(", ")}
                      </div>
                    )}
                    <ParsedSummary
                      status={m.parse_status}
                      items={parsedByMessage.get(m.id) || []}
                    />
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenId(isOpen && mode === "file" ? null : m.id);
                        setMode("file");
                      }}
                      className="rounded-lg border border-[var(--line-strong)] bg-white px-3 py-1.5 text-sm text-ink transition hover:border-teal hover:text-teal"
                      disabled={busyId === m.id}
                    >
                      File it
                    </button>
                    {isUnknown && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(isOpen && mode === "trust" ? null : m.id);
                          setMode("trust");
                        }}
                        className="rounded-lg border border-[var(--line-strong)] bg-white px-3 py-1.5 text-sm text-ink transition hover:border-teal hover:text-teal"
                        disabled={busyId === m.id}
                      >
                        Trust sender
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => throwOut(m.id)}
                      className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-ink-soft transition hover:border-rose hover:text-rose"
                      disabled={busyId === m.id}
                    >
                      Throw out
                    </button>
                  </div>
                </header>

                {isOpen && mode === "file" && (
                  <FilePicker
                    upcoming={upcomingTrips}
                    past={pastTrips}
                    travelers={travelers}
                    parsedItems={parsedByMessage.get(m.id) || []}
                    needsTraveler={isUnknown && !m.attributed_traveler_id}
                    initialTravelerId={m.attributed_traveler_id || ""}
                    busy={busyId === m.id}
                    onCancel={() => {
                      setOpenId(null);
                      setMode(null);
                    }}
                    onConfirm={(tripId, travelerId, approveIds) =>
                      fileMessage(m.id, tripId, travelerId, approveIds)
                    }
                  />
                )}

                {isOpen && mode === "trust" && (
                  <TrustPicker
                    travelers={travelers}
                    fromEmail={m.from_email}
                    busy={busyId === m.id}
                    onCancel={() => {
                      setOpenId(null);
                      setMode(null);
                    }}
                    onConfirm={(travelerId) => trustSender(m.id, travelerId)}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilePicker({
  upcoming,
  past,
  travelers,
  parsedItems,
  needsTraveler,
  initialTravelerId,
  busy,
  onCancel,
  onConfirm,
}) {
  const [tripId, setTripId] = useState("");
  const [travelerId, setTravelerId] = useState(initialTravelerId);
  // Parsed items are ticked by default. The whole point of staging is that a
  // person looked at them before they became real itinerary rows -- but the
  // usual case is that the parser got them right and the person is here to
  // agree, not to painstakingly re-select every leg. Ticks are keyed by
  // parsed-item id so a re-render with the same set does not blank them.
  const [approved, setApproved] = useState(() => {
    const s = new Set();
    for (const p of parsedItems || []) s.add(p.id);
    return s;
  });

  function toggle(id) {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canConfirm = Boolean(tripId) && (!needsTraveler || travelerId);
  const approvedCount = approved.size;

  return (
    <div className="border-t border-[var(--line)] bg-sand/40 p-4">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">
        Which trip
      </div>
      <select
        value={tripId}
        onChange={(e) => setTripId(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm text-ink"
      >
        <option value="">Pick a trip</option>
        {upcoming.length > 0 && (
          <optgroup label="Upcoming">
            {upcoming.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
        {past.length > 0 && (
          <optgroup label="Past">
            {past.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {needsTraveler && (
        <>
          <div className="mt-3 text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">
            Who forwarded it
          </div>
          <select
            value={travelerId}
            onChange={(e) => setTravelerId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm text-ink"
          >
            <option value="">Pick a person</option>
            {travelers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </>
      )}

      {parsedItems.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">
            Add to the itinerary
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Aly read these from the message. Untick anything that does not
            belong on the trip; the rest become itinerary items when you file.
          </p>
          <ul className="mt-2 space-y-1.5">
            {parsedItems.map((p) => {
              const checked = approved.has(p.id);
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-ink transition hover:border-teal/60">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-teal"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="mr-2 rounded-full bg-sand-deep/60 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-[0.06em] text-ink-soft">
                        {p.category}
                      </span>
                      <span className="font-medium text-ink">{p.title}</span>
                      {p.item_date ? (
                        <span className="text-ink-soft"> · {p.item_date}</span>
                      ) : null}
                      {p.confidence === "low" ? (
                        <span className="ml-2 text-[0.7rem] text-ink-faint">
                          low confidence
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-ink-soft"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canConfirm || busy}
          onClick={() =>
            onConfirm(tripId, travelerId || null, Array.from(approved))
          }
          className="rounded-lg bg-teal px-4 py-1.5 text-sm font-medium text-on-accent transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? "Filing…"
            : approvedCount > 0
              ? `File and add ${approvedCount} ${approvedCount === 1 ? "item" : "items"}`
              : "File on this trip"}
        </button>
      </div>
    </div>
  );
}

function TrustPicker({ travelers, fromEmail, busy, onCancel, onConfirm }) {
  const [travelerId, setTravelerId] = useState("");

  return (
    <div className="border-t border-[var(--line)] bg-sand/40 p-4">
      <div className="text-sm text-ink">
        Link <span className="font-mono text-ink">{fromEmail}</span> to a person
        in the family. From now on, anything forwarded from that address will be
        attributed to them.
      </div>
      <select
        value={travelerId}
        onChange={(e) => setTravelerId(e.target.value)}
        className="mt-3 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm text-ink"
      >
        <option value="">Pick a person</option>
        {travelers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-ink-soft"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!travelerId || busy}
          onClick={() => onConfirm(travelerId)}
          className="rounded-lg bg-teal px-4 py-1.5 text-sm font-medium text-on-accent transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : "Trust sender"}
        </button>
      </div>
    </div>
  );
}

// One quiet line under the attachment strip that says what the extractor
// made of this message. Deliberately calm: a full approval UI belongs on the
// filed trip, not on the inbox card. Here we only need to signal "there are
// three flights waiting for you" so filing feels like confirming and not
// reading.
function ParsedSummary({ status, items }) {
  if (status === "pending" || status === "running") {
    return <div className="mt-2 text-xs text-ink-faint">Reading this one…</div>;
  }
  if (status === "failed") {
    return (
      <div className="mt-2 text-xs text-ink-faint">
        Aly could not read this one. Filing it will keep the message on the trip
        so you can read it there.
      </div>
    );
  }
  if (!items || items.length === 0) return null;

  const counts = items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
  const parts = CATEGORY_ORDER.filter((k) => counts[k]).map((k) => {
    const n = counts[k];
    return `${n} ${n === 1 ? CATEGORY_LABEL[k].single : CATEGORY_LABEL[k].plural}`;
  });
  if (parts.length === 0) return null;

  return (
    <div className="mt-2 text-xs text-teal">
      Aly read {joinWithAnd(parts)} in this message. Filing it will stage them
      for you to approve.
    </div>
  );
}

const CATEGORY_ORDER = [
  "flight",
  "lodging",
  "cruise",
  "transport",
  "excursion",
  "dining",
  "activity",
  "note",
];
const CATEGORY_LABEL = {
  flight: { single: "flight", plural: "flights" },
  lodging: { single: "hotel night", plural: "hotel bookings" },
  cruise: { single: "cruise booking", plural: "cruise bookings" },
  transport: { single: "transport booking", plural: "transport bookings" },
  excursion: { single: "excursion", plural: "excursions" },
  dining: { single: "restaurant", plural: "restaurants" },
  activity: { single: "activity", plural: "activities" },
  note: { single: "note", plural: "notes" },
};

function joinWithAnd(parts) {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
