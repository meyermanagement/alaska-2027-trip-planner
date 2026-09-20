"use client";

import { useRef, useState } from "react";

function Invitation({ person, practice, onBusy }) {
  const [email, setEmail] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function send() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); onBusy(true); setError("");
    try {
      if (!practice) {
        const response = await fetch("/api/welcome/invite", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ travelerId: person.id, accessLevel: person.access_level, email: email.trim(), confirmed: true }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "The invitation could not be sent.");
      }
      setSent(true);
    } catch (err) { setError(err.message); }
    finally { inFlight.current = false; setBusy(false); onBusy(false); }
  }
  return <section className="rounded-xl border border-line p-4">
    <h3 className="font-semibold">{person.name}</h3>
    <p className="mt-1 text-xs text-ink-soft">{person.access_level === "primary" ? "Help plan · Primary traveler" : "Travel with us · Secondary traveler"}</p>
    {sent ? <p className="mt-3 text-sm text-teal" role="status">{practice ? "Practice only: nothing was sent to" : "Invitation sent to"} {email}. {practice ? "" : "They’ll sign in and complete their own consent."}</p>
      : <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); if (review) send(); else setReview(true); }}>
        {!review ? <>
          <label className="block text-sm font-semibold">Their own email
            <input className="field mt-1" type="email" required maxLength={254} autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <button className="btn btn-secondary btn-sm" type="submit">Review invitation</button>
        </> : <>
          <p className="text-sm leading-relaxed">Invite <strong>{person.name}</strong> at <strong className="break-all">{email.trim()}</strong>?</p>
          <p className="text-xs leading-relaxed text-ink-soft">{person.access_level === "primary"
            ? "This gives them full household planning access, including shared Wallet and documents. It is not limited to one trip."
            : "They’ll only see non-draft trips they’re included on and manage their own checklists. Ask Aly requires their own consent."}</p>
          <p className="text-xs leading-relaxed text-ink-soft">Confirm that this is their own email. Saving it connects that address to their traveler profile, even if email delivery needs a retry.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Sending…" : practice ? "Preview sending invitation" : "Confirm and send invitation"}</button>
            <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => { setReview(false); setError(""); }}>Change email</button>
          </div>
        </>}
        {error && <p className="text-sm text-rose" role="alert">{error}</p>}
      </form>}
  </section>;
}

export default function WelcomeInvitations({ people, practice = false, onContinue }) {
  const [busyCount, setBusyCount] = useState(0);
  return <section className="card mt-6 max-w-2xl p-5" aria-labelledby="welcome-invitations-title">
    <p className="section-label text-teal">{practice ? "Practice · Nothing saved" : "Family details saved"}</p>
    <h2 className="mt-2 text-xl font-semibold" id="welcome-invitations-title">Invite them when you’re ready.</h2>
    <p className="mt-2 text-sm leading-relaxed text-ink-soft">Your access choices are {practice ? "shown below" : "saved"}. No emails have been sent automatically. Review each invitation now, or do this later from their profile in Family.</p>
    <div className="mt-5 space-y-4">{people.map(person => <Invitation key={person.id} person={person} practice={practice} onBusy={value => setBusyCount(count => count + (value ? 1 : -1))} />)}</div>
    <button className="btn btn-primary mt-5" disabled={busyCount > 0} onClick={onContinue}>Continue to About you</button>
    <p className="mt-2 text-xs text-ink-soft">Any invitations you haven’t sent can be set up later in Family.</p>
  </section>;
}
