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
import { useSkin } from "@/components/SkinWatch";
import { contourSvg } from "@/lib/covers/contour";
import { coverTint, coverToken } from "@/lib/covers/tint";

let landPromise = null;

// A drawing that has to survive inside an <img> cannot ask for a custom property
// by name -- the data URI is its own document, with no :root to read -- so the
// three map colors have to be resolved to literals before the SVG is written.
// They are read off the live page rather than written out here, which is what
// lets a skin change the coast: Midnight Aurora draws it on near-black water,
// Daybreak Aurora on pale ice.
//
// Falls back to the Field Journal values, so a drawing asked for before the
// stylesheet has applied is the app's own brown rather than transparent.
const MAP_FALLBACK = {
  water: "#241d12",
  land: "#4c3f2b",
  line: "rgba(244, 231, 203, 0.26)",
};

function mapColors() {
  if (typeof window === "undefined") return MAP_FALLBACK;
  const style = getComputedStyle(document.documentElement);
  const pick = (name, spare) => style.getPropertyValue(name).trim() || spare;
  return {
    water: pick("--map-water", MAP_FALLBACK.water),
    land: pick("--map-land", MAP_FALLBACK.land),
    line: pick("--map-line", MAP_FALLBACK.line),
  };
}

// Which skin a drawing was made for. Part of the cache key below, because the
// same trip at the same size is a different picture in a different skin -- and
// without this, changing skin left every coast already drawn on the old water.
function skinNow() {
  if (typeof document === "undefined") return "journal";
  return document.documentElement.dataset.skin || "journal";
}

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
 * @param {boolean} plain   drop the trip's own ground and take the plate's
 *                          instead. For the Current panel, whose whole job is to
 *                          be the one card on the screen without a color of its
 *                          own -- and whose ground has to come from CSS, since the
 *                          rule that flips its polarity cannot outrank an inline
 *                          style.
 */
function TripBackdrop({ trip, shape = "card", plain = false }) {
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
  // Read at render rather than inside the effect, so that it is a dependency and
  // a skin change redraws the coast instead of leaving the old one in place.
  const skin = useSkin();

  useEffect(() => {
    if (!hasPoint) return;
    const key = `${skin}-${shape}-${lat.toFixed(4)}-${lon.toFixed(4)}`;
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
        colors: mapColors(),
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
  }, [hasPoint, lat, lon, shape, skin]);

  const url = trip?.cover_image_url || null;

  return (
    <div
      className="trip-media"
      aria-hidden={url ? undefined : "true"}
      // Painted on the server, in the first frame, before anything is fetched.
      // --trip-hue is the same choice as one flat color, for the wash below.
      style={
        plain
          ? { "--trip-hue": coverToken(trip) }
          : {
              backgroundImage: coverTint(trip),
              "--trip-hue": coverToken(trip),
            }
      }
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
      {/* The trip's own color, laid over the coastline and under the picture.
          Without it the ground was decoration nobody saw: the contour is drawn
          at full opacity in the skin's map colors, so every located trip came
          out the same blue-grey or the same brown and only the handful with no
          point at all showed a color of their own. Blended as `color`, which
          takes hue and saturation from this layer and lightness from the drawing
          underneath -- so the coast keeps every line it had, a light skin stays
          light and a dark one stays dark, and the picture above, being blended
          as luminosity, now prints as a duotone in the trip's color rather than
          in the map's. */}
      <div className="trip-wash" />
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
    a.plain === b.plain &&
    x.id === y.id &&
    x.lat === y.lat &&
    x.lon === y.lon &&
    x.cover_image_url === y.cover_image_url &&
    x.cover_image_alt === y.cover_image_alt
  );
});
