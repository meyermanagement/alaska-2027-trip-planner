"use client";
import { useEffect, useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { MINOR_REVIEW_NOTICE, MINOR_REVIEW_NOTICE_VERSION } from "@/lib/beta/minorReview";

async function request(body) {
  const response = await fetch("/api/family/child-access", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again.");
  return data;
}
async function clearAdultBrowserState() {
  for (const key of Object.keys(localStorage)) {
    if (key !== "alyeska-child-handoff") localStorage.removeItem(key);
  }
  sessionStorage.clear();
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      await registration.unregister();
    }
  }
  if ("caches" in window) {
    await Promise.all((await caches.keys()).map(key => caches.delete(key)));
  }
}
export default function ChildAccessPanel({ initial = null }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null);
  const [choices, setChoices] = useState({ guardian: false, collection: false });
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/family/child-access", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Trip views could not be loaded.");
      setData(result);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!initial) load();
    const traveler = new URLSearchParams(window.location.search).get("traveler");
    if (traveler) setEditing(traveler);
  }, [initial]);
  async function setupKey() {
    setBusy("key"); setError("");
    try {
      const { options } = await request({ action: "register-options" });
      const response = await startRegistration({ optionsJSON: options });
      await request({ action: "register-verify", response });
      setData(current => ({ ...current, passkeyReady: true }));
    } catch (err) {
      setError(err.name === "NotAllowedError" ? "Passkey setup was canceled. Nothing changed." : err.message);
    } finally { setBusy(null); }
  }
  async function open(child) {
    setBusy(child.id); setError("");
    let handedOff = false;
    try {
      const payload = { travelerId: child.id, ...choices, noticeVersion: MINOR_REVIEW_NOTICE_VERSION };
      const { options } = await request({ ...payload, action: "open-options" });
      const response = await startAuthentication({ optionsJSON: options });
      await clearAdultBrowserState();
      const result = await request({ ...payload, action: "open-verify", response });
      handedOff = true;
      // Broadcast only after the server has revoked this browser's adult session.
      localStorage.setItem("alyeska-child-handoff", String(Date.now()));
      // Full navigation removes the adult React tree and router-prefetched data.
      window.location.replace(result.next);
    } catch (err) {
      if (handedOff) window.location.replace("/child");
      else {
        setError(err.name === "NotAllowedError" ? "Parent verification was canceled. The trip view was not opened." : err.message);
        setBusy(null);
      }
    }
  }
  async function closeViews(child) {
    setBusy(child.id); setError("");
    try {
      await request({ action: "close-views", travelerId: child.id });
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  return <section className="mt-6 space-y-4" aria-label="Parent-managed child access">
    <div className="card p-5">
      <p className="text-sm font-semibold text-teal">For travelers under 18</p>
      <h2 className="mt-2 text-xl font-semibold">Open their trip view</h2>
      <p className="mt-2 text-sm text-ink-soft">Their itinerary and packing, in their saved theme. No separate child login.</p>
      <p className="mt-3 text-sm text-ink-soft">Opening a view signs you out of Alyeska in this browser. Your passkey is required to return, then you sign back in.</p>
    </div>
    {error && <div role="alert" className="card p-4 text-sm"><p>{error}</p>
      {!data && <button className="btn btn-secondary mt-3" disabled={loading} onClick={load}>Try again</button>}
    </div>}
    {loading && <p role="status">Loading child trip views…</p>}
    {data && !data.passkeyReady && <div className="card p-5">
      <h2 className="font-semibold">Protect the way back</h2>
      <p className="mt-2 text-sm text-ink-soft">Set up a parent-only passkey before handing over a screen. Use your own phone or security key if your child knows this device’s unlock code.</p>
      <button className="btn btn-primary mt-4" disabled={Boolean(busy)} onClick={setupKey}>
        {busy === "key" ? "Setting up passkey…" : "Set up parent passkey"}
      </button>
    </div>}
    {!loading && data?.children?.length === 0 && <p className="card p-5">No minor profiles found. Add their birthday in Family &amp; pets first.</p>}
    {data?.children?.map(child => <article key={child.id} className="card p-5" aria-busy={busy === child.id}>
      <h2 className="text-lg font-semibold">{child.name}</h2>
      {child.access_level !== "secondary" ? <p className="mt-3 text-sm">Set their access to Secondary traveler first.</p>
        : editing !== child.id ? <button className="btn btn-primary mt-4" disabled={Boolean(busy) || !data.passkeyReady}
          onClick={() => { setEditing(child.id); setChoices({ guardian: false, collection: false }); }}>
          Open {child.name}’s trip view
        </button> : <form className="mt-4" onSubmit={event => { event.preventDefault(); open(child); }}>
          <fieldset className="space-y-4" disabled={Boolean(busy)}>
            <legend className="mb-3 font-semibold">Before handing over the screen</legend>
            <div className="space-y-3 rounded-xl border border-line p-4">
              {MINOR_REVIEW_NOTICE.map(item => <div key={item.title}>
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{item.body}</p>
              </div>)}
              <a className="text-sm underline" href="/privacy" target="_blank" rel="noreferrer">Privacy policy</a>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={choices.guardian}
                onChange={e => setChoices(c => ({ ...c, guardian: e.target.checked }))} />
              <span>I am {child.name}’s parent or legal guardian.</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 shrink-0" checked={choices.collection}
                onChange={e => setChoices(c => ({ ...c, collection: e.target.checked }))} />
              <span>I have read this notice and secured other signed-in apps, browser profiles, and device access.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={!choices.guardian || !choices.collection}>
                {busy === child.id ? "Opening trip view…" : `Open ${child.name}’s trip view`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </fieldset>
        </form>}
      {data.views?.some(view => view.traveler_id === child.id) && <button className="btn btn-secondary mt-4"
        disabled={Boolean(busy)} onClick={() => closeViews(child)}>Close their open trip views</button>}
    </article>)}
  </section>;
}
