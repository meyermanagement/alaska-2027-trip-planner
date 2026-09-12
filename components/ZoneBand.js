/**
 * The heading for one zone of a long screen.
 *
 * The menu learned this shape first: a band is a name for a region, a card is a
 * thing you press. On the packing screen the day packs and the suitcase were
 * both a run of white cards the same width apart, which is two lists that mean
 * different things divided by nothing but a slightly bigger gap. A band over
 * each says which is which without either of them changing.
 *
 * Without onToggle it is a heading and takes no press, so the only things you can
 * work on the screen are the cards below it. With onToggle it opens and shuts the
 * zone it names, the way a menu group does, and then it says so: a chevron that
 * turns, and the pressed state a control is owed.
 */
export default function ZoneBand({
  icon = null,
  name,
  count = "",
  level = 3,
  open = null,
  onToggle = null,
}) {
  const Heading = `h${level}`;
  // The count is content rather than decoration, so it stays in the accessible
  // name of the control that opens the zone instead of being hidden away.
  const inside = (
    <>
      {icon ? (
        <span aria-hidden="true" className="zb-tile">
          {icon}
        </span>
      ) : null}
      {/* A heading may not live inside a button, so when the band opens something
          the heading wraps the button instead and the name is a span. Either way
          the zone has a real heading in the outline. */}
      {onToggle ? (
        <span className="zb-name">{name}</span>
      ) : (
        <Heading className="zb-name">{name}</Heading>
      )}
      {count ? <span className="zb-count">{count}</span> : null}
      {onToggle ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="zb-chevron"
        >
          <path d="M8 5l8 7-8 7" />
        </svg>
      ) : null}
    </>
  );

  if (!onToggle) return <div className="zone-band">{inside}</div>;

  return (
    <Heading className="zb-heading">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open ? "true" : "false"}
        className={`zone-band zb-toggle${open ? " open" : ""}`}
      >
        {inside}
      </button>
    </Heading>
  );
}

export function SunIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

export function CaseIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18" />
    </svg>
  );
}
