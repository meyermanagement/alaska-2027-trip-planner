"use client";

// Two doors on the Wallet: what you hold, and what you have already dealt with.
//
// The screen used to be one column that ran cards, then refusals, then a
// disclosure holding cleared tips, so the further you scrolled the more of it
// was about decisions already made. That is the wrong shape for a screen whose
// job is to answer "which card do I put this on" -- the live answer and the
// record of retired ones were competing for the same page.
//
// So the record moves behind a second tab. It is not fetched or mounted until
// somebody goes there, which also means the cleared-tips request stops firing on
// a screen nobody opened it for.
//
// Both panels are passed in from the server page rather than built here, because
// the cards need the family's rows and the record needs the refusals, and both
// are already read there.

import { useState } from "react";

export default function WalletTabs({ cards, history, historyCount = 0 }) {
  const [tab, setTab] = useState("cards");

  return (
    <>
      <div className="mt-6 min-w-0">
        <nav className="tabbar no-print" role="tablist" aria-label="Wallet">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "cards"}
            onClick={() => setTab("cards")}
            className="tab"
          >
            Cards and programs
          </button>
          {/* The count is the whole reason to look: a History tab with nothing
              behind it is a door you open once and never again, and a number on
              it is the difference between "there is a record" and "there are
              four things in it." */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            onClick={() => setTab("history")}
            className="tab"
          >
            History
            {historyCount > 0 && (
              <span className="ml-1.5 text-xs font-semibold text-ink-faint tabular-nums">
                {historyCount}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Hidden rather than unmounted for the cards, so switching to the record
          and back does not throw away a half-typed balance or a form somebody
          had open. The record is the other way round -- genuinely absent until
          asked for -- because mounting it is what fetches it. */}
      <div className={tab === "cards" ? "mt-6" : "hidden"}>{cards}</div>
      {tab === "history" ? <div className="mt-6">{history}</div> : null}
    </>
  );
}
