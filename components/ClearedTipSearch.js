"use client";

import { useRef, useState } from "react";

export default function ClearedTipSearch({ tripId, wallet, renderTip, onRestore, children }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState(wallet ? "wallet" : "trips");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const working = useRef(false);
  async function search(event) {
    event.preventDefault();
    if (working.current || query.trim().length < 3) return;
    working.current = true; setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/tips/cleared/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), scope, tripId }),
        signal: AbortSignal.timeout(105000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search did not finish. Try again.");
      setResult({ ...data, query: query.trim() });
    } catch (failure) {
      setError(failure.name === "TimeoutError" ? "Search timed out. Try again with a place or topic." : failure.message);
    } finally { working.current = false; setBusy(false); }
  }
  async function restore(tip) {
    const saved = await onRestore(tip);
    if (saved) setResult(previous => previous ? { ...previous, tips: previous.tips.filter(row => row.id !== tip.id) } : previous);
  }
  return <>
    <form onSubmit={search} className="mb-4 rounded-xl border border-[var(--line)] bg-white/60 p-4">
      <label className="block text-sm font-semibold">
        Find a tip you remember
        <input type="search" maxLength={500} value={query} disabled={busy}
          onChange={event => setQuery(event.target.value)}
          className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-3 font-normal"
          placeholder="That tip about getting seasick on the cruise…" />
      </label>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-0 basis-full sm:basis-auto sm:flex-1 text-xs font-semibold">Search in
          <select value={scope} disabled={busy} onChange={event => { setScope(event.target.value); setResult(null); setError(""); }}
            className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm">
            <option value="trips">All trips, including past trips</option>
            {tripId && <option value="trip">This trip only</option>}
            <option value="wallet">Wallet tips</option>
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy || query.trim().length < 3}>{busy ? "Finding tips…" : "Search tips"}</button>
      </div>
      <p className="mt-2 text-xs text-ink-soft">Describe the place or advice in your own words. Search finds the old tip; checking it is a separate step.</p>
    </form>
    {busy && <p role="status" className="mb-4 text-sm text-ink-soft">Looking for related advice, including tips saved under different wording…</p>}
    {error && <p role="alert" className="mb-4 text-sm text-rose">{error}</p>}
    {result && <section aria-label="Cleared tip search results">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{result.tips.length} {result.tips.length === 1 ? "match" : "matches"} for “{result.query}”</p>
        <button type="button" className="btn btn-ghost" onClick={() => { setResult(null); setQuery(""); setError(""); }}>Back to recent tips</button>
      </div>
      <p className="mb-3 text-xs text-ink-soft">{result.note}</p>
      {result.truncated && <p className="mb-3 text-sm text-ink-soft">There are more possible matches than this search can rank at once. Add a trip name, destination, or more specific topic.</p>}
      {!result.tips.length ? <p className="text-sm text-ink-soft">No matching cleared tips found. Try the place, trip name, or a different description.</p>
        : <ul className="space-y-3">{result.tips.map(tip => renderTip(tip, restore))}</ul>}
    </section>}
    {!result && !busy && children}
  </>;
}
