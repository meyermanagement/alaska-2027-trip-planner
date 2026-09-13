// The keyframes behind the short opening's endless crossing.
//
// The route is a tile: a curve whose two ends sit at the same offset across the
// tile and leave it at the same angle, so laying copies of it end to end draws
// one line with no joint. Travelling it is then a matter of moving the map --
// the compass stays in the middle of the screen and the ground comes to it --
// and because the tile's span is a whole number of graticule cells, the moment
// the map has travelled one tile it is pixel-identical to where it began. That
// is what lets the crossing run for as long as a load takes instead of playing
// a clip and starting over.
//
// Everything here is in rems, at the same scale the route is drawn at, because
// the graticule repeats every 4.75rem and the two have to agree exactly. Run
// `node scripts/opening-route.mjs` and paste the output into app/globals.css.

const CELL = 4.75;

// Tall: a climb. Both ends sit at x=20 with a vertical tangent, and the tile is
// twelve cells high, which is taller than a phone held upright -- so no one ever
// sees the same bend twice on one screen.
const TALL = {
  name: "tall",
  span: 12 * CELL, // 57rem
  axis: "y",
  width: 40,
  height: 12 * CELL,
  segments: [
    ["C", 20, 57, 20, 47, 6, 45, 6, 36],
    ["S", 34, 30, 34, 21],
    ["S", 20, 10, 20, 0],
  ],
};

// Wide: a crossing. Both ends sit at y=20 with a horizontal tangent, and the
// tile is twenty-four cells across, wider than a laptop window.
const WIDE = {
  name: "wide",
  span: 24 * CELL, // 114rem
  axis: "x",
  width: 24 * CELL,
  height: 40,
  segments: [
    ["C", 0, 20, 10, 20, 14, 8, 24, 8],
    ["S", 44, 32, 54, 32],
    ["S", 78, 6, 88, 6],
    ["S", 106, 20, 114, 20],
  ],
};

// Cubic segments, with the shorthand's first control point reflected the way
// SVG reflects it, so the path in the component and the path sampled here are
// the same curve.
function cubics(tile) {
  const out = [];
  let cursor = null;
  let previousControl = null;
  for (const segment of tile.segments) {
    if (segment[0] === "C") {
      const [, x0, y0, c1x, c1y, c2x, c2y, x, y] = segment;
      out.push([
        [x0, y0],
        [c1x, c1y],
        [c2x, c2y],
        [x, y],
      ]);
      cursor = [x, y];
      previousControl = [c2x, c2y];
    } else {
      const [, c2x, c2y, x, y] = segment;
      const c1 = [
        2 * cursor[0] - previousControl[0],
        2 * cursor[1] - previousControl[1],
      ];
      out.push([cursor, c1, [c2x, c2y], [x, y]]);
      cursor = [x, y];
      previousControl = [c2x, c2y];
    }
  }
  return out;
}

function at(curve, t) {
  const [p0, p1, p2, p3] = curve;
  const u = 1 - t;
  const point = (i) =>
    u * u * u * p0[i] +
    3 * u * u * t * p1[i] +
    3 * u * t * t * p2[i] +
    t * t * t * p3[i];
  const slope = (i) =>
    3 * u * u * (p1[i] - p0[i]) +
    6 * u * t * (p2[i] - p1[i]) +
    3 * t * t * (p3[i] - p2[i]);
  return { x: point(0), y: point(1), dx: slope(0), dy: slope(1) };
}

// Walked at a constant speed rather than a constant parameter: a bezier covers
// ground faster in the middle of its own t, and a compass that hurried through
// every bend and dawdled at every straight would read as a machine rather than
// as something being carried.
function walk(tile, frames) {
  const curves = cubics(tile);
  const steps = 4000;
  const samples = [];
  let length = 0;
  let last = at(curves[0], 0);
  samples.push({ ...last, s: 0 });
  for (let i = 1; i <= steps; i += 1) {
    const t = (i / steps) * curves.length;
    const index = Math.min(curves.length - 1, Math.floor(t));
    const point = at(curves[index], t - index);
    length += Math.hypot(point.x - last.x, point.y - last.y);
    samples.push({ ...point, s: length });
    last = point;
  }

  const out = [];
  let cursor = 0;
  for (let f = 0; f <= frames; f += 1) {
    const target = (f / frames) * length;
    while (cursor < samples.length - 2 && samples[cursor + 1].s < target) {
      cursor += 1;
    }
    const a = samples[cursor];
    const b = samples[cursor + 1];
    const span = b.s - a.s || 1;
    const k = (target - a.s) / span;
    out.push({
      at: (f / frames) * 100,
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      dx: a.dx + (b.dx - a.dx) * k,
      dy: a.dy + (b.dy - a.dy) * k,
    });
  }
  return out;
}

const round = (n) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

// Where the map has to sit for the point of the route the compass is on to land
// in the middle of the screen. The tile is centred on the veil, so this is the
// offset from the tile's own centre, negated.
function offset(tile, frame) {
  return {
    x: round(tile.width / 2 - frame.x),
    y: round(tile.height / 2 - frame.y),
  };
}

// The needle reads the direction of travel, not the shape of the tile: zero is
// north, and the drawing is at a single scale in both axes, so this is the true
// heading rather than one corrected for a stretched picture.
function heading(frame) {
  return round((Math.atan2(frame.dx, -frame.dy) * 180) / Math.PI);
}

function emit(tile) {
  // Thirty-six frames. The camera is interpolated in straight lines between
  // them, so too few leaves the compass cutting the corner of its own route at
  // the tightest bends; this many holds it inside a pixel or two of the line
  // everywhere, which is closer than the width of the dash.
  const frames = walk(tile, 36);
  const lines = [];

  lines.push(`@keyframes quick-cam-${tile.name} {`);
  for (const frame of frames) {
    const o = offset(tile, frame);
    lines.push(`  ${round(frame.at)}% {`);
    lines.push(`    transform: translate(${o.x}rem, ${o.y}rem);`);
    lines.push("  }");
  }
  lines.push("}", "");

  lines.push(`@keyframes quick-ground-${tile.name} {`);
  for (const frame of frames) {
    const o = offset(tile, frame);
    lines.push(`  ${round(frame.at)}% {`);
    lines.push("    background-position:");
    lines.push(`      ${o.x}rem ${o.y}rem,`);
    lines.push(`      ${o.x}rem ${o.y}rem;`);
    lines.push("  }");
  }
  lines.push("}", "");

  lines.push(`@keyframes quick-head-${tile.name} {`);
  for (const frame of frames) {
    lines.push(`  ${round(frame.at)}% {`);
    lines.push(`    transform: rotate(${heading(frame)}deg);`);
    lines.push("  }");
  }
  lines.push("}", "");

  const parked = frames[Math.round(frames.length / 2) - 1];
  const o = offset(tile, parked);
  lines.push(
    `/* parked, ${tile.name}: cam translate(${o.x}rem, ${o.y}rem)` +
      ` -- ground ${o.x}rem ${o.y}rem -- needle ${heading(parked)}deg */`,
    "",
  );
  return lines.join("\n");
}

process.stdout.write([emit(TALL), emit(WIDE)].join("\n"));
