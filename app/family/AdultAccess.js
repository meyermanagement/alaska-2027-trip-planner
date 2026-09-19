"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdultAccess({ person, state }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(person.email || "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  async function act(method) {
    setBusy(true); setNote("");
    try {
      const response = await fetch("/api/family/adult-access", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelerId: person.id, email, confirmed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Please try again.");
      setNote(method === "DELETE" ? "Invitation canceled. Login access is still off." : `Invitation sent to ${result.email}. Waiting for their own acceptance.`);
      setOpen(false); setConfirmed(false);
      router.refresh();
    } catch (error) { setNote(error.message); }
    finally { setBusy(false); }
  }
  return <section className="mt-3 rounded-xl border border-line bg-sand/40 p-4">
    <p className="section-label">Their own access</p>
    <p className="mt-1 text-sm text-ink-soft">
      {state === "review" ? "This account’s previous restriction needs an administrator’s review before an invitation can be sent."
        : state === "unavailable" ? "Access status could not be checked. Refresh before trying again."
          : state === "pending" ? "Invitation sent. Access stays off until they accept for themselves."
            : `${person.name} is eligible for an adult invitation. Turning 18 does not turn on login.`}
    </p>
    {!["review", "unavailable"].includes(state) && !open && <div className="mt-3 flex flex-wrap gap-2">
      <button className="btn btn-secondary" disabled={busy} onClick={() => setOpen(true)}>
        {state === "pending" ? "Resend adult invitation" : "Invite to their own account"}
      </button>
      {state === "pending" && <button className="btn btn-ghost" disabled={busy} onClick={() => act("DELETE")}>{busy ? "Canceling…" : "Cancel invitation"}</button>}
    </div>}
    {open && <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); act("POST"); }}>
      <label className="block text-sm font-semibold">Their own email
        <input className="field mt-1 text-base" type="email" value={email} onChange={e => { setEmail(e.target.value); setConfirmed(false); }} required disabled={busy} />
      </label>
      <p className="text-sm text-ink-soft">Use the address saved on their Family profile. They’ll verify it through this invitation and accept the current agreement themselves. They stay a secondary traveler, not a household manager.</p>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} required />
        <span>I confirm this is {person.name}’s own email. Send the invitation to <strong className="break-all">{email || "their email"}</strong>.</span>
      </label>
      <div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={busy || !confirmed}>{busy ? "Sending invitation…" : "Send adult invitation"}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>Not now</button></div>
    </form>}
    {note && <p role="status" className="mt-3 text-sm text-ink">{note}</p>}
  </section>;
}
