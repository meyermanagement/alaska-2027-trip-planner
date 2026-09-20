"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PushAlerts from "@/components/PushAlerts";
import { LOCATION_TTL } from "@/lib/tips/location";
import { localDay, onTripWindow } from "@/lib/tips/onTrip";
import { routingFix } from "@/lib/travel/locationOrigin";

async function api(tripId, body, signal) {
  const response = await fetch(body ? "/api/tips/location" : `/api/tips/location?tripId=${tripId}`, {
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, tripId }) } : {}),
    cache: "no-store", signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Location Pro tips could not be loaded.");
  return result;
}

function phoneFix() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location is unavailable on this device. Enter a place or check your planned stops."));
    navigator.geolocation.getCurrentPosition(p => resolve({
      source: "device", latitude: p.coords.latitude, longitude: p.coords.longitude,
      accuracy: p.coords.accuracy, timestamp: p.timestamp,
    }), e => reject(new Error(e.code === 1
      ? "Location permission is blocked. You can enter a place or check your planned stops instead."
      : "Your phone could not get a fresh location. Enter a place or check your planned stops instead.")),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 });
  });
}

export default function LocationProTips({ trip, onLocationChange }) {
  const [loaded, setLoaded] = useState(false);
  const [preference, setPreference] = useState(null);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [tips, setTips] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [place, setPlace] = useState("");
  const [basis, setBasis] = useState("");
  const [fixAt, setFixAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [deferred, setDeferred] = useState(false);
  const [clearedQuery, setClearedQuery] = useState("");
  const [showPush, setShowPush] = useState(false);
  const live = useRef({ mounted: true, running: false, epoch: 0, pref: null, lastAttempt: 0, abort: null });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const active = Boolean(onTripWindow(trip, localDay(timeZone, new Date(now))));
  const activeRef = useRef(active);
  const onLocation = useRef(onLocationChange);
  onLocation.current = onLocationChange;
  activeRef.current = active;

  const receive = useCallback(data => {
    live.current.pref = data.preference;
    setPreference(data.preference);
    setTips(data.tips || []);
  }, []);

  useEffect(() => {
    const state = live.current;
    state.mounted = true;
    const controller = new AbortController();
    api(trip.id, null, controller.signal).then(data => {
      if (!state.mounted) return;
      receive(data); setLocationAllowed(data.locationAllowed); setLoaded(true);
      // A push link can arrive before this asynchronous panel exists.
      if (window.location.hash.startsWith("#location-tip-")) setTimeout(() => {
        document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 100);
    }).catch(e => { if (state.mounted && e.name !== "AbortError") setError(e.message); });
    return () => {
      state.mounted = false; state.epoch += 1; state.abort?.abort(); controller.abort();
      onLocation.current?.(null);
    };
  }, [trip.id, receive]);

  const run = useCallback(async (source, automatic = false, typed = "") => {
    const state = live.current;
    if (state.running || !activeRef.current || document.visibilityState !== "visible") return;
    state.running = true;
    const epoch = ++state.epoch;
    const valid = () => state.mounted && state.epoch === epoch;
    state.lastAttempt = Date.now();
    setError(""); setNote("");
    setBusy(source === "device" ? "Finding your location…" : "Checking current sources…");
    const controller = new AbortController();
    state.abort = controller;
    const timeout = setTimeout(() => controller.abort(), 110000);
    try {
      let pref = state.pref;
      if (automatic) {
        if (!pref?.enabled || !navigator.permissions) return;
        const permission = await navigator.permissions.query({ name: "geolocation" });
        if (permission.state !== "granted") {
          setNote("Phone location is not available. Use the button to try again, or enter a place.");
          setFixAt(null); onLocation.current?.(null); return;
        }
      }
      if (!pref || (source === "device" && !pref.enabled)) {
        const saved = await api(trip.id, {
          action: "preference", enabled: source === "device", pushEnabled: pref?.push_enabled || false,
        }, controller.signal);
        if (!valid()) return;
        receive(saved); pref = saved.preference;
      }
      // Permission is requested only after the adult explicitly chooses this
      // button; automatic refresh is restricted to an already-granted permission.
      const currentPlace = source === "device" ? await phoneFix() : source === "typed"
        ? { source, label: typed } : { source: "itinerary" };
      if (!valid() || document.visibilityState !== "visible" || !activeRef.current) return;
      setFixAt(source === "device" ? currentPlace.timestamp : null);
      onLocation.current?.(source === "device" && routingFix(currentPlace, pref?.enabled) ? currentPlace : null);
      setBasis(source === "device" ? "Approximate phone location" : source === "typed" ? "Place you entered, not GPS" : "Planned stops, not your phone");
      // Reopening a trip needs a new ephemeral fix for routing even when the
      // private research result is still fresh. Do not buy a second AI check.
      if (automatic && Date.now() - (Date.parse(pref?.checked_at || "") || 0) < LOCATION_TTL) return;
      setBusy("Checking current sources…");
      // Capture only this device's existing subscription. Never ask push
      // permission as a side effect of location permission.
      const registration = await navigator.serviceWorker?.getRegistration().catch(() => null);
      const subscription = await registration?.pushManager?.getSubscription().catch(() => null);
      if (!valid() || document.visibilityState !== "visible") return;
      const data = await api(trip.id, {
        action: "check", place: currentPlace, timeZone, automatic,
      }, controller.signal);
      if (!valid()) return;
      receive(data); setNote(data.note || "");
      // When visible, the tip itself is the alert. If this still-running tab has
      // become hidden, a generic push can notify this device. Closing/killing
      // the app does not start or guarantee any background work.
      if (!data.skipped && document.visibilityState === "hidden" && pref?.push_enabled && subscription) {
        const recent = (data.tips || []).find(t => t.status === "active" &&
          t.content.urgency === "now" && Date.now() - Date.parse(t.checked_at) < 120000);
        if (recent) await api(trip.id, { action: "notify", tipId: recent.id, endpoint: subscription.endpoint, timeZone }, controller.signal);
      }
    } catch (e) {
      if (valid()) {
        setFixAt(null);
        onLocation.current?.(null);
        setError(e.name === "AbortError" ? "The check timed out. Try again; this is not an all-clear." : e.message);
      }
    } finally {
      clearTimeout(timeout);
      if (state.epoch === epoch) {
        state.running = false; state.abort = null;
        if (state.mounted) setBusy("");
      }
    }
  }, [trip.id, timeZone, receive]);

  useEffect(() => {
    if (!loaded) return;
    const refresh = () => {
      setNow(Date.now());
      if (!onTripWindow(trip, localDay(timeZone))) {
        live.current.epoch += 1; live.current.abort?.abort();
        live.current.running = false; setBusy(""); setFixAt(null); onLocation.current?.(null); return;
      }
      const lastChecked = Date.parse(live.current.pref?.checked_at || "") || 0;
      if (document.visibilityState === "visible" && live.current.pref?.enabled &&
          (Date.now() - lastChecked >= LOCATION_TTL || !live.current.lastAttempt) &&
          Date.now() - live.current.lastAttempt >= 5 * 60000)
        run("device", true);
    };
    refresh();
    const interval = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("pageshow", refresh); };
  }, [loaded, run, timeZone, trip]);

  useEffect(() => {
    if (!fixAt) return;
    const expire = setTimeout(() => { setFixAt(null); setBasis("Phone location expired"); onLocation.current?.(null); },
      Math.max(0, fixAt + LOCATION_TTL - Date.now()));
    return () => clearTimeout(expire);
  }, [fixAt]);

  async function settings(enabled, pushEnabled) {
    const state = live.current;
    state.epoch += 1; state.abort?.abort(); state.running = true;
    if (!enabled) { state.pref = { ...state.pref, enabled: false }; setFixAt(null); setBasis(""); onLocation.current?.(null); }
    setBusy("Saving settings…"); setError("");
    try { receive(await api(trip.id, { action: "preference", enabled, pushEnabled })); }
    catch (e) { setError(e.message); }
    finally { state.running = false; setBusy(""); }
  }

  async function tipStatus(id, status) {
    setBusy(status === "dismissed" ? "Clearing tip…" : "Restoring tip…"); setError("");
    try { receive(await api(trip.id, { action: "tip", tipId: id, status })); }
    catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  const visible = tips.filter(t => t.status === "active");
  const cleared = tips.filter(t => t.status === "dismissed");
  const card = tip => <article key={tip.id} id={`location-tip-${tip.id}`} className="rounded-xl border border-line bg-paper p-4 scroll-mt-24">
    <h3 className="font-semibold">{tip.content.title}</h3>
    <p className="mt-2 text-sm">{tip.content.body}</p>
    <p className="mt-2 text-xs text-ink-soft">{tip.content.because}</p>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
      {(tip.content.sources || []).map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-teal underline">{s.title || "Current report"}</a>)}
      <span>Checked {new Date(tip.checked_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
    </div>
    <button className="btn btn-ghost mt-2" disabled={!!busy} onClick={() => tipStatus(tip.id, tip.status === "active" ? "dismissed" : "active")}>
      {tip.status === "active" ? "Clear tip" : "Restore tip"}
    </button>
  </article>;

  if (!active && !tips.length) return null;
  return <section aria-label="Location Pro tips" className="card my-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="text-xs font-semibold text-teal">JUST FOR YOU</p><h2 className="mt-1 text-lg font-semibold">Pro tips for where you are</h2></div>
      <span className="text-xs text-ink-soft">{preference?.enabled && active ? "Location on for this trip" : "Location off"}</span>
    </div>
    {!active && <p className="mt-3 text-sm text-ink-soft">Location checks have ended with this trip. Your saved tips stay private.</p>}
    {active && !deferred && <p className="mt-3 text-sm text-ink-soft">
      {preference?.enabled
        ? "Using your location for current conditions and the journey to your next stop."
        : "Use your approximate location for weather, traffic, closures and travel time to your next stop. Only while this trip is open."}
    </p>}
    {active && loaded && !deferred && <>
      {!preference?.enabled && <p className="mt-2 text-xs text-ink-soft">Sent to Google for tips and travel estimates. No saved location history or sharing with your household.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!!busy || !locationAllowed} onClick={() => run("device")}>
          {preference?.checked_at && preference?.enabled ? "Run again" : "Use my location"}
        </button>
        {!preference?.enabled && <button className="btn btn-ghost" disabled={!!busy} onClick={() => setDeferred(true)}>Not now</button>}
      </div>
      {!locationAllowed && <p className="mt-2 text-xs text-ink-soft">Device location is off in your privacy choices. You can still enter a place or check your planned stops. <a href="/settings" className="underline">Open settings</a></p>}
      <details className="mt-4">
        <summary className="cursor-pointer py-2 text-sm font-semibold">Use a place instead</summary>
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); run("typed", false, place); }}>
          <label className="w-full text-sm" htmlFor={`location-place-${trip.id}`}>Where are you?</label>
          <input id={`location-place-${trip.id}`} className="input min-w-0 flex-1" maxLength={160} placeholder="Place, town or landmark" value={place} onChange={e => setPlace(e.target.value)} />
          <button className="btn btn-secondary" disabled={!!busy || !place.trim()}>Check this place</button>
        </form>
        <button className="btn btn-ghost mt-2" disabled={!!busy} onClick={() => run("itinerary")}>Use my planned stops</button>
      </details>
    </>}
    {active && deferred && <button className="btn btn-ghost mt-3" onClick={() => setDeferred(false)}>Set up location Pro tips</button>}
    {busy && <p role="status" className="mt-3 flex items-center gap-2 text-sm"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />{busy}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose">{error}</p>}
    {note && <p role="status" className="mt-3 text-sm text-ink-soft">{note}</p>}
    {basis && <p className="mt-2 text-xs text-ink-soft">{basis}{fixAt ? now - fixAt >= LOCATION_TTL ? " · expired, not reused" : " · fresh for up to 15 minutes" : ""}</p>}
    <div className="mt-4 space-y-3">{visible.map(card)}</div>
    {cleared.length > 0 && <details className="mt-4">
      <summary className="cursor-pointer py-2 text-sm font-semibold">Cleared personal tips ({cleared.length})</summary>
      <label className="mt-2 block text-sm">Find a cleared personal tip
        <input className="input mt-2 w-full" value={clearedQuery} onChange={e => setClearedQuery(e.target.value)} placeholder="Search this trip’s personal tips" />
      </label>
      <div className="mt-3 space-y-3">{cleared.filter(t => JSON.stringify(t.content).toLowerCase().includes(clearedQuery.toLowerCase())).map(card)}</div>
    </details>}
    {loaded && <details className="mt-4 border-t border-line pt-2">
      <summary className="cursor-pointer py-2 text-sm font-semibold">Location &amp; Pro tips settings</summary>
      <p className="mt-2 text-xs text-ink-soft">Refreshes about every 15 minutes while this trip is open and visible. Stops when the trip ends. No automatic changes to your itinerary.</p>
      <p className="mt-2 text-xs text-ink-soft">Your approximate location or entered place is sent to Google Gemini for tips. A fresh phone fix is sent to the routing provider for travel estimates. No background tracking, saved location history or household location sharing. Off, stale or imprecise location uses your previous planned stop instead.</p>
      {preference?.enabled && <button className="btn btn-secondary mt-3" disabled={busy === "Saving settings…"} onClick={() => settings(false, preference?.push_enabled || false)}>Turn location off</button>}
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input className="mt-1" type="checkbox" checked={preference?.push_enabled || false} disabled={!!busy}
          onChange={e => settings(preference?.enabled || false, e.target.checked)} />
        <span>Notify this device about important impacts</span>
      </label>
      <p className="mt-2 text-xs text-ink-soft">Requires notifications enabled for this device. A check finishing while this tab is hidden can send a generic alert; no duplicate push while you are viewing the tips. Closing the app does not start location checks.</p>
      <button className="btn btn-ghost mt-2" onClick={() => setShowPush(!showPush)}>{showPush ? "Hide notification setup" : "Set up device notifications"}</button>
      {showPush && <div className="mt-3"><PushAlerts /></div>}
    </details>}
  </section>;
}
