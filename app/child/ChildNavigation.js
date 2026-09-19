"use client";
import { useState } from "react";
import AlyeskaMark from "@/components/AlyeskaMark";
import AlyWordmark from "@/components/AlyWordmark";

// Presentation-only navigation. Deliberately does not mount NavTabs' adult
// data subscriptions, account links, or assistant services.
export default function ChildNavigation({ menuRef, navigate, current, counts }) {
  const [tripsOpen, setTripsOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const rows = <>
    <button type="button" className={`arc-pill group child-menu-row ${tripsOpen ? "open" : ""} ${current !== "settings" ? "on" : ""}`}
      aria-expanded={tripsOpen} onClick={() => setTripsOpen(value => !value)}>
      <span className="arc-disc"><MenuIcon kind="trips" /></span>
      <span className="min-w-0"><span className="arc-label block font-semibold">Trips</span>
        <span className="arc-sub block text-xs">Upcoming and past trips</span></span>
      <span className="ml-auto" aria-hidden="true">{tripsOpen ? "⌃" : "⌄"}</span>
    </button>
    {tripsOpen && ["upcoming", "past"].map(group => <button type="button" key={group}
      className={`arc-pill kid child-menu-row ${current === group ? "on" : ""}`}
      aria-current={current === group ? "page" : undefined} onClick={() => navigate(group)}>
      <span className="arc-disc"><MenuIcon kind={group === "past" ? "past" : "trips"} /></span>
      <span className="arc-label font-semibold">{group === "past" ? "Past trips" : "Upcoming trips"}</span>
      <span className="arc-count ml-auto tabular-nums">{counts[group]}</span>
    </button>)}
    <button type="button" className={`arc-pill group child-menu-row ${current === "settings" ? "on" : ""}`}
      aria-current={current === "settings" ? "page" : undefined} onClick={() => navigate("settings")}>
      <span className="arc-disc"><MenuIcon kind="settings" /></span>
      <span><span className="arc-label block font-semibold">Settings</span><span className="arc-sub block text-xs">Your theme</span></span>
    </button>
  </>;
  const dial = turned => <AlyeskaMark className="h-[52px] w-[52px] shrink-0" bezel compact aurora
    auroraId={turned ? "child-menu-open" : "child-menu-closed"} turned={turned} />;
  return <>
    <aside className="card child-desktop-menu menu-arc" aria-label="Trip view menu">
      <div className="mb-5 flex items-center gap-2"><AlyeskaMark className="h-8 w-8 shrink-0" bezel aurora /><AlyWordmark className="text-[14px]" /></div>
      <nav className="space-y-2" aria-label="Main menu">{rows}</nav>
    </aside>
    <nav className="child-bottom-navigation" aria-label="Main menu">
      <button type="button" className="child-menu-dial" aria-label="Open the menu" aria-haspopup="dialog"
        aria-expanded={open} onClick={() => { setOpen(true); menuRef.current?.showModal(); }}>
        <span className="floating-control-label">Menu</span>{dial(false)}
      </button>
    </nav>
    <dialog ref={menuRef} className="child-menu-dialog menu-arc" aria-label="Main menu"
      onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) menuRef.current?.close(); }}>
      <div className="child-menu-panel">
        <h2 className="sr-only">Main menu</h2>
        <nav className="space-y-2" aria-label="Main menu">{rows}</nav>
      </div>
      <button type="button" className="child-menu-dial child-menu-close" aria-label="Close the menu"
        onClick={() => menuRef.current?.close()}>{dial(true)}</button>
    </dialog>
  </>;
}

// Same suitcase, camera, and Settings sliders as the regular navigation.
function MenuIcon({ kind }) {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "settings" ? <>
      <path d="M3 5.6h2.6M8.8 5.6H17M3 10h8.2M14.4 10H17M3 14.4h2.6M8.8 14.4H17" />
      <circle cx="7.2" cy="5.6" r="1.6" /><circle cx="12.8" cy="10" r="1.6" /><circle cx="7.2" cy="14.4" r="1.6" />
    </> : kind === "past" ? <>
      <path d="M3.6 6.9h2.8l1.2-1.8h4.8l1.2 1.8h2.8c.6 0 1.1.5 1.1 1.1v6.4c0 .6-.5 1.1-1.1 1.1H3.6c-.6 0-1.1-.5-1.1-1.1V8c0-.6.5-1.1 1.1-1.1Z" />
      <circle cx="10" cy="11.1" r="2.8" />
    </> : <>
      <rect x="2.8" y="6.2" width="14.4" height="10" rx="2.2" />
      <path d="M7.4 6.2V4.6c0-.6.5-1.1 1.1-1.1h3c.6 0 1.1.5 1.1 1.1v1.6M7.4 16.2v1M12.6 16.2v1" />
    </>}
  </svg>;
}
