"use client";

// Tap-to-toggle chips, used for saying who is on a trip. Filled means yes,
// dashed outline means no.
//
// Pass no onToggle and they become plain reading matter: same filled-and-dashed
// language, no button, nothing to press. That is what a secondary traveler gets.
// Who is going and which animals are coming are worth knowing even when they are
// not yours to decide, so the answer stays and only the tapping goes.
export default function MembershipChips({
  items,
  activeIds,
  onToggle,
  busyId,
  emptyText = "Nothing to choose from yet.",
}) {
  if (!items.length) {
    return <p className="text-sm text-ink-soft">{emptyText}</p>;
  }

  const readOnly = typeof onToggle !== "function";

  return (
    <div className="no-print flex flex-wrap gap-1.5">
      {items.map((item) => {
        const active = activeIds.includes(item.id);
        const box = `flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
          active
            ? "border-teal bg-teal text-on-accent"
            : "border-dashed border-[var(--line)] bg-white text-ink-soft"
        }`;
        const dot = item.color && (
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: active ? "#fff" : item.color }}
          />
        );
        const emoji = item.emoji && (
          <span aria-hidden="true">{item.emoji}</span>
        );

        if (readOnly) {
          return (
            <span key={item.id} className={box}>
              {dot}
              {emoji}
              {item.label}
              <span className="sr-only">
                {active ? " — on this trip" : " — not on this trip"}
              </span>
            </span>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item, !active)}
            disabled={busyId === item.id}
            aria-pressed={active}
            className={`${box} transition disabled:opacity-50 ${
              active ? "" : "hover:border-teal/50 hover:text-teal"
            }`}
          >
            {dot}
            {emoji}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
