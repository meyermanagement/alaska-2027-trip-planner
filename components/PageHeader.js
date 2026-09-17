/**
 * The first forty pixels of every room.
 *
 * Thirty-eight screens used to write their own heading, and the class strings
 * had drifted: some carried mt-1, some mt-3, some mb-1, some mb-6, some none at
 * all, and a few screens had no heading whatsoever. The eye re-anchored on
 * every move between them. This owns the four things a room's top is made of --
 * the name, how many of the thing there are, the sentence that says what the
 * screen is for, and the one action the screen exists to offer -- so that
 * moving between rooms costs nothing.
 *
 * The count is a badge rather than a parenthetical because it is a fact about
 * the list, not part of the list's name, and because at a glance a badge reads
 * as "how many" without being read as a word.
 */
export default function PageHeader({
  title,
  count,
  subtitle,
  action,
  above,
  children,
  className = "",
}) {
  const hasCount = count !== undefined && count !== null;

  return (
    <div className={`mb-6 ${className}`}>
      {/* The way back, on the screens that are one level down. Above the title
          rather than beside it, because it is not part of the name. */}
      {above && <div className="mb-1">{above}</div>}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-3xl font-semibold text-ink">
              {title}
            </h1>
            {hasCount && (
              <span
                className="rounded-full bg-sand px-2 py-0.5 text-xs font-semibold text-ink-soft"
                // Said out loud, because on its own the badge is a bare number
                // sitting next to a word.
                aria-label={`${count} in total`}
              >
                {count}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 max-w-prose text-sm text-ink-soft">{subtitle}</p>
          )}
        </div>

        {/* The screen's single primary action. Anything secondary belongs
            further down, beside the thing it acts on.

            Full width below sm, because once the row has wrapped the action is
            on its own line anyway, and a button that stops short of the edge on
            a phone reads as though something were missing beside it. Above sm it
            shrinks back to its own width and sits at the right. */}
        {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
      </div>

      {/* For a screen that needs something under the header but above its
          content -- a scope switch, a filter bar -- so the gap stays this
          component's business rather than each screen's. */}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
