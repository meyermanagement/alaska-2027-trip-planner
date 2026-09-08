"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  upcomingTrips,
  pastTrips,
  travelers,
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState(null);
  const [mode, setMode] = useState(null); // "file" | "trust" | null
  const [busyId, setBusyId] = useState(null);
  const [copied, setCopied] = useState(false);

  const byMessage = useMemo(() => {
    const m = new Map();
    for (const a of attachments || []) {
      const list = m.get(a.message_id) || [];
      list.push(a);
      m.set(a.message_id, list);
    }
    return m;
  }, [attachments]);

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

  async function fileMessage(id, tripId, travelerId) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/inbox/${id}/file`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, traveler_id: travelerId }),
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

      {messages.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-[var(--line)] bg-white/60 p-8 text-center text-sm text-ink-soft">
          Nothing in the inbox. Anything forwarded to the address above will
          show up here within about a minute.
        </p>
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
                    needsTraveler={isUnknown && !m.attributed_traveler_id}
                    initialTravelerId={m.attributed_traveler_id || ""}
                    busy={busyId === m.id}
                    onCancel={() => {
                      setOpenId(null);
                      setMode(null);
                    }}
                    onConfirm={(tripId, travelerId) =>
                      fileMessage(m.id, tripId, travelerId)
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
  needsTraveler,
  initialTravelerId,
  busy,
  onCancel,
  onConfirm,
}) {
  const [tripId, setTripId] = useState("");
  const [travelerId, setTravelerId] = useState(initialTravelerId);

  const canConfirm = Boolean(tripId) && (!needsTraveler || travelerId);

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
          onClick={() => onConfirm(tripId, travelerId || null)}
          className="rounded-lg bg-teal px-4 py-1.5 text-sm font-medium text-on-accent transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Filing…" : "File on this trip"}
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
        Link{" "}
        <span className="font-mono text-ink">{fromEmail}</span> to a person in
        the family. From now on, anything forwarded from that address will be
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
