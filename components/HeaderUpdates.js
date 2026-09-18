"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import InboxBanner from "./InboxBanner";
import TipStrip from "./TipStrip";
import { onTipResolved } from "@/lib/tips/cleared";
import { needsProminence } from "@/lib/ui/notices";

export default function HeaderUpdates({ inboxCount = 0, tips = [], today }) {
  const pathname = usePathname() || "";
  const [resolved, setResolved] = useState({});
  useEffect(
    () =>
      onTipResolved((id, status) =>
        setResolved((previous) => ({ ...previous, [id]: status })),
      ),
    [],
  );
  const shown = tips.filter((tip) => !resolved[tip.id]);
  const urgent = shown.filter((tip) => needsProminence(tip, today));
  const other = shown.filter((tip) => !needsProminence(tip, today));
  const mail = pathname.startsWith("/inbox") ? 0 : inboxCount;
  const count = mail + other.length;
  return (
    <>
      <TipStrip tips={urgent} today={today} />
      {count > 0 && (
        <details className="header-updates no-print">
          <summary>
            {count} {count === 1 ? "update" : "updates"} to review
            <span>Show details</span>
          </summary>
          <InboxBanner count={mail} />
          <TipStrip tips={other} today={today} />
        </details>
      )}
    </>
  );
}
