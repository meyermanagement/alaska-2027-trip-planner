"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PACKING_ESSENTIALS, packingBaseRequest, rememberCandidates } from "@/lib/packing/baseList";

export function usePackingBase(tripId, disabled = false) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const refresh = useCallback(async () => {
    const version = ++sequence.current;
    try {
      const next = await packingBaseRequest(tripId);
      if (version === sequence.current) { setState(next); setError(""); }
      return next;
    } catch (e) { if (version === sequence.current) setError(e.message); return null; }
  }, [tripId]);
  useEffect(() => {
    if (disabled) return;
    let active = true;
    const version = ++sequence.current;
    packingBaseRequest(tripId).then(next => { if (active && version === sequence.current) { setState(next); setError(""); } })
      .catch(e => { if (active && version === sequence.current) setError(e.message); });
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [tripId, disabled, refresh]);
  const save = (action, rows) => {
    const result = saveQueue.current.catch(() => {}).then(async () => {
      const version = ++sequence.current;
      const next = await packingBaseRequest(tripId, action, rows);
      if (version === sequence.current) { setState(next); setError(""); }
      return next;
    });
    saveQueue.current = result;
    return result;
  };
  return { state, error, refresh, save };
}

export default function PackingBaseTools({ model, tripId, people = ["Shared"], items = [], onSaved = () => {} }) {
  const { state, error, refresh, save } = model;
  const dialog = useRef(null);
  const [mode, setMode] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [owner, setOwner] = useState(people.find(p => p !== "Shared") || "Shared");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [note, setNote] = useState("");
  const [failure, setFailure] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [sourceItems, setSourceItems] = useState([]);
  const remembered = state?.items || [];
  const eligible = rememberCandidates(items, remembered);
  const choices = mode === "essentials"
    ? rememberCandidates(PACKING_ESSENTIALS.map((row, index) => ({
      ...row, id: String(index), assignee: owner,
    })), remembered)
    : mode === "copy" ? rememberCandidates(sourceItems, remembered)
      : mode === "remember" ? eligible : remembered;
  const picked = choices.filter(row => selected.has(row.id));

  async function loadSource(id) {
    setSourceId(id); setSourceItems([]); setSelected(new Set());
    setBusy(true); busyRef.current = true; setFailure("");
    try {
      const result = await packingBaseRequest(tripId, "source", [id]);
      setSourceItems(result.sourceItems);
    } catch (e) { setFailure(e.message); }
    finally { setBusy(false); busyRef.current = false; }
  }
  function open(nextMode) {
    setMode(nextMode); setFailure("");
    setSelected(nextMode === "essentials" ? new Set(PACKING_ESSENTIALS.map((_, index) => String(index))) : new Set());
    if (!dialog.current.open) dialog.current.showModal();
    if (nextMode === "copy" && state.previousTrips?.length) void loadSource(state.previousTrips[0].id);
  }
  async function commit(action = mode) {
    if (busyRef.current) return;
    if (action !== "dismiss" && !picked.length) return;
    busyRef.current = true; setBusy(true); setFailure(""); setNote("");
    try {
      const result = await save(action, action === "dismiss" ? [] :
        action === "remember" || action === "copy" ? picked.map(row => row.id) :
          picked.map(({ item, assignee }) => ({ item, assignee })));
      // Keep the indicator until the parent has refreshed the saved trip.
      let refreshFailed = false;
      try { await onSaved(result); } catch { refreshFailed = true; }
      if (action !== "dismiss") {
        setNote(refreshFailed ? "Saved to your base list. Refresh the trip to see its latest items."
          : `${result.added} ${result.added === 1 ? "item" : "items"} saved to your base list.${result.tripAdded ? ` ${result.tripAdded} added to this trip.` : ""}`);
        dialog.current.close(); setMode(null);
      }
    } catch (e) { setFailure(e.message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return (
    <div className="no-print mb-4 space-y-3">
      {error ? <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft" role="status">
        <span>{error}</span><button className="btn btn-ghost" onClick={refresh}>Retry base list</button>
      </div> : !state ? <p className="text-sm text-ink-soft" role="status">Loading your base list…</p> : <>
        {state.showIntro && <section className="rounded-2xl border border-teal/30 bg-teal/10 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-teal">Your first packing list</p>
          <h3 className="mt-1 text-lg font-semibold">No need to start from scratch</h3>
          <p className="mt-1 text-sm text-ink-soft">Pick everyday essentials for this trip and your base list.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => open("essentials")} disabled={busy}>Start with essentials</button>
            <button className="btn btn-ghost" onClick={() => commit("dismiss")} disabled={busy}>{busy ? "Saving…" : "Not now"}</button>
          </div>
        </section>}
        {!state.showIntro && remembered.length === 0 && state.previousTrips?.length > 0 &&
          <section className="rounded-2xl border border-teal/30 bg-teal/10 p-4">
            <h3 className="text-lg font-semibold">You already have a packing list to start from</h3>
            <p className="mt-1 text-sm text-ink-soft">Choose everyday items from a previous trip for this trip and your base list.</p>
            <button className="btn btn-primary mt-3" onClick={() => open("copy")}>Use a previous trip’s packing list</button>
          </section>}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost" onClick={() => open("base")}>My base list · {remembered.length} items</button>
          {tripId && eligible.length > 0 && <button className="btn btn-ghost" onClick={() => open("remember")}>
            Remember for future trips
          </button>}
        </div>
      </>}
      {note && <p className="text-sm text-teal" role="status">{note}</p>}
      {failure && !dialog.current?.open && <p className="text-sm text-rose" role="alert">{failure}</p>}
      <dialog ref={dialog} className="m-auto w-[calc(100%_-_2rem)] max-w-xl max-h-[85dvh] overflow-y-auto rounded-2xl border border-[var(--line)] bg-white p-5 text-ink shadow-xl backdrop:bg-black/50"
        aria-labelledby="base-list-title" onCancel={event => { if (busy) event.preventDefault(); else setMode(null); }}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="base-list-title" className="text-lg font-semibold">{mode === "base" ? "Your base packing list" : mode === "copy" ? "Bring the everyday things with you" : mode === "essentials" ? "Choose your everyday essentials" : "Remember for future trips"}</h2>
          <button className="btn btn-ghost" disabled={busy} onClick={() => { dialog.current.close(); setMode(null); }}>Close</button>
        </div>
        <p className="mt-2 text-sm text-ink-soft">{mode === "base" ? "The everyday things you chose to keep for future trips."
          : mode === "copy" ? "Selected items go on this trip and your base list, unpacked. The original trip stays unchanged. Check the traveler names before adding."
          : mode === "essentials" ? `Selected items go on your base list${tripId ? " and this trip" : ""}. Uncheck anything you do not need.`
            : "Choose the everyday things to keep. Trip items and packed checkmarks stay unchanged."}</p>
        {mode === "base" && <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => open("essentials")}>Add suggested essentials</button>
          <Link className="btn btn-ghost" href="/packing">Edit packing templates</Link>
        </div>}
        {mode === "copy" && <label className="mt-4 block text-sm">Copy from
          <select className="field mt-1" value={sourceId} disabled={busy} onChange={event => loadSource(event.target.value)}>
            {state.previousTrips.map(source => <option key={source.id} value={source.id}>{source.name}{source.start_date ? ` · ${source.start_date}` : ""}</option>)}
          </select>
        </label>}
        {mode === "essentials" && <label className="mt-4 block text-sm">These are for
          <select className="field mt-1" value={owner} disabled={busy} onChange={event => {
            setOwner(event.target.value); setSelected(new Set(PACKING_ESSENTIALS.map((_, index) => String(index))));
          }}>{[...new Set([...people, "Shared"])].map(person => <option key={person}>{person}</option>)}</select>
        </label>}
        <div className="my-4 space-y-4">
          {!choices.length && <p className="text-sm text-ink-soft">{busy ? "Loading the list…" : mode === "base" ? "Your base list is empty. Add essentials or remember items from a trip."
            : "Everything here is already on your base list."}</p>}
          {[...new Set(choices.map(row => row.category || "General"))].map(category => <section key={category}>
            <h3 className="border-b border-[var(--line)] pb-2 text-sm font-semibold">{category}</h3>
            {choices.filter(row => (row.category || "General") === category).map(row => <label key={row.id}
              className="flex min-h-12 items-center gap-3 border-b border-[var(--line)] py-2 text-sm">
              {mode !== "base" && <input type="checkbox" className="h-5 w-5 accent-teal" disabled={busy}
                checked={selected.has(row.id)} onChange={event => setSelected(prev => {
                  const next = new Set(prev); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next;
                })} />}
              <span className="min-w-0 break-words">{row.item}<span className="block text-xs text-ink-soft">{row.assignee || "Shared"}</span></span>
            </label>)}
          </section>)}
        </div>
        {failure && <div className="mb-3 text-sm text-rose" role="alert">{failure}
          {mode === "copy" && !choices.length && <button className="btn btn-ghost" disabled={busy} onClick={() => loadSource(sourceId)}>Retry loading list</button>}
        </div>}
        {mode !== "base" && <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-white pt-3">
          <span className="text-sm" role="status">{busy ? "Saving…" : `${picked.length} selected`}</span>
          <button className="btn btn-primary" disabled={busy || !picked.length} onClick={() => commit()}>
            {busy ? "Working…" : (mode === "essentials" || mode === "copy") && tripId ? "Add to trip + base list" : "Save to base list"}
          </button>
        </div>}
      </dialog>
    </div>
  );
}

export function BaseListOnTemplates({ people, onSaved }) {
  const model = usePackingBase(null);
  return <PackingBaseTools model={model} people={people} onSaved={onSaved} />;
}
