"use client";
import { useEffect, useState } from "react";
import { MINOR_REVIEW_NOTICE } from "@/lib/beta/minorReview";

export default function ChildAccessPanel({ initial = null }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const [confirmOff, setConfirmOff] = useState(null);
  const [busy, setBusy] = useState(null);
  const [choices, setChoices] = useState({ guardian: false, collection: false });
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/family/child-access", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Child access could not be loaded.");
      setData(result);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (!initial) load(); }, [initial]);
  async function save(child, enabled) {
    setBusy(child.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/family/child-access", {
        method: enabled ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelerId: child.id, ...choices }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Access could not be changed. Please try again.");
      setData(current => ({ ...current, grants: [
        ...current.grants.filter(row => row.traveler_id !== child.id), result.grant,
      ] }));
      setEditing(null); setConfirmOff(null);
      setNotice(enabled ? `${child.name} can now review their itinerary and packing. Ask Aly stays unavailable.`
        : `${child.name}’s trip review access is off.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  return <section className="mt-6 space-y-4" aria-label="Parent-managed child access">
    <div className="card p-5">
      <p className="text-sm font-semibold text-teal">For travelers under 18</p>
      <h2 className="mt-2 text-xl font-semibold">Itinerary &amp; packing review</h2>
      <p className="mt-2 text-sm text-ink-soft">Their own trips and packing lists, view only. No Ask Aly, uploads, edits, or check-offs.</p>
    </div>
    {error && <div role="alert" className="card p-4 text-sm"><p>{error}</p>
      {!data && <button className="btn btn-secondary mt-3" disabled={loading} onClick={load}>Try again</button>}
    </div>}
    {notice && <p role="status" className="card p-4 text-sm">{notice}</p>}
    {loading && <p role="status">Loading child access…</p>}
    {!loading && data?.children?.length === 0 && <p className="card p-5">No minor profiles found. Add their birthday in Family &amp; pets first.</p>}
    {data?.children?.map(child => {
      const grant = data.grants.find(row => row.traveler_id === child.id);
      const enabled = grant?.enabled === true;
      return <article key={child.id} className="card p-5" aria-busy={busy === child.id}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{child.name}</h2>
          <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{enabled ? "Review enabled" : "Review off"}</span>
        </div>
        {child.access_level !== "secondary" ? <p className="mt-3 text-sm">Set their access to Secondary traveler in Family &amp; pets first.</p>
          : !child.user_id ? <p className="mt-3 text-sm">Have them sign in once using the email on their traveler profile, then enable review here. They will see only the parent-setup screen until you enable it.</p>
          : !enabled && editing !== child.id && <button className="btn btn-primary mt-4" disabled={Boolean(busy)}
            onClick={() => { setEditing(child.id); setChoices({ guardian: false, collection: false }); }}>
            Enable itinerary &amp; packing review
          </button>}
        {!enabled && data.legacy?.some(row => row.traveler_id === child.id) && <p className="mt-3 text-sm text-ink-soft">Your earlier request is archived. Confirm the new read-only notice to enable review; no Ask Aly permission carries over.</p>}
        {editing === child.id && <form className="mt-5" onSubmit={event => { event.preventDefault(); save(child, true); }}>
          <fieldset className="space-y-4" disabled={Boolean(busy)}>
            <legend className="mb-3 font-semibold">Parent notice</legend>
            <div className="space-y-3 rounded-xl border border-line p-4">
              {MINOR_REVIEW_NOTICE.map(item => <div key={item.title}>
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{item.body}</p>
              </div>)}
              <a className="text-sm underline" href="/privacy" target="_blank" rel="noreferrer">Privacy policy</a>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={choices.guardian} onChange={e => setChoices(c => ({ ...c, guardian: e.target.checked }))} />
              <span>I am {child.name}’s parent or legal guardian.</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={choices.collection} onChange={e => setChoices(c => ({ ...c, collection: e.target.checked }))} />
              <span>I have read this notice and want to enable read-only itinerary and packing access now.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={!choices.guardian || !choices.collection}>{busy === child.id ? "Enabling review…" : "Enable review"}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </fieldset>
        </form>}
        {enabled && confirmOff !== child.id && <button className="btn btn-secondary mt-4" disabled={Boolean(busy)}
          onClick={() => setConfirmOff(child.id)}>Turn off review access</button>}
        {confirmOff === child.id && <div className="mt-4 rounded-xl border border-line p-4">
          <p className="text-sm">Turn off {child.name}’s itinerary and packing review? Their traveler profile and trip lists will stay unchanged.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => save(child, false)}>{busy === child.id ? "Turning off…" : "Turn off access"}</button>
            <button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setConfirmOff(null)}>Keep access</button>
          </div>
        </div>}
      </article>;
    })}
  </section>;
}
