"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import AlyWordmark from "@/components/AlyWordmark";
import { skinOr, paintChrome } from "@/lib/skins";

function dateLabel(date) {
  if (!date) return "Dates to come";
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}
function groups(rows, field, fallback) {
  return Object.entries(rows.reduce((out, row) => {
    const key = row[field] || fallback;
    (out[key] ||= []).push(row);
    return out;
  }, {}));
}

export default function MinorReview({ initial = null }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [tripId, setTripId] = useState(null);
  const [tab, setTab] = useState("itinerary");
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const requestRef = useRef(null);
  const load = useCallback(async () => {
    if (signingOutRef.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/child", { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your trips could not be loaded.");
      if (result.enabled && result.skin) {
        document.documentElement.dataset.skin = skinOr(result.skin);
        paintChrome(result.skin);
      }
      setData(result);
    } catch (err) {
      if (controller.signal.aborted) return;
      setData(null); // Never keep private data visible after a failed permission refresh.
      setError(err.message);
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    if (!initial) load();
    // A shared device may have cached an adult's documents before this sign-in.
    // This surface has no offline document mode and must not retain that cache.
    if ("caches" in window) window.caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("alyeska-documents")).map(key => window.caches.delete(key)),
    )).catch(() => {});
    const visible = () => {
      if (document.visibilityState === "hidden") {
        requestRef.current?.abort(); setData(null);
      } else load();
    };
    const hide = () => { requestRef.current?.abort(); setData(null); };
    const show = event => { if (event.persisted) load(); };
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      clearInterval(interval); requestRef.current?.abort();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, [initial, load]);

  async function signOut() {
    signingOutRef.current = true;
    setSigningOut(true); setError(""); setData(null);
    requestRef.current?.abort();
    try {
      const post = async body => {
        const response = await fetch("/api/child/return", { method: "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        return result;
      };
      const { options } = await post({ action: "options" });
      const response = await startAuthentication({ optionsJSON: options });
      const result = await post({ action: "verify", response });
      localStorage.removeItem("alyeska-child-handoff");
      window.location.replace(result.next);
    } catch {
      signingOutRef.current = false;
      setError("Parent verification did not finish. Use the registered parent passkey to return."); setSigningOut(false);
    }
  }
  const trip = data?.trips?.find(row => row.id === tripId);
  return <main className="mx-auto max-w-3xl px-5 pb-12 pt-7">
    <header className="flex items-center justify-between gap-4">
      <AlyWordmark className="text-[24px]" />
      <button className="btn btn-secondary" disabled={signingOut} onClick={signOut}>
        {signingOut ? "Verifying parent…" : "Parent return"}
      </button>
    </header>
    <div className="mt-8 flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold text-teal">Just your trips</p>
        <h1 className="mt-2 text-3xl font-semibold">{trip ? trip.name : "My trips"}</h1>
        <p className="mt-2 text-sm text-ink-soft">Itinerary &amp; packing. View only.</p>
      </div>
      <button className="btn btn-secondary" disabled={loading || signingOut} onClick={load}>
        {loading ? "Checking access…" : "Refresh"}
      </button>
    </div>
    {error && <p role="alert" className="card mt-5 p-5">{error}</p>}
    {!data && loading && <p role="status" className="card mt-5 p-5">Loading your trips…</p>}
    {data && !data.enabled && <section className="card mt-6 p-6">
      <h2 className="text-xl font-semibold">A parent needs to open this view</h2>
      <p className="mt-3 text-sm text-ink-soft">This view is closed or has expired. A parent can open a fresh two-hour view from Family &amp; pets → Child access. Children do not sign in separately.</p>
    </section>}
    {data?.enabled && !trip && <section className="mt-6 space-y-3" aria-label="Your trips">
      {data.trips.length === 0 && <p className="card p-5">No trips here yet. Your parent can add you to a trip’s traveler list. Draft trips stay private.</p>}
      {data.trips.map(row => <button key={row.id} className="card block w-full p-5 text-left"
        onClick={() => { setTripId(row.id); setTab("itinerary"); }}>
        <span className="block text-lg font-semibold">{row.name}</span>
        {row.destination && <span className="mt-1 block text-sm text-ink-soft">{row.destination}</span>}
        <span className="mt-3 block text-sm">{dateLabel(row.start_date)}{row.end_date && row.end_date !== row.start_date ? ` – ${dateLabel(row.end_date)}` : ""}</span>
        <span className="mt-3 block text-sm font-semibold text-teal">Review trip →</span>
      </button>)}
    </section>}
    {data?.enabled && trip && <>
      <button className="btn btn-secondary mt-5" onClick={() => setTripId(null)}>← My trips</button>
      <div className="mt-5 flex gap-2" aria-label="Trip sections">
        {["itinerary", "packing"].map(value => <button key={value} aria-pressed={tab === value}
          className={`btn ${tab === value ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(value)}>
          {value === "itinerary" ? "Itinerary" : "My packing"}
        </button>)}
      </div>
      <section className="mt-5 space-y-5" aria-label={tab === "itinerary" ? "Itinerary" : "My packing"}>
        {tab === "itinerary" ? <>
          {!trip.itinerary.length && <p className="card p-5">No itinerary items yet.</p>}
          {groups(trip.itinerary, "item_date", "Unscheduled").map(([day, items]) => <div key={day}>
            <h2 className="mb-3 font-semibold">{day === "Unscheduled" ? day : dateLabel(day)}</h2>
            <ul className="card divide-y divide-line">{items.map(item => <li key={item.id} className="p-5">
              <p className="text-xs font-semibold text-teal">{item.start_time?.slice(0, 5) || "Time to come"}</p>
              <h3 className="mt-1 font-semibold">{item.title}</h3>
              {item.location && <p className="mt-1 text-sm text-ink-soft">{item.location}</p>}
              {item.status === "cancelled" && <p className="mt-2 text-sm">Canceled</p>}
            </li>)}</ul>
          </div>)}
        </> : <>
          <p className="text-sm text-ink-soft">Your items, grouped by category. A parent updates packing status.</p>
          {!trip.packing.length && <p className="card p-5">No packing items assigned to you yet.</p>}
          {groups(trip.packing, "category", "Other").map(([category, items]) => <div key={category}>
            <h2 className="mb-3 font-semibold">{category}</h2>
            <ul className="card divide-y divide-line">{items.map(item => <li key={item.id} className="flex items-center justify-between gap-4 p-4">
              <span>{item.item}{Number(item.quantity) > 1 ? ` × ${item.quantity}` : ""}</span>
              <span className={`shrink-0 text-xs font-semibold ${item.is_packed ? "text-teal" : "text-ink-soft"}`}>
                {item.is_packed ? "Packed" : "Not packed"}
              </span>
            </li>)}</ul>
          </div>)}
        </>}
      </section>
    </>}
    <footer className="mt-9 border-t border-line pt-5 text-sm text-ink-soft">
      <p>Ask Aly is not available to anyone under 18. This view has no chat, uploads, edits, or location sharing.</p>
      <details className="mt-3"><summary className="cursor-pointer">Privacy &amp; parent help</summary>
        <p className="mt-2">Your parent opens this temporary view and can close it. You do not sign in. A necessary cookie keeps the view private; there is no screen-use analytics or sharing with an AI provider. Essential hosting and security logs may still be kept.</p>
        <p className="mt-2">For access, correction, or deletion questions, ask your parent to contact admin@alyeska.app.</p>
      </details>
    </footer>
  </main>;
}
