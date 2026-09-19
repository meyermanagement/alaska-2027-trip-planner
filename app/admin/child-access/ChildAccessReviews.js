"use client";

import { useState } from "react";
import { VERIFICATION_METHODS } from "@/lib/beta/childAccess";

function Review({ row, onSaved }) {
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(decision) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/child-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: row.id, decision, method, reference, reviewConfirmed: confirmed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The review could not be saved.");
      onSaved(row.id);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <article className="card p-5" aria-busy={busy}>
    <h2 className="font-semibold">{row.travelers?.name || "Child access request"}</h2>
    <p className="mt-1 text-sm text-ink-soft">Requested: trip access{row.ai_requested ? " and Ask Aly" : " only"}.</p>
    <p className="mt-2 break-all text-xs text-ink-faint">Request {row.id}</p>
    <fieldset disabled={busy} className="mt-4 space-y-3">
      <legend className="mb-2 text-sm font-semibold">Record a completed parent verification</legend>
      <label className="block text-sm">Verification method
        <select className="field mt-1 w-full" value={method} onChange={event => setMethod(event.target.value)}>
          <option value="">Choose the method used</option>
          {VERIFICATION_METHODS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label className="block text-sm">Restricted verification record ID
        <input className="field mt-1 w-full" value={reference} maxLength={160} onChange={event => setReference(event.target.value)} placeholder="Reference ID only" />
      </label>
      <p className="text-xs text-ink-soft">Do not enter names, ID numbers, documents, or public file links. The evidence must already be held in the approved restricted verification process.</p>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        <span>I completed the authorized verification procedure and checked the parent’s identity and recorded choices. I am not the requesting parent.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!method || !reference || !confirmed} onClick={() => submit("verified")}>{busy ? "Saving review…" : "Record verification"}</button>
        <button className="btn btn-secondary" disabled={!method || !reference || !confirmed} onClick={() => submit("rejected")}>Not verified</button>
      </div>
    </fieldset>
    {error && <p className="mt-3 text-sm" role="alert">{error}</p>}
  </article>;
}

export default function ChildAccessReviews({ requests = [] }) {
  const [rows, setRows] = useState(requests);
  const [saved, setSaved] = useState(false);
  return <section className="mt-6 space-y-4">
    <div className="card p-5">
      <p className="font-semibold">Verification does not activate access</p>
      <p className="mt-2 text-sm text-ink-soft">Only record a verification you have actually completed under the approved procedure. The child-specific notice, provider terms, scoped chat, and parental review and deletion controls still require release approval.</p>
    </div>
    {saved && <p role="status" className="text-sm">Review saved. Child chat remains off.</p>}
    {rows.length === 0 && <p className="text-sm text-ink-soft">No requests are waiting for verification.</p>}
    {rows.map(row => <Review key={row.id} row={row} onSaved={id => { setRows(current => current.filter(item => item.id !== id)); setSaved(true); }} />)}
  </section>;
}
