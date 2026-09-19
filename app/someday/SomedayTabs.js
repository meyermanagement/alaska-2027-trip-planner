"use client";

import { useEffect, useState } from "react";
import { tabKeyDown } from "@/lib/ui/tabs";

const fareHashes = new Set(["#fares", "#saved-fares", "#forward-fares"]);

export default function SomedayTabs({ places, fares, fareCount = 0 }) {
  const [tab, setTab] = useState("places");
  const [faresVisited, setFaresVisited] = useState(false);
  const [hashTarget, setHashTarget] = useState("");

  useEffect(() => {
    function followHash() {
      const hash = window.location.hash;
      const next = fareHashes.has(hash) ? "fares" : "places";
      setHashTarget(hash);
      setTab(next);
      if (next === "fares") setFaresVisited(true);
    }
    followHash();
    window.addEventListener("hashchange", followHash);
    window.addEventListener("popstate", followHash);
    return () => {
      window.removeEventListener("hashchange", followHash);
      window.removeEventListener("popstate", followHash);
    };
  }, []);

  useEffect(() => {
    if (tab !== "fares") return;
    const frame = requestAnimationFrame(() => {
      const hash = hashTarget;
      if (hash === "#forward-fares" || hash === "#saved-fares") {
        const target = document.getElementById(hash.slice(1));
        if (hash === "#forward-fares" && target) target.open = true;
        target?.scrollIntoView({ block: "center" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [tab, faresVisited, hashTarget]);

  function show(next) {
    setTab(next);
    setHashTarget(`#${next}`);
    if (next === "fares") setFaresVisited(true);
    // Changing tabs should not fetch the entire household again or scroll away.
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#${next}`);
  }

  return <>
    <nav className="tabbar no-print mt-6" role="tablist" aria-label="Bucket list & fares" onKeyDown={tabKeyDown}>
      {[["places", "Places"], ["fares", "Fare alerts"]].map(([id, label]) => (
        <button key={id} type="button" role="tab" className="tab"
          id={`someday-tab-${id}`} aria-controls={`someday-panel-${id}`}
          tabIndex={tab === id ? 0 : -1} aria-selected={tab === id}
          onClick={() => show(id)}>
          {label}
          {id === "fares" && fareCount > 0 && <span className="ml-1.5 text-xs font-semibold text-ink-faint tabular-nums">{fareCount}</span>}
        </button>
      ))}
    </nav>
    <div id="someday-panel-places" role="tabpanel" aria-labelledby="someday-tab-places" tabIndex={0} hidden={tab !== "places"} className="mt-6">{places}</div>
    <div id="someday-panel-fares" role="tabpanel" aria-labelledby="someday-tab-fares" tabIndex={0} hidden={tab !== "fares"} className="mt-6">{faresVisited ? fares : null}</div>
  </>;
}
