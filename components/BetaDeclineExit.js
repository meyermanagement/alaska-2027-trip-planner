"use client";

import { useState } from "react";
import { SUPPORT_EMAIL } from "@/lib/beta/agreement";

/**
 * The way out of the gate for somebody who reads the agreement and decides no.
 *
 * The gate had no exit. Every screen in the set treats refusing a *question* as a
 * real answer -- decline AI processing and you carry on with Aly off -- but
 * refusing the agreement itself had nowhere to go: a chromeless screen, a dead
 * Continue, and no menu, so the only way to say no was to close the tab. The
 * account stays, the household the sign-in created stays, and the person who
 * decided not to take part has been left holding data they never agreed to
 * store. Both stores read that as consent obtained by leaving no alternative,
 * and it is also just discourteous.
 *
 * So there are two ways out, and the difference between them is what happens to
 * the data:
 *
 *   - Sign out and think about it. Nothing is recorded, the gate is still there
 *     next time, and the account is untouched.
 *   - Delete the account now, from inside the gate, before agreeing to anything.
 *
 * The second is the one that matters legally, which is why /api/account/delete is
 * in CONSENT_OPEN_PREFIXES: a tester who declines has to be able to reach the
 * delete without first agreeing to the terms they are declining. A delete that
 * requires consent to reach is not a way out of consent.
 *
 * The context comes from the route's own GET rather than from the page, because
 * this is behind a click and a moment of "checking" is honest here -- unlike the
 * Settings panel, which is on screen from the first paint and has to be right
 * immediately.
 *
 * In practice mode the buttons are inert. Rehearsing the exit is worth doing;
 * signing the rehearsing tester out of the app, or deleting their household, is
 * not.
 */
export default function BetaDeclineExit({ practice = false }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");

  async function reveal() {
    setOpen(true);
    if (scope || practice) return;
    setLoading(true);
    try {
      const res = await fetch("/api/account/delete", { method: "GET" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "");
      setScope(body);
    } catch {
      // No numbers rather than wrong numbers. The panel falls back to the
      // cautious wording and the route decides the scope anyway.
      setScope({ householdName: "", others: 0, lastOwner: false });
    } finally {
      setLoading(false);
    }
  }

  const householdName = scope?.householdName || "";
  const others = scope?.others || 0;
  const lastOwner = Boolean(scope?.lastOwner);
  const needsTyping = others === 0 && Boolean(householdName);
  const typedOk = !needsTyping || typed.trim() === householdName.trim();

  async function remove() {
    if (practice) return;
    setBusy(true);
    setFailed("");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: others === 0 ? "household" : "member",
          confirm: typed,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.ok !== true) {
        throw new Error(
          body?.error ||
            "We could not delete the account. Nothing was removed.",
        );
      }
      window.location.assign("/login");
    } catch (err) {
      setFailed(
        err?.message === "Failed to fetch"
          ? "No connection. Nothing was deleted."
          : err?.message || "We could not delete the account.",
      );
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <p className="mt-8 border-t border-[var(--line)] pt-4 text-xs text-ink-soft">
        <button
          type="button"
          className="underline"
          onClick={reveal}
          aria-expanded={false}
        >
          I do not want to take part
        </button>
      </p>
    );
  }

  return (
    <div className="mt-8 border-t border-[var(--line)] pt-4">
      <h2 className="font-display text-lg font-semibold">
        You do not have to agree
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        Nothing on these screens has been recorded yet. There are two ways to
        stop here, and they differ in what happens to the account signing in
        created.
      </p>

      <div className="mt-4 space-y-4">
        <div className="card px-4 py-3">
          <p className="text-sm font-semibold text-ink">
            Sign out and leave it
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            No answers are recorded and the account stays as it is. These
            screens will be here if you come back.
          </p>
          <form action="/auth/signout" method="post" className="mt-3">
            <button
              className="btn btn-ghost text-sm"
              disabled={practice || busy}
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="card px-4 py-3">
          <p className="text-sm font-semibold text-ink">
            Delete the account now
          </p>

          {loading ? (
            <p className="mt-1 text-sm text-ink-soft">
              {"Checking what is held\u2026"}
            </p>
          ) : lastOwner ? (
            <p className="mt-1 text-sm text-ink-soft">
              You are the last owner of {householdName || "a household"} and{" "}
              {others} {others === 1 ? "other person is" : "other people are"}{" "}
              still in it, so it cannot be deleted from here without taking
              their trips with it. Sign out, or write to {SUPPORT_EMAIL} and we
              will sort it out with you.
            </p>
          ) : others > 0 ? (
            <p className="mt-1 text-sm text-ink-soft">
              This removes your login, your profile, and anything recorded for
              you. {householdName || "The household"} keeps its trips, because
              they are not only yours.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">
              You are the only person here, so this removes everything the
              sign-in created: {householdName || "the household"}, its trips,
              any travelers, and any files. It cannot be undone.
            </p>
          )}

          {!loading && !lastOwner && needsTyping && (
            <label className="mt-3 block text-sm">
              <span className="text-ink">
                Type <span className="font-semibold">{householdName}</span> to
                confirm.
              </span>
              <input
                type="text"
                className="input mt-2 w-full"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={practice || busy}
                aria-label={`Type ${householdName} to confirm deletion`}
              />
            </label>
          )}

          {failed && (
            <p role="alert" className="mt-3 text-sm text-rose">
              {failed}{" "}
              <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
                Write to us
              </a>{" "}
              and we will finish it by hand.
            </p>
          )}

          {!lastOwner && (
            <button
              type="button"
              className="btn btn-ghost mt-3 text-sm text-rose"
              onClick={remove}
              disabled={practice || busy || loading || !typedOk}
            >
              {busy ? "Deleting\u2026" : "Delete my account"}
            </button>
          )}
        </div>
      </div>

      {practice && (
        <p className="mt-3 text-xs text-ink-soft">
          Practice. Both buttons are turned off here, so nothing signs you out
          and nothing is deleted.
        </p>
      )}

      <button
        type="button"
        className="btn btn-ghost mt-4 text-sm"
        onClick={() => {
          setOpen(false);
          setTyped("");
          setFailed("");
        }}
      >
        Back to the agreement
      </button>
    </div>
  );
}
