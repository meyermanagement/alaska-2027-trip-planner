"use client";
import LocationProTips from "@/components/LocationProTips";
import { useState } from "react";
const day = new Intl.DateTimeFormat("en-CA").format(new Date());
export default function Fixture() {
  const [location, setLocation] = useState(null);
  return <main className="mx-auto max-w-3xl p-4">
    <p className="text-xs text-ink-soft">LOCAL REVIEW · SYNTHETIC PLANS AND REPORTS</p>
    <header className="my-5"><h1 className="text-3xl font-semibold">A day in Maui</h1><p className="mt-2 text-ink-soft">Your itinerary · Today</p></header>
    <div className="flex gap-2"><button className="btn btn-ghost" onClick={() => { document.documentElement.dataset.skin = "daybreak"; }}>Daybreak</button><button className="btn btn-ghost" onClick={() => { document.documentElement.dataset.skin = "aurora"; }}>Midnight Aurora</button></div>
    <LocationProTips trip={{ id: "00000000-0000-0000-0000-000000000010", status: "planned", start_date: day, end_date: day }} onLocationChange={setLocation} />
    <section className="card p-5"><h2 className="text-lg font-semibold">Today&apos;s plans</h2><p className="mt-2">Harbor ferry · 2:00 PM</p>
      <p data-testid="origin" className="mt-2 text-sm text-teal">{location ? "From your current location" : "From the previous planned stop"}</p>
    </section>
  </main>;
}
