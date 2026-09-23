"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PageHeader from "@/components/PageHeader";
import FilterBar from "@/components/FilterBar";
import { WAITLIST_STATES, travelersLabel } from "@/lib/beta/waitlist";
import CopyWord from "../CopyWord";

/**
 * The waitlist, worked through: who asked in, and a code sent to each.
 *
 * Built from the beta desk's parts on purpose -- the same card rows, chips,
 * copy button, filter bar and invite form -- so the two screens read as one
 * tool. Sending goes through the desk's own invite action, which picks the
 * oldest spare code (or makes one), pairs it with the address before the mail
 * goes out, and resends the same code rather than a second one.
 *
 * One request at a time for the whole list, as on the desk: `busy` holds the id
 * of the row that is working, and the page redraws from the database after.
 */

function when(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function day(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const CHIP = {
  waiting: { label: "Waiting", className: "chip text-ink-soft" },
  invited: { label: "Invite sent", className: "chip text-amber" },
  joined: { label: "Joined", className: "chip text-teal" },
};

const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-ink-soft";

export default function WaitlistDesk({ rows = [], keyMissing, readError }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [who, setWho] = useState("");
  const [open, setOpen] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [said, setSaid] = useState(null);
  const [wrong, setWrong] = useState(null);

  async function ask(body, tag) {
    setBusy(tag);
    setSaid(null);
    setWrong(null);
    try {
      const res = await fetch("/api/admin/beta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const answer = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWrong({ id: tag, text: answer?.error || "That did not go through." });
        return false;
      }
      return answer;
    } catch {
      setWrong({ id: tag, text: "The server could not be reached." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  function start(row) {
    setOpen(row.id);
    setConfirming(null);
    // The name they gave on the form, so Aly opens with it unless you change it.
    setName(row.firstName || "");
    setNote("");
    setSaid(null);
    setWrong(null);
  }

  async function send(event, row) {
    event.preventDefault();
    const answer = await ask(
      { action: "invite", email: row.email, name, note },
      row.id,
    );
    if (!answer) return;
    setSaid({ id: row.id, text: `Sent ${answer.code}.` });
    setOpen(null);
    router.refresh();
  }

  async function resend(row) {
    const answer = await ask(
      { action: "invite", email: row.email, code: row.code },
      row.id,
    );
    if (!answer) return;
    setSaid({ id: row.id, text: `Sent ${answer.code} again.` });
    router.refresh();
  }

  async function remove(row) {
    const answer = await ask({ action: "waitlist_remove", id: row.id }, row.id);
    if (!answer) return;
    setConfirming(null);
    router.refresh();
  }

  const counts = useMemo(() => {
    const byState = { waiting: 0, invited: 0, joined: 0 };
    let organizers = 0;
    for (const row of rows) {
      byState[row.state] += 1;
      if (row.organizer) organizers += 1;
    }
    return { byState, organizers, families: rows.length - organizers };
  }, [rows]);

  const shown = rows.filter(
    (row) =>
      (!status || row.state === status) &&
      (!who || (who === "organizers" ? row.organizer : !row.organizer)),
  );

  const waiting = counts.byState.waiting;

  return (
    <main className="screen px-5 pb-16 pt-7">
      <PageHeader
        above={
          <a
            href="/admin"
            className="text-xs font-semibold uppercase tracking-[0.09em] text-ink-soft hover:text-teal"
          >
            Admin
          </a>
        }
        title="Waitlist"
        count={rows.length || undefined}
        subtitle={
          keyMissing
            ? "The server has no service-role key set, so the list cannot be read."
            : readError
              ? `The list could not be read: ${readError}`
              : rows.length
                ? `${waiting} waiting. Send one a code and Aly writes to them with a link that fills it in.`
                : "Nobody yet. People join from the form at the foot of the front page."
        }
        action={
          <a
            href="/api/admin/beta/preview"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm"
          >
            See the email
          </a>
        }
        className="mb-5"
      />

      {rows.length ? (
        <FilterBar
          className="mb-4"
          tally={{ shown: shown.length, total: rows.length, noun: "person", plural: "people" }}
          onClear={() => {
            setStatus("");
            setWho("");
          }}
          groups={[
            {
              id: "status",
              legend: "Status",
              value: status,
              onChange: setStatus,
              options: [
                { id: "", label: "All", count: rows.length },
                ...WAITLIST_STATES.map((one) => ({
                  id: one.id,
                  label: one.label,
                  count: counts.byState[one.id],
                })),
              ],
            },
            {
              id: "who",
              legend: "Who",
              value: who,
              onChange: setWho,
              options: [
                { id: "", label: "All", count: rows.length },
                { id: "families", label: "Families", count: counts.families },
                { id: "organizers", label: "Organizers", count: counts.organizers },
              ],
            },
          ]}
        />
      ) : null}

      <ul className="space-y-3">
        {shown.map((row) => {
          const chip = CHIP[row.state];
          const travelers = travelersLabel(row.householdSize);
          const working = busy === row.id;
          return (
            <li key={row.id} className="card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere] sm:text-base">
                  {row.fullName || row.email}
                </span>
                <span className={chip.className}>{chip.label}</span>
              </div>
              {row.fullName ? (
                <p className="mt-0.5 text-sm text-ink-soft [overflow-wrap:anywhere]">{row.email}</p>
              ) : null}

              <div className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
                <p>
                  {[
                    row.organizer ? "Organizes for a group" : null,
                    travelers,
                    row.listedAt ? `on the list since ${day(row.listedAt)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {row.code ? (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono font-semibold tracking-wide text-ink">
                      {row.code}
                    </span>
                    <CopyWord text={row.code} />
                    <span>
                      {row.usedAt
                        ? `spent ${when(row.usedAt)}`
                        : row.sentAt
                          ? `sent ${when(row.sentAt)}${row.sendCount > 1 ? ` (${row.sendCount} times)` : ""}`
                          : "assigned, not sent yet"}
                    </span>
                  </p>
                ) : null}
                {row.viaAccount ? (
                  <p>Already has an account, so there is nothing to send.</p>
                ) : null}
              </div>

              {open === row.id ? (
                <form
                  onSubmit={(event) => send(event, row)}
                  className="mt-3 space-y-3 border-t border-[var(--line)] pt-3"
                >
                  <div>
                    <label htmlFor={`wl-name-${row.id}`} className={labelClass}>
                      Their name
                    </label>
                    <input
                      id={`wl-name-${row.id}`}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="So Aly can open with it"
                      className="field mt-1 w-full"
                    />
                  </div>
                  <div>
                    <label htmlFor={`wl-note-${row.id}`} className={labelClass}>
                      A line from you
                    </label>
                    <input
                      id={`wl-note-${row.id}`}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Optional, shown as your own aside"
                      className="field mt-1 w-full"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={working}
                      className="btn btn-primary btn-sm"
                    >
                      {working ? "Sending…" : "Send the invite"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(null)}
                      disabled={working}
                      className="btn btn-ghost btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : confirming === row.id ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-sm">Take this address off the list?</span>
                  <button
                    type="button"
                    onClick={() => remove(row)}
                    disabled={working}
                    className="btn btn-ghost btn-sm text-rose"
                  >
                    {working ? "Removing…" : "Remove"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={working}
                    className="btn btn-ghost btn-sm"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {row.state === "waiting" ? (
                    <button
                      type="button"
                      onClick={() => start(row)}
                      disabled={Boolean(busy)}
                      className="btn btn-primary btn-sm"
                    >
                      Send a code
                    </button>
                  ) : null}
                  {row.state === "invited" ? (
                    <button
                      type="button"
                      onClick={() => resend(row)}
                      disabled={Boolean(busy)}
                      className="btn btn-ghost btn-sm"
                    >
                      {working ? "Sending…" : "Send again"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(row.id);
                      setOpen(null);
                    }}
                    disabled={Boolean(busy)}
                    className="btn btn-ghost btn-sm"
                  >
                    Remove
                  </button>
                </div>
              )}

              {said?.id === row.id ? (
                <p className="mt-2 text-sm text-teal">{said.text}</p>
              ) : null}
              {wrong?.id === row.id ? (
                <p className="mt-2 text-sm text-rose">{wrong.text}</p>
              ) : null}
            </li>
          );
        })}
        {rows.length && !shown.length ? (
          <li className="text-sm text-ink-soft">Nobody matches those filters.</li>
        ) : null}
      </ul>
    </main>
  );
}
