"use client";

import Link from "next/link";
import { tripReturnTarget } from "@/lib/trips/return";
import { PendingSwap } from "./LinkPending";

export default function TripBackLink({ trip, today }) {
  const { href, label } = tripReturnTarget(trip, today);
  return (
    <Link href={href} className="no-print mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-teal hover:bg-teal/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
      <PendingSwap href={href}>
        <span aria-hidden="true" className="text-lg leading-none">←</span>
      </PendingSwap>
      <span>{label}</span>
    </Link>
  );
}
