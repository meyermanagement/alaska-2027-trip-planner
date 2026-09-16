"use client";

import { useState } from "react";
import { SUPPORT_EMAIL } from "@/lib/beta/agreement";

/**
 * The way out that actually takes the data with it.
 *
 * Withdrawing consent puts somebody back outside the agreement and leaves their
 * trips alone. This is the other thing, and the terms and the privacy policy both
 * promise it in these words: deleting your account in Settings removes your
 * household's data within 30 days. It has to be here, in Settings, reachable
 * without an email to support, or the promise is a paragraph.
 *
 * The hard part is not the button, it is that "my account" means two different
 * sizes of thing depending on who else is in the household, and the person
 * pressing it means the larger one. So the screen says which of the two is about
 * to happen, in the household's own name, before there is anything to press:
 *
 *   - alone in it        the household goes too, and the copy says so plainly
 *   - others still in it only this seat goes, and their trips are untouched
 *   - last owner of it   refused, with the two ways forward spelled out
 *
 * The typed confirmation is only asked where a household is being destroyed. A
 * dialog somebody clicked through twice is not evidence they meant to delete four
 * years of another person's trips; typing the household's name is. Where only a
 * seat is going, asking somebody to type is theater -- the thing being deleted is
 * their own, and it is recoverable by signing up again.
 *
 * The route decides all of this again from the membership. Nothing here is a
 * permission; it is the same answer, said early, so nobody meets a refusal after
 * they have already braced for the delete.
 */
export default function DeleteAccountControl({
  householdName = "",
  others = 0,
  role = null,
  lastOwner = false,
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  // Set when the last owner chooses to take the household with them rather than
  // hand it over. Until then their button is refused on purpose.
  const [takingHousehold, setTakingHousehold] = useState(false);

  const alone = others === 0;
  const household = alone || takingHousehold;
  const name = householdName || "your household";
  const needsTyping = household && Boolean(householdName);
  const typedOk = !needsTyping || typed.trim() === householdName.trim();

  async function remove() {
    setBusy(true);
    setFailed("");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: household ? "household" : "member",
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
      // Out of the app entirely rather than back to a screen that will try to
      // load a household that no longer exists.
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

  return (
    <section className="no-print">
      <h2 className="font-display text-xl font-semibold">
        Delete your account
      </h2>

      {!open ? (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            {alone
              ? `You are the only person in ${name}, so this removes the household with your login: trips, travelers, documents, packing lists, and forwarded email.`
              : `${name} has ${others === 1 ? "one other member" : `${others} other members`}, so the household's trips and documents stay with them. What goes is your login, your profile, your conversations with Aly, and your diagnostics.`}
          </p>
          <button
            type="button"
            className="btn btn-ghost mt-4 text-sm text-rose"
            onClick={() => setOpen(true)}
          >
            Delete my account
          </button>
        </>
      ) : (
        <div className="card mt-3 px-4 py-4">
          {/* The refusal, before anything else on the panel. Somebody who cannot
              do this yet should not have to read the consequences of a delete
              they are about to be told they cannot make. */}
          {lastOwner && !takingHousehold ? (
            <>
              <p className="text-sm text-ink">
                You are the last owner of {name}, and {others}{" "}
                {others === 1 ? "person is" : "people are"} still in it.
                Deleting only your seat would leave a household nobody can
                administer.
              </p>
              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                <li>
                  Make somebody else an owner on the Family screen, then come
                  back here and delete your account.
                </li>
                <li>Or delete the whole household along with your account.</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  onClick={() => setOpen(false)}
                >
                  Never mind
                </button>
                <button
                  type="button"
                  className="btn btn-ghost text-sm text-rose"
                  onClick={() => setTakingHousehold(true)}
                >
                  Delete the whole household
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink">
                {household
                  ? `This deletes ${name} and everything in it.`
                  : "This deletes your login and everything held for it."}
              </p>

              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                {household ? (
                  <>
                    <li>
                      Trips, itineraries, packing lists, travelers, pets,
                      documents, insurance, and the forwarded email history.
                    </li>
                    <li>
                      Uploaded files are removed from storage as part of this,
                      and any calendar subscription link stops working.
                    </li>
                    {others > 0 && (
                      <li className="text-rose">
                        {others === 1
                          ? "One other member"
                          : `${others} other members`}{" "}
                        will lose access to all of it.
                      </li>
                    )}
                  </>
                ) : (
                  <>
                    <li>
                      Your login, profile, conversations with Aly, feedback, and
                      diagnostics.
                    </li>
                    <li>
                      {name} keeps its trips and documents. Your traveler stays
                      so the household still packs for you, without a login
                      attached.
                    </li>
                  </>
                )}
                <li>
                  It cannot be undone, and we cannot recover it afterward.
                  Backups are overwritten on their own cycle within 30 days.
                </li>
              </ul>

              {needsTyping && (
                <label className="mt-4 block text-sm">
                  <span className="text-ink">
                    Type <span className="font-semibold">{householdName}</span>{" "}
                    to confirm.
                  </span>
                  <input
                    type="text"
                    className="input mt-2 w-full"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    disabled={busy}
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

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  onClick={() => {
                    setOpen(false);
                    setTyped("");
                    setTakingHousehold(false);
                    setFailed("");
                  }}
                  disabled={busy}
                >
                  Keep my account
                </button>
                <button
                  type="button"
                  className="btn btn-primary text-sm"
                  onClick={remove}
                  disabled={busy || !typedOk}
                >
                  {busy
                    ? "Deleting\u2026"
                    : household
                      ? "Delete household and account"
                      : "Delete my account"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {role === "member" && !open && (
        <p className="mt-3 text-xs text-ink-soft">
          Questions, or want it done for you? {SUPPORT_EMAIL}
        </p>
      )}
    </section>
  );
}
