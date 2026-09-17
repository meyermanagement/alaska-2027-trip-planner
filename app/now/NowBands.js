import Link from "next/link";

// The three things a family wants at a glance, in the order that a morning
// actually sorts them: what cannot wait, what cannot all be true, and what has
// arrived and not been dealt with. Each band is quiet when it is empty, because
// a heading over nothing teaches you to stop reading the headings.
//
// Deliberately not a fourth list of tasks. The standing list of everything due
// is below these bands, drawn by the same Reminders component the menu used to
// send you to -- these are only the lines pulled out of it that today is about.

function Band({ tone = "plain", title, count, children }) {
  const edge =
    tone === "hot"
      ? "border-rose/40"
      : tone === "warm"
        ? "border-[color:var(--color-amber,#b4762a)]/40"
        : "border-[var(--line)]";
  return (
    <section className={`card mt-4 border ${edge} p-0`}>
      <h2 className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2.5 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
        <span>{title}</span>
        {count ? <span className="text-ink-soft">{count}</span> : null}
      </h2>
      <div className="divide-y divide-[var(--line)]">{children}</div>
    </section>
  );
}

function Row({ href, lead, body, note }) {
  const inner = (
    <>
      <p className="text-sm font-semibold">{lead}</p>
      {body ? <p className="mt-0.5 text-sm text-ink-soft">{body}</p> : null}
      {note ? <p className="mt-1 text-xs text-ink-soft">{note}</p> : null}
    </>
  );
  if (!href) return <div className="px-4 py-3">{inner}</div>;
  return (
    <Link
      href={href}
      className="block px-4 py-3 transition-colors hover:bg-sand/40"
    >
      {inner}
    </Link>
  );
}

export default function NowBands({ pressing = [], clashes = [], waiting = 0 }) {
  const nothing = !pressing.length && !clashes.length && !waiting;

  if (nothing) {
    return (
      <p className="mt-4 max-w-prose text-sm text-ink-soft">
        Nothing is late, nothing on a trip contradicts anything else, and no
        mail is waiting to be filed. Everything still to come is in the list
        below.
      </p>
    );
  }

  return (
    <>
      {pressing.length ? (
        <Band tone="hot" title="Needs you today" count={pressing.length}>
          {pressing.map((item) => (
            <Row
              key={item.id}
              href={item.href}
              lead={item.title}
              body={item.tripName}
              note={item.note}
            />
          ))}
        </Band>
      ) : null}

      {clashes.length ? (
        <Band tone="warm" title="Does not add up" count={clashes.length}>
          {clashes.map((item) => (
            <Row
              key={item.id}
              href={item.href}
              lead={item.headline}
              body={item.detail}
            />
          ))}
        </Band>
      ) : null}

      {waiting ? (
        <Band title="Arrived, not filed yet" count={waiting}>
          <Row
            href="/inbox"
            lead={
              waiting === 1
                ? "One message is waiting to be put on a trip"
                : `${waiting} messages are waiting to be put on a trip`
            }
            body="Bookings, fare alerts and policies forwarded to your trips address."
          />
        </Band>
      ) : null}
    </>
  );
}
