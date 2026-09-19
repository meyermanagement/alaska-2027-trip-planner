"use client";
// Local review fixture only. Removed before the production build.
import ProTips from "@/components/ProTips";
import WalletLogo from "@/components/WalletLogo";
import TripBoard from "@/app/trips/TripBoard";
import { CATALOG } from "@/lib/rewards-catalog";
import { Suspense, useEffect, useState } from "react";

const cases = [
  { title: "Arrival by air", day: "Day 1 · Arrival", first: "Land at City Airport", time: "1:10 PM",
    from: "City Airport", to: "Harbor Hotel", distance: "14.2 mi", mode: "Drive", duration: "25–35 min",
    last: "Check in · Harbor Hotel", lastTime: "3:00 PM" },
  { title: "Arrival by train", day: "Day 1 · Arrival", first: "Arrive at Central Station", time: "2:20 PM",
    from: "Central Station", to: "Garden Hotel", distance: "0.6 mi", mode: "Walk", duration: "12 min",
    last: "Check in · Garden Hotel", lastTime: "3:00 PM" },
  { title: "Changing hotels", day: "Day 4 · Move to the coast", first: "Check out · Garden Hotel", time: "11:00 AM",
    from: "Garden Hotel", to: "Harbor Hotel", distance: "8.4 mi", mode: "Drive", duration: "20–30 min",
    last: "Check in · Harbor Hotel", lastTime: "3:00 PM" },
  { title: "Departure day", day: "Day 7 · Heading home", first: "Leave Harbor Hotel", time: "8:30 AM",
    from: "Harbor Hotel", to: "City Airport", distance: "14.2 mi", mode: "Drive", duration: "30 min",
    last: "Flight home · City Airport", lastTime: "11:00 AM", note: "Leave time includes a 2-hour airport buffer." },
];
export default function Fixture() {
  const [ready,setReady]=useState(false);
  useEffect(()=>setReady(true),[]);
  return <main data-ready={ready} style={{maxWidth:1100,margin:"0 auto",padding:"32px 20px 60px"}}>
    {["credit_card","programs"].map(group=><section key={group} id={`logos-${group}`} className="mb-12">
      <p className="text-sm text-teal font-semibold">ALYESKA · WALLET ARTWORK</p>
      <h1 className="text-2xl font-semibold mt-2">{group==="credit_card"?"Credit cards":"Rewards programs"}</h1>
      <p className="text-sm text-ink-soft mt-2">Locally bundled artwork. Each card and program matched separately.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-5">
        {CATALOG.filter(p=>group==="credit_card"?p.kind==="credit_card":p.kind!=="credit_card").map(p=>
          <div key={p.brand} className="card flex items-center gap-3 p-4">
            <WalletLogo program={p}/><span className="text-sm font-semibold">{p.brand}</span>
          </div>)}
      </div>
    </section>)}
    <section id="transfer-examples">
      <p className="text-sm text-teal font-semibold">ALYESKA · DESIGN EXAMPLES</p>
      <h1 className="mt-2 text-2xl font-semibold">The distance between plans</h1>
      <p className="mt-2 text-sm text-ink-soft">A compact transfer row, right between the bookings it connects.</p>
      <p className="mt-1 text-xs text-ink-soft">Illustrative locations, times and distances. Not live trip data.</p>
      <div className="grid gap-5 md:grid-cols-2 mt-6">
        {cases.map(c => <section className="card overflow-hidden" key={c.title}>
          <header className="p-5 border-b border-[var(--line)]">
            <h2 className="font-semibold text-lg">{c.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{c.day}</p>
          </header>
          <div className="p-5">
            <div className="flex gap-3 items-baseline justify-between text-sm"><strong>{c.first}</strong><span className="shrink-0 text-ink-soft">{c.time}</span></div>
            <div className="my-4 ml-1 border-l-2 border-teal pl-4 py-1">
              <p className="text-xs text-ink-soft">{c.from} → {c.to}</p>
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 items-baseline">
                <strong className="text-teal">{c.distance}</strong><span className="text-ink-soft">·</span>
                <strong>{c.duration}</strong><span className="text-sm text-ink-soft">{c.mode.toLowerCase()}</span>
              </div>
              <div className="mt-2 flex justify-between items-center gap-3">
                <span className="text-xs text-ink-soft">Estimated · not live traffic</span>
                <span className="text-sm text-teal font-semibold">Directions ↗</span>
              </div>
              {c.note && <p className="mt-2 text-xs text-ink-soft">{c.note}</p>}
            </div>
            <div className="flex gap-3 items-baseline justify-between text-sm"><strong>{c.last}</strong><span className="shrink-0 text-ink-soft">{c.lastTime}</span></div>
          </div>
        </section>)}
      </div>
      <p className="mt-5 text-sm text-ink-soft">Missing location? “Add the hotel address to calculate this transfer.”</p>
    </section>
    <section id="wallet-check" className="mt-12">
      <h2 className="text-xl font-semibold mb-4">Wallet</h2>
      <div className="card flex items-center gap-4 p-5 mb-5">
        <WalletLogo program={{kind:"cruise",brand:"Holland America Mariner Society"}} />
        <div><p className="font-semibold">Holland America Mariner Society</p><p className="text-sm text-ink-soft">Cruise rewards</p></div>
      </div>
      <ProTips scope="wallet" canLook autoLook={false} lastLookedAt="2020-01-01"
        chain={[{scope:"wallet"},{scope:"offers"}]} today="2026-09-19"
        emptyFresh="Ask Aly to check for pro tips when you want a fresh look." />
    </section>
    <section id="secondary-check" className="mt-12">
      <h2 className="text-xl font-semibold mb-4">Secondary traveler</h2>
      <Suspense><TripBoard secondary current={[]} upcoming={[]} drafts={[]} past={[]} today="2026-09-19" /></Suspense>
    </section>
  </main>;
}
