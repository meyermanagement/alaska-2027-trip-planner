const P = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const BUCKET = [
  {
    key: "B1",
    name: "A bucket",
    d: [
      "M5.1 6.9h9.8l-1 8.2a1.6 1.6 0 0 1-1.6 1.4H7.7a1.6 1.6 0 0 1-1.6-1.4Z",
      "M7.2 6.9a2.8 2.8 0 0 1 5.6 0",
    ],
  },
  {
    key: "B2",
    name: "A star",
    d: [
      "M10 3.4l2.1 4.2 4.6.7-3.3 3.3.8 4.6-4.2-2.2-4.2 2.2.8-4.6L3.3 8.3l4.6-.7Z",
    ],
  },
  {
    key: "B3",
    name: "A globe",
    d: [
      "M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6Z",
      "M3.2 10h13.6",
      "M10 3.2c1.9 1.9 2.9 4.2 2.9 6.8s-1 4.9-2.9 6.8c-1.9-1.9-2.9-4.2-2.9-6.8S8.1 5.1 10 3.2Z",
    ],
  },
  {
    key: "B4",
    name: "A heart",
    d: [
      "M10 16.4C6.4 13.7 4 11.6 4 9a3.3 3.3 0 0 1 6-1.9A3.3 3.3 0 0 1 16 9c0 2.6-2.4 4.7-6 7.4Z",
    ],
  },
];

const LOG = [
  {
    key: "L1",
    name: "A stamp, ticked",
    d: [
      "M10 3.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6Z",
      "M6.8 10.1l2.2 2.2 4.2-4.4",
    ],
  },
  {
    key: "L2",
    name: "A book with a bookmark",
    d: [
      "M5 3.6h9.4c.6 0 1.1.5 1.1 1.1v11.7H6.1A1.1 1.1 0 0 1 5 15.3Z",
      "M5 13.2h10.5",
      "M9.4 3.6v4.4l1.8-1.2 1.8 1.2V3.6",
    ],
  },
  {
    key: "L3",
    name: "A photo, stacked",
    d: [
      "M7 4.1h8.9c.6 0 1.1.5 1.1 1.1v7c0 .6-.5 1.1-1.1 1.1H7c-.6 0-1.1-.5-1.1-1.1v-7c0-.6.5-1.1 1.1-1.1Z",
      "M3.9 6.9c-.6 0-1.1.5-1.1 1.1v6.9c0 .6.5 1.1 1.1 1.1h9",
      "M8.1 10.9l2.1-2.1 2.6 2.6 1.3-1.3 1.4 1.4",
    ],
  },
  {
    key: "L4",
    name: "A camera",
    d: [
      "M3.6 6.9h2.8l1.2-1.8h4.8l1.2 1.8h2.8c.6 0 1.1.5 1.1 1.1v6.4c0 .6-.5 1.1-1.1 1.1H3.6c-.6 0-1.1-.5-1.1-1.1V8c0-.6.5-1.1 1.1-1.1Z",
      "M10 13.9a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z",
    ],
  },
];

function Row({ item, label, sub }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <svg {...P} className="h-5 w-5 shrink-0 text-ink">
        {item.d.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
      <span className="min-w-0">
        <span className="block text-[0.95rem] font-medium text-ink">
          {label}
        </span>
        <span className="block text-xs text-ink-soft">{sub}</span>
      </span>
      <span className="ml-auto font-mono text-xs text-ink-faint">
        {item.key} {item.name}
      </span>
    </div>
  );
}

export default function Page({ searchParams }) {
  const which = searchParams?.set === "log" ? "log" : "bucket";
  const items = which === "log" ? LOG : BUCKET;
  const label = which === "log" ? "Trip Log" : "Bucket List";
  const sub = which === "log" ? "Trips already taken" : "Places you want to go";
  return (
    <div className="max-w-xl p-4">
      <h1 className="page-title">{label} icon options</h1>
      <div className="mt-3 rounded-2xl border border-[var(--line)] bg-white p-2">
        {items.map((item) => (
          <Row key={item.key} item={item} label={label} sub={sub} />
        ))}
      </div>
      <p className="section-label mt-4">At strip size, and small</p>
      <div className="mt-2 flex flex-wrap items-end gap-6 rounded-2xl border border-[var(--line)] bg-white p-4">
        {items.map((item) => (
          <span key={item.key} className="flex flex-col items-center gap-2">
            <svg {...P} className="h-7 w-7 text-ink">
              {item.d.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </svg>
            <svg {...P} className="h-4 w-4 text-ink">
              {item.d.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </svg>
            <span className="font-mono text-xs text-ink-faint">{item.key}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
