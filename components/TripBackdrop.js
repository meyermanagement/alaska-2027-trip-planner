"use client";

// What sits behind a trip: the illustration Aly drew, printed as a duotone, over
// a contour drawing of the coast the trip is on.
//
// Two layers, and either one may be missing:
//
//   The contour needs a point, which a trip gets the first time anybody asks for
//   its cover. Without one there is paper and nothing else, which is a fine
//   backdrop and the honest one -- an invented coastline behind a trip would be
//   decoration pretending to be a map.
//
//   The picture needs Aly to have drawn it. Until she has, the contour carries
//   the card on its own, which is exactly what the Field Journal direction does
//   for a trip with no photograph.
//
// The coastline data is 540KB, so it is fetched once per browser session, after
// the page has painted, shared between every card on the screen, and cached by
// the browser after that. A card renders immediately without it and gains the
// coast a moment later; nothing waits on the map.

import { useEffect, useState } from "react";
import { contourSvg } from "@/lib/covers/contour";

let landPromise = null;

function land() {
  if (!landPromise) {
    landPromise = (async () => {
      const [mod, res] = await Promise.all([
        import("topojson-client"),
        fetch("/data/land-50m.json"),
      ]);
      // topojson-client is CommonJS, and which of these two holds the function
      // depends on how the bundler interops it. Reading only the named export
      // worked on the server and was undefined in the browser, which failed
      // silently into the catch below and left every card without a coast.
      const feature = mod.feature || mod.default?.feature;
      if (typeof feature !== "function") throw new Error("no topojson feature");
      if (!res.ok) throw new Error(`land ${res.status}`);
      const topo = await res.json();
      return feature(topo, topo.objects.land);
    })().catch((err) => {
      if (process.env.NODE_ENV !== "production") console.error("land", err);
      // A failed fetch should not be retried on every card on the page, and the
      // cards are already correct without it.
      return null;
    });
  }
  return landPromise;
}

/**
 * @param {object} trip     needs lat, lon, cover_image_url, cover_image_alt
 * @param {string} shape    "card" | "head" -- only the frame proportions differ
 */
export default function TripBackdrop({ trip, shape = "card" }) {
  const [svg, setSvg] = useState("");
  const lat = Number(trip?.lat);
  const lon = Number(trip?.lon);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon);

  useEffect(() => {
    if (!hasPoint) return;
    let alive = true;
    const w = shape === "head" ? 1040 : 620;
    const h = shape === "head" ? 300 : 400;
    land().then((data) => {
      if (!alive || !data) return;
      setSvg(
        contourSvg({ lat, lon }, w, h, data, { key: `${shape}-${trip.id}` }),
      );
    });
    return () => {
      alive = false;
    };
  }, [hasPoint, lat, lon, shape, trip?.id]);

  const url = trip?.cover_image_url || null;

  return (
    <div className="trip-media" aria-hidden={url ? undefined : "true"}>
      {svg ? (
        <div
          className="trip-contour-holder"
          // The SVG is built by this app from bundled coordinates -- there is no
          // path from anything a person types to what is inserted here.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={trip.cover_image_alt || ""}
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <div className="trip-scrim" />
    </div>
  );
}
