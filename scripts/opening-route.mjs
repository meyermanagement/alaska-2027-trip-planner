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

// Three crossings, each drawn as a pair of tiles -- one for a screen taller than
// it is wide and one for a screen wider than it is tall. Which pair a load gets
// is decided once, in the script in the document head, so a family that opens
// the app four times in an afternoon is carried over four different pieces of
// coast rather than the same one four times.
//
// Every tile in a column obeys the same two rules, which is what lets them share
// one set of styles: the portrait ones run from x=20 at the bottom to x=20 at the
// top with a vertical tangent at both ends and stand twelve graticule cells high,
// and the landscape ones run from y=20 on the left edge to y=20 on the right with
// a horizontal tangent at both ends and lie twenty-four cells across. Equal spans
// also mean equal clocks, so the map moves at one speed whichever crossing came
// up.
const ROUTES = [
  {
    id: 1,
    // A long swing out to the west and back: one decision, taken slowly.
    tall: [
      ["C", 20, 57, 20, 47, 6, 45, 6, 36],
      ["S", 34, 30, 34, 21],
      ["S", 20, 10, 20, 0],
    ],
    wide: [
      ["C", 0, 20, 10, 20, 14, 8, 24, 8],
      ["S", 44, 32, 54, 32],
      ["S", 78, 6, 88, 6],
      ["S", 106, 20, 114, 20],
    ],
  },
  {
    id: 2,
    // Wider and later: it holds its line, then commits to two big arcs. The
    // portrait one reaches within four rems of both edges of its tile, which is
    // the most a phone can be given before the route leaves the screen sideways.
    tall: [
      ["C", 20, 57, 20, 48, 36, 47, 36, 38],
      ["S", 4, 33, 4, 24],
      ["S", 20, 9, 20, 0],
    ],
    wide: [
      ["C", 0, 20, 14, 20, 18, 34, 32, 34],
      ["S", 60, 4, 74, 4],
      ["S", 100, 20, 114, 20],
    ],
  },
  {
    // Six bends against the others' three, so the camera is turning more often
    // and a frame is worth more: sampled half again as densely, which is what
    // brings the compass back inside two pixels of its own line.
    frames: { tall: 56, wide: 64 },
    id: 3,
    // A coastline: shorter bends, more of them, none of them dramatic. This is
    // the one that reads as detail rather than as a journey, and it is the reason
    // the set is worth having -- three tempers, not three drawings.
    tall: [
      ["C", 20, 57, 20, 50, 27, 48, 27, 42],
      ["S", 13, 36, 13, 30],
      ["S", 27, 24, 27, 18],
      ["S", 20, 7, 20, 0],
    ],
    wide: [
      ["C", 0, 20, 8, 20, 12, 30, 20, 30],
      ["S", 32, 8, 40, 8],
      ["S", 52, 26, 60, 26],
      ["S", 74, 12, 82, 12],
      ["S", 96, 24, 104, 24],
      ["S", 112, 20, 114, 20],
    ],
  },
];

// The two shapes of tile, and the geometry every route in that column shares.
const SHAPES = {
  tall: {
    name: "tall",
    axis: "y",
    width: 40,
    height: 12 * CELL,
    span: 12 * CELL,
  },
  wide: {
    name: "wide",
    axis: "x",
    width: 24 * CELL,
    height: 40,
    span: 24 * CELL,
  },
};

// A tile is a shape plus one route's segments.
function tileOf(route, kind) {
  return {
    ...SHAPES[kind],
    id: route.id,
    segments: route[kind],
    frames: route.frames?.[kind] ?? 48,
  };
}

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

function keyframes(tile) {
  // Forty-eight frames by default. The camera is interpolated in straight lines
  // between them, so too few leaves the compass cutting the corner of its own
  // route at the tightest bends and the needle reading a heading it had a moment
  // ago; this many holds the housing inside a pixel or two of the line and the
  // needle inside a few degrees of the tangent. Routes with more bends per tile
  // ask for more, and say so themselves.
  const frames = walk(tile, tile.frames);
  const suffix = `${tile.name}-${tile.id}`;
  const lines = [];

  lines.push(`@keyframes quick-cam-${suffix} {`);
  for (const frame of frames) {
    const o = offset(tile, frame);
    lines.push(`  ${round(frame.at)}% {`);
    lines.push(`    transform: translate(${o.x}rem, ${o.y}rem);`);
    lines.push("  }");
  }
  lines.push("}", "");

  lines.push(`@keyframes quick-ground-${suffix} {`);
  for (const frame of frames) {
    const o = offset(tile, frame);
    lines.push(`  ${round(frame.at)}% {`);
    lines.push("    background-position:");
    lines.push(`      ${o.x}rem ${o.y}rem,`);
    lines.push(`      ${o.x}rem ${o.y}rem;`);
    lines.push("  }");
  }
  lines.push("}", "");

  lines.push(`@keyframes quick-head-${suffix} {`);
  for (const frame of frames) {
    lines.push(`  ${round(frame.at)}% {`);
    lines.push(`    transform: rotate(${heading(frame)}deg);`);
    lines.push("  }");
  }
  lines.push("}", "");

  const parked = frames[Math.round(frames.length / 2) - 1];
  return {
    css: lines.join("\n"),
    parked: offset(tile, parked),
    heading: heading(parked),
  };
}

// Route one is also the fallback: a document with no attribute on it, because a
// script was blocked or an old page is still in a cache, gets the first
// crossing rather than none of them.
function pick(id) {
  if (id === ROUTES[0].id) {
    return `html${ROUTES.slice(1)
      .map((route) => `:not([data-route="${route.id}"])`)
      .join("")}`;
  }
  return `html[data-route="${id}"]`;
}

const indent = (text, pad) =>
  text
    .split("\n")
    .map((line) => (line ? `${pad}${line}` : line))
    .join("\n");

// Which crossing a load is on decides three animation names, one displayed field
// per orientation, and -- for anyone who has asked their machine to stop moving
// things -- where the whole picture parks. All of it is written out here rather
// than by hand, because there are eighteen keyframes now and a name typed
// wrongly in a stylesheet fails silently: the map simply sits still.
function bindings(parked) {
  const rows = (kind, body) =>
    ROUTES.map((route) => indent(body(route, kind), "")).join("\n\n");

  const fields = (shown, hidden) =>
    [
      ROUTES.map(
        (route) => `${pick(route.id)} .quick-${shown}.quick-r${route.id}`,
      ).join(",\n") + " {\n  display: block;\n}",
      ROUTES.map(
        (route) => `${pick(route.id)} .quick-${hidden}.quick-r${route.id}`,
      ).join(",\n") + " {\n  display: none;\n}",
    ].join("\n\n");

  const motion = (kind) =>
    rows(
      kind,
      (route) =>
        `${pick(route.id)} .quick-cam {\n  animation-name: quick-cam-${kind}-${route.id};\n}\n\n` +
        `${pick(route.id)} .quick-grid {\n  animation-name: quick-ground-${kind}-${route.id};\n}`,
    );

  const heads = (kind) =>
    rows(
      kind,
      (route) =>
        `${pick(route.id)} .quick-${kind} .quick-heading {\n` +
        `  animation-name: quick-head-${kind}-${route.id};\n}`,
    );

  const still = (kind) =>
    rows(kind, (route) => {
      const p = parked[`${kind}-${route.id}`];
      return (
        `${pick(route.id)} .quick-cam {\n  animation: none;\n` +
        `  transform: translate(${p.at.x}rem, ${p.at.y}rem);\n}\n\n` +
        `${pick(route.id)} .quick-grid {\n  animation: none;\n  background-position:\n` +
        `    ${p.at.x}rem ${p.at.y}rem,\n    ${p.at.x}rem ${p.at.y}rem;\n}\n\n` +
        `${pick(route.id)} .quick-${kind} .quick-heading {\n  animation: none;\n` +
        `  transform: rotate(${p.heading}deg);\n}`
      );
    });

  return [
    "/* Written by scripts/opening-route.mjs together with the keyframes above:",
    "   the names, the fields and the parked values all have to agree with them.",
    "   Everything from the first keyframe to the end marker is generated. */",
    "",
    "/* Only one field is ever shown: the crossing this load drew, in the shape",
    "   the window is. Portrait first, then the landscape overrides. */",
    ".quick-field {\n  display: none;\n}",
    "",
    fields("tall", "wide"),
    "",
    motion("tall"),
    "",
    heads("tall"),
    "",
    "@media (orientation: landscape) {",
    indent(
      [fields("wide", "tall"), motion("wide"), heads("wide")].join("\n\n"),
      "  ",
    ),
    "}",
    "",
    "/* Parked halfway along whichever tile came up, needle on the heading it",
    "   would have had there, for anyone who has asked for less movement. */",
    "@media (prefers-reduced-motion: reduce) {",
    indent(still("tall"), "  "),
    "",
    "  @media (orientation: landscape) {",
    indent(still("wide"), "    "),
    "  }",
    "}",
    "",
    "/* End of the generated crossings. */",
    "",
  ].join("\n");
}

const blocks = [];
const parked = {};
for (const route of ROUTES) {
  for (const kind of ["tall", "wide"]) {
    const out = keyframes(tileOf(route, kind));
    blocks.push(out.css);
    parked[`${kind}-${route.id}`] = { at: out.parked, heading: out.heading };
  }
}

process.stdout.write([...blocks, bindings(parked)].join("\n"));
