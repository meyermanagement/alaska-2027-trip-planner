"use client";

// Cashing in the note a promotion left behind.
//
// This draws nothing and shows nothing. It is mounted on the screens that render
// trips, and its whole job is to notice a trip whose row says its picture has
// been asked for and has not been drawn yet, and to make the request that draws
// it -- the request nobody was around to make at the moment the trip stopped
// being a draft.
//
// Why a screen and not the server: the promotion itself must not wait forty
// seconds for an image model, and work started and not awaited inside a
// serverless function is work that gets killed when the response goes out. A
// note on the row plus the next screen that sees it is slower in the worst case
// and survives everything -- the tab closing, the phone locking, the deploy
// happening in between.
//
// Three properties it needs, and each is one line below:
//
//   asked once     a mounted screen must not ask twice for the same trip, or a
//                  re-render would buy a second picture
//   one at a time  the trips board can be showing four newly promoted trips,
//                  and four image requests at once is four times the cost and
//                  four times the chance of a 429. The soonest trip goes first
//                  and the rest wait for the next render
//   quiet failure  a picture is decoration. Nothing on these screens depends on
//                  it, so a failure says nothing to anybody and leaves the row
//                  marked failed, which is what the button reads to offer
//                  another go

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { coverQueued } from "@/lib/covers/queue";

export default function CoverQueue({ trips = [] }) {
  const router = useRouter();
  const asked = useRef(new Set());

  // The trips waiting, soonest first. A trip with no start date sorts last:
  // whatever it is, it is not the one about to be looked at.
  const waiting = trips
    .filter((trip) => trip?.id && coverQueued(trip))
    .sort((a, b) =>
      String(a.start_date || "9999").localeCompare(String(b.start_date || "9999")),
    );
  const next = waiting.find((trip) => !asked.current.has(trip.id));
  const id = next?.id || null;

  useEffect(() => {
    if (!id) return;
    // Marked before the request rather than after it, so a re-render while the
    // drawing is in flight -- and there will be several, since a trip screen is
    // live-synced -- does not ask again.
    asked.current.add(id);

    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/trips/${id}/cover`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ auto: true }),
        });
        const json = await res.json().catch(() => ({}));
        // A refresh only when there is something new to see. Somebody else's
        // browser winning the claim is the common case on a family account, and
        // refreshing the page for it would be a screen that reloads itself for
        // no visible reason.
        if (alive && res.ok && json.status === "ready") router.refresh();
      } catch {
        // Deliberately silent. See above.
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, router]);

  return null;
}
