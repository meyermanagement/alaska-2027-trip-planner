// The contour drawing pressed faintly behind every trip.
//
// This is the half of the Field Journal look that is not a picture: real
// coastlines, projected around the place the trip is about, drawn as four
// widening echoes of the shoreline standing in for depth contours, the way a
// survey notebook draws water. Land is flat. Nothing here is a claim about
// terrain -- the contours are offsets of the coast, not soundings -- which is why
// they are behind a picture and at a sixth of full strength rather than presented
// as a chart to navigate by.
//
// The land polygons come from Natural Earth at 1:50m, bundled with the app in
// public/data, so nothing here depends on a map key, a tile server or a request
// per card.
//
// Everything in this file is pure: coordinates and a size in, an SVG string out.
// No fetch, no DOM, no React. That is what lets the same function draw a card on
// the server and a header in a browser, and be checked without either.

import { geoMercator, geoPath, geoGraticule } from "d3-geo";

/**
 * Where the drawing is centered, and how much of the world it shows.
 *
 * A trip has one point rather than a route -- see the note in the cover
 * migration; only one trip in eight has any itinerary coordinates -- so the frame
 * is a fixed span around that point instead of a fit to a set of stops. Roughly
 * two and a half degrees puts a recognizable stretch of coast behind Willemstad,
 * Anchorage or Lisbon, and puts something honest behind Orlando and Des Moines
 * too: inland places get graticule and open land, which is what a survey notebook
 * page of Iowa actually looks like.
 */
const SPAN = 2.6;

/**
 * @param {object} at     { lat, lon }
 * @param {number} w      width in px
 * @param {number} h      height in px
 * @param {object} land   the decoded GeoJSON FeatureCollection of land polygons
 * @param {object} o      { span, key, colors } -- key makes the filter ids unique
 *                        per card; colors overrides the three map tokens with
 *                        literal values, which is what a drawing rasterized
 *                        through <img> needs, since an SVG loaded that way
 *                        cannot see the page's custom properties
 * @returns {string} an <svg> element, or "" when there is nothing to draw with
 */
export function contourSvg(at, w, h, land, o = {}) {
  const lat = Number(at?.lat);
  const lon = Number(at?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  if (!land || !w || !h) return "";

  const c = o.colors || {};
  const water = c.water || "var(--map-water)";
  const soil = c.land || "var(--map-land)";
  const line = c.line || "var(--map-line)";

  const span = o.span || SPAN;
  const half = span / 2;
  // Four corners of the frame, fitted rather than a hand-computed scale, so the
  // projection does the arithmetic and the aspect ratio of the card is respected.
  const frame = {
    type: "FeatureCollection",
    features: [
      [lon - half, lat - half],
      [lon + half, lat - half],
      [lon + half, lat + half],
      [lon - half, lat + half],
    ].map((coordinates) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates },
    })),
  };

  const proj = geoMercator();
  proj.fitExtent(
    [
      [0, 0],
      [w, h],
    ],
    frame,
  );
  // Lifted a little above center, so the busiest part of the coast gathers in the
  // open top of the card rather than under the trip's name.
  const t = proj.translate();
  proj.translate([t[0], t[1] - h * 0.06]);

  // Without this the coastline of the entire world is projected and serialized
  // into the card -- 7.7MB of path data for a 620x400 frame, five times over once
  // the echoes are drawn. Clipping in screen space, with a margin wide enough
  // that the widest dilate still has shoreline to grow from, brings that to a few
  // tens of kilobytes and is the difference between a backdrop and a locked tab.
  const margin = 40;
  proj.clipExtent([
    [-margin, -margin],
    [w + margin, h + margin],
  ]);

  const path = geoPath(proj);
  const landPath = path(land) || "";
  const grat = path(geoGraticule().stepMinor([0.5, 0.5])()) || "";

  // Unique per card: two cards on one page each define their own dilate filters,
  // and duplicate ids would have the second card borrow the first card's coast.
  const key = String(o.key || `${lat.toFixed(3)}-${lon.toFixed(3)}`).replace(
    /[^a-zA-Z0-9_-]/g,
    "",
  );
  const rings = [26, 18, 11, 5];

  return [
    // xmlns is not optional here. Inline in an HTML document the parser supplies the
    // SVG namespace, but this same string is also handed to the browser as an image,
    // and a standalone SVG without a namespace is not an SVG -- it is a broken image
    // icon in the corner of the card.
    `<svg xmlns="http://www.w3.org/2000/svg" class="trip-contour" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">`,
    `<defs>${rings
      .map(
        (wd) =>
          `<filter id="c-${key}-${wd}" x="-20%" y="-20%" width="140%" height="140%">` +
          `<feMorphology operator="dilate" radius="${wd / 2}"/>` +
          `<feComposite in2="SourceGraphic" operator="out"/></filter>`,
      )
      .join("")}</defs>`,
    `<rect width="${w}" height="${h}" fill="${water}"/>`,
    `<path d="${grat}" fill="none" stroke="${line}" stroke-width=".5" opacity=".5"/>`,
    // Defined once and referenced. The coast is drawn six times on this card --
    // filled, four echoes and the shoreline itself -- and repeating the path data
    // six times is six times the bytes for identical geometry.
    landPath ? `<defs><path id="l-${key}" d="${landPath}"/></defs>` : "",
    landPath ? `<use href="#l-${key}" fill="${soil}"/>` : "",
    // The echoes. Each is the coastline dilated by a widening radius with the
    // original punched back out, which leaves a band running parallel to the
    // shore -- a contour, drawn the way a plotter would draw one.
    landPath
      ? rings
          .map(
            (wd, i) =>
              `<use href="#l-${key}" fill="none" stroke="${line}" stroke-width="1" opacity="${(
                0.16 +
                i * 0.05
              ).toFixed(
                2,
              )}" stroke-linejoin="round" vector-effect="non-scaling-stroke" filter="url(#c-${key}-${wd})"/>`,
          )
          .join("")
      : "",
    landPath
      ? `<use href="#l-${key}" fill="none" stroke="${line}" stroke-width="1.1"/>`
      : "",
    `</svg>`,
  ].join("");
}
