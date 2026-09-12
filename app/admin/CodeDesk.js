"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import CopyWord from "./CopyWord";

/**
 * The half of the desk that does things: type an address, send that person their
 * code, and see what each code has done since.
 *
 * One state machine for the whole panel rather than one per row, because only one
 * thing can be happening at a time here and a table where four rows are each
 * separately mid-request is a table that will show two different answers at once.
 * `busy` holds the code (or "invite", or "mint") currently working, and the
 * router is refreshed on success so the row redraws from the database rather than
 * from a guess made in the browser.
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

/** The one sentence that says where a code has got to. */
function stateOf(code) {
  if (code.usedAt) return { chip: "Signed in", tone: "teal" };
  if (code.sentAt) return { chip: "Invite sent", tone: "amber" };
  if (code.assignedEmail) return { chip: "Assigned", tone: "amber" };
  if (code.expiresAt && new Date(code.expiresAt) <= new Date()) {
    return { chip: "Retired", tone: "faint" };
  }
  return { chip: "Spare", tone: "faint" };
}

export default function CodeDesk({ codes = [] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
        setWrong(answer?.error || "That did not go through.");
        return false;
      }
      return answer;
    } catch {
      setWrong("The server could not be reached.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function invite(event) {
    event.preventDefault();
    const answer = await ask({ action: "invite", email, name, note }, "invite");
    if (!answer) return;
    setSaid(`Sent ${answer.code} to ${answer.to}.`);
    setEmail("");
    setName("");
    setNote("");
    router.refresh();
  }

  async function resend(code, to) {
    const answer = await ask({ action: "invite", email: to, code }, code);
    if (!answer) return;
    setSaid(`Sent ${code} to ${to} again.`);
    router.refresh();
  }

  async function act(action, code) {
    const answer = await ask({ action, code }, code);
    if (!answer) return;
    setSaid(
      action === "revoke" ? `${code} retired.` : `${code} is a spare again.`,
    );
    router.refresh();
  }

  async function mint() {
    const answer = await ask({ action: "mint", count: 5 }, "mint");
    if (!answer) return;
    setSaid(`Five new codes: ${answer.codes.join(", ")}.`);
    router.refresh();
  }

  const free = codes.filter(
    (one) =>
      !one.usedAt &&
      !one.assignedEmail &&
      !(one.expiresAt && new Date(one.expiresAt) <= new Date()),
  ).length;

  return (
    <section>
      <h2 className="font-display text-xl font-semibold">Invite a tester</h2>
      <p className="mt-1.5 text-sm text-ink-soft">
        Aly writes to them with a code and a link that fills it in. {free}{" "}
        {free === 1 ? "spare code" : "spare codes"} left.
      </p>

      <form onSubmit={invite} className="card mt-4 space-y-3 p-4">
        <div>
          <label
            htmlFor="beta-email"
            className="text-xs font-semibold uppercase tracking-wide text-ink-soft"
          >
            Email
          </label>
          <input
            id="beta-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="them@example.com"
            className="field mt-1 w-full"
          />
        </div>
        <div>
          <label
            htmlFor="beta-name"
            className="text-xs font-semibold uppercase tracking-wide text-ink-soft"
          >
            Their name
          </label>
          <input
            id="beta-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="So Aly can open with it"
            className="field mt-1 w-full"
          />
        </div>
        <div>
          <label
            htmlFor="beta-note"
            className="text-xs font-semibold uppercase tracking-wide text-ink-soft"
          >
            A line from you
          </label>
          <input
            id="beta-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional, shown as your own aside"
            className="field mt-1 w-full"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy === "invite" || !email}
            className="btn btn-primary"
          >
            {busy === "invite" ? "Sending…" : "Send the invite"}
          </button>
          <button
            type="button"
            onClick={mint}
            disabled={busy === "mint"}
            className="btn btn-ghost btn-sm"
          >
            {busy === "mint" ? "Making…" : "Make five more codes"}
          </button>
          <a
            href="/api/admin/beta/preview"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm"
          >
            See the email
          </a>
        </div>
        {said && <p className="text-sm text-teal">{said}</p>}
        {wrong && <p className="text-sm text-rose">{wrong}</p>}
      </form>

      <h3 className="mt-8 font-display text-lg font-semibold">Codes</h3>
      <ul className="mt-3 space-y-3">
        {codes.map((one) => {
          const state = stateOf(one);
          return (
            <li key={one.code} className="card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold tracking-wide">
                    {one.code}
                  </span>
                  <CopyWord text={one.code} />
                </span>
                <span
                  className={
                    state.tone === "teal"
                      ? "chip text-teal"
                      : state.tone === "amber"
                        ? "chip text-amber"
                        : "chip text-ink-soft"
                  }
                >
                  {state.chip}
                </span>
              </div>

              <div className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
                {one.assignedEmail ? (
                  <p className="break-all">
                    {one.assignedName ? `${one.assignedName} · ` : ""}
                    {one.assignedEmail}
                    {one.sentAt ? ` · sent ${when(one.sentAt)}` : ""}
                    {one.sendCount > 1 ? ` (${one.sendCount} times)` : ""}
                  </p>
                ) : (
                  <p>Nobody yet{one.note ? ` · ${one.note}` : ""}</p>
                )}
                {one.usedAt && (
                  <p className="break-all">
                    Spent {when(one.usedAt)}
                    {one.accountEmail ? ` by ${one.accountEmail}` : ""}
                    {one.lastSignInAt
                      ? ` · last signed in ${when(one.lastSignInAt)}`
                      : ""}
                  </p>
                )}
                {one.usedAt && (
                  <p>
                    {one.furthest
                      ? `Got as far as ${one.furthest}.`
                      : "No screens recorded yet."}
                    {one.lastPath
                      ? ` Last on ${one.lastPath}${
                          one.lastSeenAt ? `, ${when(one.lastSeenAt)}` : ""
                        }.`
                      : ""}
                  </p>
                )}
              </div>

              {!one.usedAt && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {one.assignedEmail && (
                    <button
                      type="button"
                      onClick={() => resend(one.code, one.assignedEmail)}
                      disabled={busy === one.code}
                      className="btn btn-ghost btn-sm"
                    >
                      {busy === one.code ? "Working…" : "Send again"}
                    </button>
                  )}
                  {one.assignedEmail && (
                    <button
                      type="button"
                      onClick={() => act("unassign", one.code)}
                      disabled={busy === one.code}
                      className="btn btn-ghost btn-sm"
                    >
                      Take it back
                    </button>
                  )}
                  {!(
                    one.expiresAt && new Date(one.expiresAt) <= new Date()
                  ) && (
                    <button
                      type="button"
                      onClick={() => act("revoke", one.code)}
                      disabled={busy === one.code}
                      className="btn btn-ghost btn-sm"
                    >
                      Retire
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!codes.length && (
          <li className="text-sm text-ink-soft">No codes on file yet.</li>
        )}
      </ul>
    </section>
  );
}
