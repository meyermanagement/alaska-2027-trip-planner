"use client";
// Synthetic local QA. Mount temporarily under /login; never ship the route.
import { useState } from "react";
import AlyWordmark from "@/components/AlyWordmark";
import OnTripTips from "@/components/OnTripTips";
import ChildAccessPanel from "@/app/family/child-access/ChildAccessPanel";
import ParentWait from "@/app/welcome/parent/ParentWait";
import ChildAccessReviews from "@/app/admin/child-access/ChildAccessReviews";
import { wordmarkRow } from "@/lib/email/wordmark";
const child = { id: "00000000-0000-0000-0000-000000000022", name: "Sample child", access_level: "secondary" };
export default function Fixture() {
  const [tab, setTab] = useState("Trip");
  const [opened, setOpened] = useState(true);
  const [size, setSize] = useState(26);
  return <main className="mx-auto max-w-3xl px-5 py-8">
    <AlyWordmark as="h1" style={{ fontSize: size }} />
    <div className="my-6 flex flex-wrap gap-2">
      {["Trip", "Parent", "Child", "Review", "Wordmark"].map(name => <button key={name} className="btn btn-secondary" onClick={() => setTab(name)}>{name}</button>)}
      <button className="btn btn-ghost" onClick={() => { document.documentElement.dataset.skin = "daybreak"; }}>Light</button>
      <button className="btn btn-ghost" onClick={() => { document.documentElement.dataset.skin = "aurora"; }}>Dark</button>
    </div>
    {tab === "Trip" && <section className="card p-5">
      <p className="text-xs font-semibold text-teal">Synthetic itinerary</p>
      <h2 className="my-3 text-2xl">A day by the harbor</h2>
      <p className="mb-5 text-sm text-ink-soft">Today: harbor ferry at 2:00. Tomorrow: a coastal trail walk.</p>
      {opened && <OnTripTips tripId="00000000-0000-0000-0000-000000000001" />}
      <button className="btn btn-ghost mt-6" onClick={() => setOpened(!opened)}>{opened ? "Leave trip" : "Open trip"}</button>
    </section>}
    {tab === "Parent" && <ChildAccessPanel initial={{ children: [child], requests: [] }} />}
    {tab === "Child" && <ParentWait />}
    {tab === "Review" && <ChildAccessReviews requests={[{
      id: "00000000-0000-0000-0000-000000000025", travelers: { name: "Sample child" }, ai_requested: true,
    }]} />}
    {tab === "Wordmark" && <section className="card space-y-7 p-5">
      <h2 className="font-semibold">Underline follows Aly at every size</h2>
      {[13, 16, 20, 24, 26, 32].map(px => <div key={px}><p className="mb-2 text-xs">{px}px</p><AlyWordmark style={{ fontSize: px }} /></div>)}
      <label className="block text-sm">Header size <input type="range" min="13" max="40" value={size} onChange={e => setSize(Number(e.target.value))} /></label>
      <div className="rounded-xl p-3" style={{ background: "#fff" }}><table style={{ width: "100%" }}><tbody dangerouslySetInnerHTML={{ __html: wordmarkRow({ siteUrl: "", tagline: "Your plans, looked after." }) }} /></table></div>
    </section>}
  </main>;
}
