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
//
// Both layers are drawn once and then left alone, and that is a performance
// requirement rather than tidiness. The contour is four feMorphology dilates over
// a coastline path of a few thousand segments; inline in the document that filter
// chain is re-run by the compositor on any repaint that touches this stacking
// context -- which on a trip screen is every tab press, because the tab panel
// below shares it. Handed to the browser as an image instead, the filters run
// once at decode and every repaint after that is a bitmap blit. An SVG loaded
// through <img> cannot read the page's custom properties, so the three map colors
// are passed in as literals. The finished drawings are also kept in a module-level
// map, so remounting a card -- or coming back to a trip -- redraws nothing.

import { memo, useCallback, useEffect, useState } from "react";
import { contourSvg } from "@/lib/covers/contour";
import { coverTint } from "@/lib/covers/tint";

let landPromise = null;

// Read off :root once. These are the same three values the stylesheet holds; a
// drawing that has to be readable inside an <img> cannot ask for them by name.
const MAP = {
  water: "#241d12",
  land: "#4c3f2b",
  line: "rgba(244, 231, 203, 0.26)",
};

// key -> data: URI. A trip's drawing depends only on its point and the frame it
// is drawn in, so it is worth keeping for as long as the tab is open.
const drawn = new Map();

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
function TripBackdrop({ trip, shape = "card" }) {
  const [contour, setContour] = useState("");
  // Neither layer is shown until it has decoded, and each fades in on its own.
  // A picture that appears the instant its bytes land snaps into place over a
  // plate the family was already reading; half a second of cross-fade over a
  // ground of the right color reads as the plate finishing rather than as the
  // card changing its mind.
  const [shown, setShown] = useState({});
  const arrived = useCallback((which) => {
    setShown((was) => (was[which] ? was : { ...was, [which]: true }));
  }, []);
  // A cached image can already be complete before React attaches onLoad, in
  // which case the event never fires and the layer would stay invisible.
  const watch = useCallback(
    (which) => (el) => {
      if (el?.complete) arrived(which);
    },
    [arrived],
  );
  const lat = Number(trip?.lat);
  const lon = Number(trip?.lon);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lon);

  useEffect(() => {
    if (!hasPoint) return;
    const key = `${shape}-${lat.toFixed(4)}-${lon.toFixed(4)}`;
    const had = drawn.get(key);
    if (had) {
      setContour(had);
      return;
    }
    let alive = true;
    const w = shape === "head" ? 1040 : 620;
    const h = shape === "head" ? 300 : 400;
    land().then((data) => {
      if (!alive || !data) return;
      const svg = contourSvg({ lat, lon }, w, h, data, {
        key,
        colors: MAP,
      });
      if (!svg) return;
      // encodeURIComponent rather than base64: the string is a few tens of
      // kilobytes of path data and skipping the base64 pass keeps it smaller and
      // avoids btoa choking on anything non-Latin-1.
      const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      drawn.set(key, uri);
      if (alive) setContour(uri);
    });
    return () => {
      alive = false;
    };
  }, [hasPoint, lat, lon, shape]);

  const url = trip?.cover_image_url || null;

  return (
    <div
      className="trip-media"
      aria-hidden={url ? undefined : "true"}
      // Painted on the server, in the first frame, before anything is fetched.
      style={{ backgroundImage: coverTint(trip) }}
    >
      {contour ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={watch("contour")}
          className={`trip-contour${shown.contour ? " is-in" : ""}`}
          src={contour}
          alt=""
          decoding="async"
          onLoad={() => arrived("contour")}
        />
      ) : null}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={watch("photo")}
          className={`trip-photo${shown.photo ? " is-in" : ""}`}
          src={url}
          alt={trip.cover_image_alt || ""}
          loading="lazy"
          decoding="async"
          onLoad={() => arrived("photo")}
        />
      ) : null}
      <div className="trip-scrim" />
    </div>
  );
}

// A trip's backdrop does not change when the tab below it does, and re-rendering
// it is the expensive half of a tab press.
export default memo(TripBackdrop, (a, b) => {
  const x = a.trip || {};
  const y = b.trip || {};
  return (
    a.shape === b.shape &&
    x.id === y.id &&
    x.lat === y.lat &&
    x.lon === y.lon &&
    x.cover_image_url === y.cover_image_url &&
    x.cover_image_alt === y.cover_image_alt
  );
});
