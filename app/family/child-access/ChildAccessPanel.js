"use client";

import { useEffect, useState } from "react";
import {
  CHILD_ACCESS_NOTICE, CHILD_STATE_LABELS, childRequestState,
} from "@/lib/beta/childAccess";

export default function ChildAccessPanel({ initial = null }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(null);
  const [busy, setBusy] = useState(null);
  const [choices, setChoices] = useState({ guardian: false, collection: false, askAly: false, aiDisclosure: false });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/family/child-access", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The child access list could not be loaded.");
      setData(result);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (!initial) load(); }, [initial]);

  async function save(child, request = null) {
    setBusy(child.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/family/child-access", {
        method: request ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request ? { requestId: request.id }
          : { travelerId: child.id, ...choices }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "That could not be saved. Please try again.");
      // Keep the indicator until the server confirms the saved record. No
      // optimistic permission state and no delayed router refresh to race.
      setData(current => ({
        ...current,
        requests: [...current.requests.filter(row => row.traveler_id !== child.id), result.request],
      }));
      setEditing(null);
      setConfirmWithdraw(null);
      setNotice(request ? `${child.name}’s request was withdrawn. Child chat is off.`
        : `Request saved for ${child.name}. Parent verification is next. Child chat is still off.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  return (
    <section className="mt-6 space-y-4" aria-label="Parent-managed child access">
      <div className="card p-5">
        <p className="text-sm font-semibold text-teal">Parent-managed access</p>
        <h2 className="mt-2 text-xl font-semibold">Their trips. Your permission.</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Start a request for a child in your household. A request or a completed
          verification does not turn access on: child chat stays off until the
          child-access release is approved.
        </p>
        <p className="mt-3 text-sm text-ink-soft">
          You can choose trip access without requesting Ask Aly. No adult agreement
          will be presented for your child to accept.
        </p>
      </div>
      {error && <div role="alert" className="card border-rose/40 p-4 text-sm">
        <p>{error}</p>
        {!data && <button className="btn btn-secondary mt-3" disabled={loading} onClick={load}>Try loading again</button>}
      </div>}
      {notice && <p role="status" className="card p-4 text-sm">{notice}</p>}
      {loading && <p role="status" className="text-sm text-ink-soft">Loading child access…</p>}
      {!loading && data?.children?.length === 0 && <div className="card p-5">
        <p>No child profiles are ready for setup. Add a child’s birthday in Family &amp; pets first.</p>
        <a className="btn btn-secondary mt-3" href="/family">Open Family &amp; pets</a>
      </div>}
      {data?.children?.map(child => {
        const request = data.requests.find(row => row.traveler_id === child.id);
        const state = childRequestState(request);
        const activeRequest = state === "pending" || state === "verified";
        const isEditing = editing === child.id;
        return <article key={child.id} className="card p-5" aria-busy={busy === child.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{child.name}</h2>
              <p className="mt-1 text-sm text-ink-soft">{CHILD_STATE_LABELS[state]}</p>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">Child chat off</span>
          </div>
          {activeRequest && <p className="mt-3 text-sm text-ink-soft">
            Requested: trip access{request.ai_requested ? " and Ask Aly" : " only"}.
            {state === "verified"
              ? " Verification has been recorded; activation is still on hold."
              : " Contact admin@alyeska.app from your own account to arrange parent verification. Do not email identity documents."}
          </p>}
          {child.access_level !== "secondary" ? <p className="mt-3 text-sm">
            Set this child’s access to Secondary traveler in Family &amp; pets before requesting access.
          </p> : !activeRequest && !isEditing && <button
            className="btn btn-secondary mt-4" disabled={Boolean(busy)}
            onClick={() => {
              setEditing(child.id); setError(""); setNotice("");
              setChoices({ guardian: false, collection: false, askAly: false, aiDisclosure: false });
            }}>Set up child access</button>}
          {isEditing && <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); save(child); }}>
            <fieldset disabled={Boolean(busy)} className="space-y-4">
              <legend className="mb-3 font-semibold">Parent notice and choices</legend>
              <div className="space-y-3 rounded-xl border border-line p-4">
                {CHILD_ACCESS_NOTICE.map(item => <div key={item.title}>
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{item.body}</p>
                </div>)}
                <a href="/privacy" className="text-sm underline" target="_blank" rel="noreferrer">Read the current privacy policy</a>
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={choices.guardian}
                  onChange={event => setChoices(c => ({ ...c, guardian: event.target.checked }))} />
                <span>I am {child.name}’s parent or legal guardian and am requesting access on their behalf.</span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={choices.collection}
                  onChange={event => setChoices(c => ({ ...c, collection: event.target.checked }))} />
                <span>I have read this notice. Save my request for parent-managed trip access; do not activate it yet.</span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={choices.askAly}
                  onChange={event => setChoices(c => ({ ...c, askAly: event.target.checked, aiDisclosure: false }))} />
                <span>Also request Ask Aly. This is optional.</span>
              </label>
              {choices.askAly && <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={choices.aiDisclosure}
                  onChange={event => setChoices(c => ({ ...c, aiDisclosure: event.target.checked }))} />
                <span>I understand the proposed Google Gemini processing described above and want it included in the parent-verification process. This does not turn chat on.</span>
              </label>}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={!choices.guardian || !choices.collection || (choices.askAly && !choices.aiDisclosure)}>
                  {busy === child.id ? "Saving request…" : "Save request"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </fieldset>
          </form>}
          {activeRequest && confirmWithdraw !== child.id && <button className="btn btn-secondary mt-4"
            disabled={Boolean(busy)} onClick={() => setConfirmWithdraw(child.id)}>Withdraw request</button>}
          {confirmWithdraw === child.id && <div className="mt-4 rounded-xl border border-line p-4">
            <p className="text-sm">Withdraw {child.name}’s request? This cancels verification and any recorded permission choices. It does not delete their traveler profile.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => save(child, request)}>
                {busy === child.id ? "Withdrawing…" : "Withdraw request"}
              </button>
              <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setConfirmWithdraw(null)}>Keep request</button>
            </div>
          </div>}
        </article>;
      })}
    </section>
  );
}
