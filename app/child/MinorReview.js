"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import AlyWordmark from "@/components/AlyWordmark";
import TripBackdrop from "@/components/TripBackdrop";
import ChildNavigation from "./ChildNavigation";
import { SKINS, skinOr, paintChrome } from "@/lib/skins";
import { formatTime, homeToday, localToday } from "@/lib/format";
import { tripDays, itemsOnDay, groupChildTrips, childOpeningTab } from "@/lib/childView/days";
import { tabKeyDown } from "@/lib/ui/tabs";

const CHILD_TRIP_TABS = [
  { id: "packing", label: "Packing" },
  { id: "itinerary", label: "Itinerary" },
  { id: "live", label: "Live" },
  { id: "overview", label: "Trip" },
];

function dateLabel(date) {
  if (!date) return "Dates to come";
  if (date === "Unscheduled") return date;
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}
function groups(rows) {
  return Object.entries(rows.reduce((out, row) => {
    (out[row.category || "Other"] ||= []).push(row); return out;
  }, {}));
}
function applySkin(value) {
  document.documentElement.dataset.skin = skinOr(value);
  paintChrome(value);
}

export default function MinorReview({ initial = null }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState("");
  const [tripId, setTripId] = useState(null);
  const [chosenTab, setTab] = useState("itinerary");
  const [today, setToday] = useState(homeToday);
  const [selectedDay, setSelectedDay] = useState(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [tripGroup, setTripGroup] = useState("upcoming");
  const [busy, setBusy] = useState("");
  const [saved, setSaved] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const mutationRef = useRef(false);
  const requestRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    const update = () => setToday(localToday());
    update();
    const timer = setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const load = useCallback(async () => {
    if (signingOutRef.current || mutationRef.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/child", { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your trips could not be loaded.");
      if (controller.signal.aborted) return;
      if (result.enabled && result.skin) applySkin(result.skin);
      setData(result);
      return true;
    } catch (err) {
      if (controller.signal.aborted) return;
      setData(null);
      setError(err.message);
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    if (!initial) load();
    else if (initial.skin) applySkin(initial.skin);
    if ("caches" in window) window.caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("alyeska-documents")).map(key => window.caches.delete(key)),
    )).catch(() => {});
    const hide = () => {
      requestRef.current?.abort(); mutationRef.current = false;
      setData(null); setBusy(""); setSaved(""); menuRef.current?.close();
    };
    const visible = () => { if (document.visibilityState === "hidden") hide(); else load(); };
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

  async function save(kind, body, label) {
    if (mutationRef.current || signingOutRef.current || !data?.enabled) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller; mutationRef.current = true;
    setBusy(kind === "theme" ? "theme" : body.itemId); setSaved(""); setError(""); setLoading(false);
    // Checkmarks/the theme respond immediately. Only the server response earns
    // "Saved"; on an uncertain failure reload the authoritative, filtered view.
    const previousSkin = data.skin;
    if (kind === "theme") { applySkin(body.skin); setData(value => ({ ...value, skin: body.skin })); }
    else setData(value => ({ ...value, trips: value.trips.map(trip => ({
      ...trip, packing: trip.packing.map(item => item.id === body.itemId ? { ...item, is_packed: body.packed } : item),
    })) }));
    try {
      const response = await fetch(`/api/child/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (kind === "theme") applySkin(previousSkin);
        setData(null); mutationRef.current = false; setBusy("");
        if (response.status === 403) setData({ enabled: false, trips: [] });
        else {
          requestRef.current = null;
          const refreshed = await load();
          if (!refreshed || signingOutRef.current || document.visibilityState === "hidden") return;
        }
        setError(result.error || "Could not confirm the save. Refresh before trying again.");
        return;
      }
      setSaved(`${label} saved.`);
    } catch {
      if (controller.signal.aborted) return;
      if (kind === "theme") applySkin(previousSkin);
      setData(null); mutationRef.current = false; setBusy(""); requestRef.current = null;
      const refreshed = await load();
      if (!refreshed || signingOutRef.current || document.visibilityState === "hidden") return;
      setError("Could not confirm the save. Check the refreshed status before trying again.");
    } finally {
      if (requestRef.current === controller) {
        mutationRef.current = false; setBusy("");
      }
    }
  }
  async function signOut() {
    signingOutRef.current = true;
    setSigningOut(true); setError(""); setData(null); setSaved("");
    requestRef.current?.abort(); menuRef.current?.close();
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
  const days = trip ? tripDays(trip) : [];
  const isLive = childOpeningTab(trip, today) === "live";
  // A refresh must not override a manually selected tab. Only an unavailable
  // Live tab falls back to Itinerary after the trip ends or is completed.
  const tab = chosenTab === "live" && !isLive ? "itinerary" : chosenTab;
  const tripGroups = groupChildTrips(data?.trips || [], today);
  const day = tab === "live" ? today : days.includes(selectedDay) ? selectedDay : days.includes(today) ? today : days[0];
  const navigate = destination => {
    menuRef.current?.close(); setSaved("");
    if (["trips", "upcoming", "past"].includes(destination)) {
      setTripId(null); setThemeOpen(false);
      if (destination !== "trips") setTripGroup(destination);
    }
    else if (destination === "settings") setThemeOpen(true);
    else { setThemeOpen(false); setTab(destination); }
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const packedCount = trip?.packing.filter(item => item.is_packed).length || 0;
  return <div className="child-trip-layout">
    {data?.enabled && <ChildNavigation menuRef={menuRef} navigate={navigate}
      current={themeOpen ? "settings" : tripGroup}
      counts={{ upcoming: tripGroups.upcoming.length, past: tripGroups.past.length }} />}
    <main className="mx-auto max-w-4xl px-5 pb-28 pt-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <AlyWordmark className="text-[24px]" />
        <button className="btn btn-secondary" disabled={signingOut} onClick={signOut}>
          {signingOut ? "Verifying parent…" : "Parent return"}
        </button>
      </header>
      {(!trip || themeOpen) && <div className="mt-7 flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-teal">Your adventure</p>
          <h1 className="mt-2 text-3xl font-semibold">{themeOpen && data?.enabled ? "Settings" : trip ? trip.name : "My trips"}</h1>
          <p className="mt-2 text-sm text-ink-soft">{themeOpen ? "Your look, saved for next time." : "Your plans to explore. Your things to pack."}</p>
        </div>
        <button className="btn btn-secondary" disabled={loading || signingOut || !!busy} onClick={load}>
          {loading ? "Checking access…" : "Refresh"}
        </button>
      </div>}
      {error && <p role="alert" className="card mt-5 p-5">{error}</p>}
      <p role="status" aria-live="polite" className="mt-3 min-h-6 text-sm text-teal">{busy ? "Saving…" : saved}</p>
      {!data && loading && <p role="status" className="card mt-5 p-5">Loading your trips…</p>}
      {data && !data.enabled && <section className="card mt-6 p-6">
        <h2 className="text-xl font-semibold">A parent needs to open this view</h2>
        <p className="mt-3 text-sm text-ink-soft">This view is closed or has expired. A parent can open a fresh two-hour view from your Family profile. Children do not sign in separately.</p>
      </section>}
      {data?.enabled && themeOpen && <section className="mt-3" aria-label="Settings">
        <button className="btn btn-secondary mb-5" onClick={() => setThemeOpen(false)}>← {trip ? "Back to trip" : "My trips"}</button>
        <h2 className="mb-4 text-xl font-semibold">Theme</h2>
        <div className="grid gap-3 sm:grid-cols-2">{SKINS.map(skin => <button key={skin.id}
          disabled={!!busy} aria-pressed={data.skin === skin.id}
          onClick={() => save("theme", { skin: skin.id }, "Theme")}
          className="card flex min-h-28 items-center gap-4 p-5 text-left"
          style={{ outline: data.skin === skin.id ? "2px solid var(--color-teal)" : undefined }}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: skin.swatch[0] }}>
            <span className="h-5 w-5 rounded-full" style={{ background: skin.swatch[1] }} />
          </span>
          <span><span className="block font-semibold">{skin.name}</span><span className="mt-1 block text-sm text-ink-soft">{data.skin === skin.id ? "Selected" : skin.tag}</span></span>
        </button>)}</div>
        <p className="mt-5 text-sm text-ink-soft">This changes only your trip view, not your parent’s theme.</p>
      </section>}
      {data?.enabled && !themeOpen && !trip && <section className="mt-3" aria-label="Your trips">
        <div className="mb-5 flex flex-wrap gap-2" aria-label="Trip groups">
          {["upcoming", "past"].map(group => <button key={group} className={`btn ${tripGroup === group ? "btn-primary" : "btn-secondary"}`}
            aria-pressed={tripGroup === group} onClick={() => setTripGroup(group)}>
            {group === "past" ? "Past trips" : "Upcoming trips"} · {tripGroups[group].length}
          </button>)}
        </div>
        {!tripGroups[tripGroup].length && <p className="card p-5">{tripGroup === "past" ? "No past trips yet. Trips you’ve taken will be here." : "No upcoming trips yet. Your parent can add you to a trip’s traveler list."}</p>}
        <div className="grid gap-5 sm:grid-cols-2">{tripGroups[tripGroup].map(row => <button key={row.id} className="trip-plate card on-photo min-h-[268px] w-full justify-end text-left"
          onClick={() => { const date = localToday(); setToday(date); setTripId(row.id); setSelectedDay(null); setTab(childOpeningTab(row, date)); setSaved(""); }}>
          <TripBackdrop trip={row} />
          <span className="relative block p-5"><span className="block text-2xl font-semibold">{row.name}</span>
            <span className="mt-2 block text-sm">{row.destination}</span>
            <span className="mt-3 block text-sm">{dateLabel(row.start_date)}{row.end_date && row.end_date !== row.start_date ? ` – ${dateLabel(row.end_date)}` : ""}</span>
            <span className="mt-4 block text-sm font-semibold">Open trip →</span>
          </span>
        </button>)}</div>
      </section>}
      {data?.enabled && !themeOpen && trip && <>
        <button className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-teal hover:bg-teal/10"
          onClick={() => navigate("trips")}>← {tripGroup === "past" ? "Past trips" : "Upcoming trips"}</button>
        <section className="card overflow-hidden">
        <div className={tab === "overview" ? "trip-plate on-photo min-h-[216px] justify-end" : "trip-working-header"}>
          {tab === "overview" && <TripBackdrop trip={trip} shape="head" />}
          <div className="relative p-5">
            <h1 className="font-display text-2xl font-semibold leading-tight">{trip.name}</h1>
            <p className="mt-2 text-sm"><span className="font-semibold">{dateLabel(trip.start_date)} – {dateLabel(trip.end_date)}</span>
              {trip.destination && <span className="mt-1 block">{trip.destination}</span>}
            </p>
          </div>
        </div>
        </section>
        <nav className="tabbar mt-4 no-print" role="tablist" aria-label="Trip sections" onKeyDown={tabKeyDown}>
          {CHILD_TRIP_TABS.filter(item => item.id !== "live" || isLive).map(({ id, label }) => <button key={id} type="button" role="tab" id={`child-trip-tab-${id}`}
            aria-controls="child-trip-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1}
            className="tab" onClick={() => { setTab(id); setSaved(""); }}>
            {label}
          </button>)}
        </nav>
        <section className="mt-5 space-y-5" role="tabpanel" id="child-trip-panel" aria-labelledby={`child-trip-tab-${tab}`} tabIndex={0}>
          {tab === "overview" ? <>
            <div><h2 className="text-xl font-semibold">Your trip</h2>
              <p className="mt-2 text-sm text-ink-soft">Explore the plans and get your things ready.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button className="card p-5 text-left" onClick={() => setTab("packing")}>
                <span className="block font-semibold">Your packing</span>
                <span className="mt-2 block text-sm text-ink-soft">{packedCount} of {trip.packing.length} packed</span>
                <span className="mt-3 block text-sm font-semibold text-teal">Open packing →</span>
              </button>
              <button className="card p-5 text-left" onClick={() => setTab("itinerary")}>
                <span className="block font-semibold">Your days</span>
                <span className="mt-2 block text-sm text-ink-soft">{trip.itinerary.length} {trip.itinerary.length === 1 ? "plan" : "plans"} to explore</span>
                <span className="mt-3 block text-sm font-semibold text-teal">View itinerary →</span>
              </button>
            </div>
          </> : tab === "itinerary" || tab === "live" ? <>
            {tab === "live" ? <div>
              <p className="text-sm font-semibold text-teal">Today on your trip</p>
              <button className="mt-2 min-h-11 text-sm font-semibold text-teal" onClick={() => setTab("itinerary")}>See the full itinerary →</button>
            </div> : <div className="flex gap-2 overflow-x-auto pb-3" aria-label="Trip days">
              {days.map(value => <button key={value} className={`day-tile ${day === value ? "day-tile-on" : ""}`}
                aria-label={dateLabel(value)} aria-pressed={day === value} onClick={() => setSelectedDay(value)}>
                {value === "Unscheduled" ? <span className="p-2 text-xs">No date</span> : <>
                  <span className="day-tile-top">{new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}</span>
                  <span className="day-tile-num">{Number(value.slice(8, 10))}</span>
                  <span className="day-tile-foot">{new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</span>
                </>}
              </button>)}
            </div>}
            <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{day ? dateLabel(day) : "Itinerary"}</h2><span className="text-xs text-ink-soft">View only</span></div>
            {!itemsOnDay(trip, day).length && <p className="card p-5">No plans for this day yet.</p>}
            <ul className="space-y-3">{itemsOnDay(trip, day).map(item => <li key={item.id} className="card p-5">
              <p className="text-xs font-semibold text-teal">{item.item_date !== day ? "Continuing stay / activity" : formatTime(item.start_time) || "Time to come"}</p>
              <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
              {item.location && <p className="mt-1 text-sm text-ink-soft">{item.location}</p>}
              {item.status && <p className="mt-3 text-xs text-ink-soft">{item.status === "cancelled" ? "Canceled" : item.status.replaceAll("_", " ")}</p>}
            </li>)}</ul>
          </> : <>
            <div><h2 className="text-xl font-semibold">My packing</h2><p className="mt-2 text-sm text-ink-soft">{packedCount} of {trip.packing.length} packed. Check off your things as you go.</p></div>
            <progress className="child-packing-progress" value={packedCount} max={trip.packing.length || 1} aria-label="Packing progress" />
            {!trip.packing.length && <p className="card p-5">No packing items assigned to you yet.</p>}
            {groups(trip.packing).map(([category, items]) => <div key={category}>
              <h3 className="mb-3 font-semibold">{category}</h3>
              <ul className="card child-packing-items">{items.map(item => <li key={item.id}>
                <label className="flex min-h-16 cursor-pointer items-center gap-4 p-4">
                  <input className="h-5 w-5 shrink-0 accent-teal" type="checkbox" checked={!!item.is_packed} disabled={!!busy}
                    onChange={event => save("packing", { itemId: item.id, packed: event.target.checked }, item.item)} />
                  <span className={`min-w-0 flex-1 ${item.is_packed ? "text-ink-soft line-through" : ""}`}>{item.item}{Number(item.quantity) > 1 ? ` × ${item.quantity}` : ""}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{busy === item.id ? "Saving…" : item.is_packed ? "Packed" : ""}</span>
                </label>
              </li>)}</ul>
            </div>)}
          </>}
        </section>
      </>}
      <footer className="mt-9 border-t pt-5 text-xs text-ink-soft" style={{ borderColor: "var(--line)" }}>
        <p>Parent-opened view · Plans are read-only. Only your packing checkmarks and theme can change.</p>
        <details className="mt-3"><summary className="cursor-pointer py-2">Privacy &amp; parent help</summary>
          <p className="mt-2">You do not sign in. Your packing status and theme are saved for next time. A necessary cookie keeps this temporary view private. No chat, uploads, location sharing, screen-use analytics, or AI calls. Essential hosting and security logs may still be kept.</p>
          <p className="mt-2">Ask your parent about access, correction, or deletion, or contact admin@alyeska.app.</p>
        </details>
      </footer>
    </main>
  </div>;
}
