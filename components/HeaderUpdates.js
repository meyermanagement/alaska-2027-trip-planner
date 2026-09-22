"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import InboxBanner from "./InboxBanner";
import TipStrip from "./TipStrip";
import { onTipResolved } from "@/lib/tips/cleared";
import { needsProminence } from "@/lib/ui/notices";
import { onTipHeaderHidden } from "@/lib/tips/header";
import { visibleHeaderTips } from "@/lib/tips/update";

export default function HeaderUpdates({ inboxCount = 0, inboxNeedsTrip = 0, fareCount = 0, tips = [], today, readOnly = false }) {
  const pathname = usePathname() || "";
  const [resolved, setResolved] = useState({});
  const [hidden, setHidden] = useState({});
  useEffect(() => onTipHeaderHidden((id) => {
    setHidden((previous) => ({ ...previous, [id]: true }));
  }), []);
  useEffect(
    () =>
      onTipResolved((id, status) =>
        setResolved((previous) => ({ ...previous, [id]: status })),
      ),
    [],
  );
  const shown = visibleHeaderTips(tips).filter((tip) => !resolved[tip.id] && !hidden[tip.id]);
  const urgent = shown.filter((tip) => needsProminence(tip, today));
  const other = shown.filter((tip) => !needsProminence(tip, today));
  const mail = pathname.startsWith("/inbox") ? 0 : inboxCount;
  const fares = readOnly || pathname.startsWith("/someday") ? 0 : fareCount;
  const count = mail + other.length + fares;
  return (
    <>
      <TipStrip tips={urgent} today={today} readOnly={readOnly} />
      {count > 0 && (
        <details className="header-updates no-print">
          <summary>
            {count} {count === 1 ? "update" : "updates"} to review
            <span>Show details</span>
          </summary>
          <InboxBanner count={mail} needsTrip={mail ? inboxNeedsTrip : 0} />
          {fares > 0 && <Link href="/someday#fares" className="block px-4 py-3 text-sm font-semibold text-teal">
            {fares} new {fares === 1 ? "fare" : "fares"} to review
          </Link>}
          <TipStrip tips={other} today={today} readOnly={readOnly} />
        </details>
      )}
    </>
  );
}
