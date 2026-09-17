"use client";

import { useId, useState } from "react";

/**
 * The one row of controls that narrows a list.
 *
 * Before this there were four grammars in the app for the same errand. Packing
 * alone had a native select for the category, solid pills for the person, a
 * pale-teal toggle for what was already packed, and a right-floated checkbox for
 * the last-minute things -- four mechanisms on one screen, none of which looked
 * like the other three, and none of which said how many rows were behind them.
 * Reminders and the trip's task list shared a chip component that nothing else
 * used. The Inbox had three raw dropdowns. The bucket list had the best version
 * of the idea, hand-rolled and stranded on one screen.
 *
 * This is the bucket list's version, promoted. Its rules, and why:
 *
 * Counts on every chip. A filter that does not say what is behind it makes you
 * press it to find out, and pressing it is how you lose your place.
 *
 * The empty chip stays, dimmed and unpressable. A chip that disappears when the
 * last row behind it is dealt with makes the whole row move under a thumb that
 * was aiming at the chip beside it.
 *
 * A running tally, said once, at the top. "43 of 111" is the answer to the
 * question the chips raise, and it belongs beside the search box rather than
 * repeated under every group.
 *
 * Rare questions fold into a drawer. A question asked on one visit in ten should
 * not cost three wrapped lines on the other nine.
 *
 * On a phone the legend sits above its chips rather than in a left gutter, since
 * a gutter wide enough for the word PRIORITY leaves the chips a strip too narrow
 * to hold two of them.
 *
 * Shape of a group:
 *   { id, legend, options: [{ id, label, count, icon }], value, onChange, multi }
 *
 * `value` is an id for a single-choice group, or an array of ids when `multi`.
 * A group with `drawer: true` lives behind More.
 */

function Chip({ option, active, empty, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={empty && !active}
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-1.5 rounded-full border border-teal bg-teal px-2.5 py-1 text-sm font-medium text-white"
          : empty
            ? "inline-flex cursor-default items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-sm text-ink-faint opacity-60"
            : "inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-sm text-ink-soft transition hover:border-[var(--line-hover)] hover:text-ink"
      }
    >
      {option.icon}
      {option.label}
      {/* The count is part of the chip, not a badge on it. Kept faint when the
          chip is off so the label still reads first. */}
      {option.count !== undefined && option.count !== null ? (
        <span className={active ? "" : "text-ink-faint"}>{option.count}</span>
      ) : null}
    </button>
  );
}

function Group({ group }) {
  const multi = Boolean(group.multi);
  // For a single-choice group the empty string is a real answer, not the absence
  // of one: it is what the All or Everyone chip carries, and that chip has to be
  // able to look chosen.
  const chosen = multi
    ? new Set(group.value || [])
    : new Set([group.value ?? ""]);

  function press(id) {
    if (!multi) {
      // Pressing the chip that is already on clears it, which is the only way
      // back to no answer once one is set.
      group.onChange(group.value === id ? "" : id);
      return;
    }
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    group.onChange([...next]);
  }

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2.5">
      {group.legend ? (
        <span className="shrink-0 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-soft sm:w-[5.5rem] sm:text-right">
          {group.legend}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {group.options.map((option) => (
          <Chip
            key={option.id || "all"}
            option={option}
            active={chosen.has(option.id)}
            empty={option.count === 0}
            onClick={() => press(option.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default function FilterBar({
  search,
  tally,
  groups = [],
  onClear,
  className = "",
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const searchId = useId();

  const front = groups.filter((one) => !one.drawer);
  const back = groups.filter((one) => one.drawer);

  // A group is answered when it is somewhere other than where it rests. Most
  // groups rest on the All chip, so an empty value is the resting value; a
  // group that must always be on something -- how the page is grouped, what
  // order it is in -- names its resting value instead, so its default does not
  // read as a filter somebody chose.
  const isAnswered = (one) => {
    if (one.multi) return (one.value || []).length > 0;
    const resting = one.resting ?? "";
    return (one.value ?? "") !== resting;
  };

  // How many answers are currently narrowing the list, which is what tells
  // somebody whether an empty list is empty or merely filtered.
  const answered = groups.filter(isAnswered).length;

  const backAnswered = back.filter(isAnswered).length;

  if (!search && !front.length && !back.length) return null;

  return (
    <div
      className={`rounded-xl border border-[var(--line)] bg-white/60 p-3 ${className}`}
    >
      {search || tally ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {search ? (
            <div className="min-w-0 flex-1 basis-[14rem]">
              <label className="sr-only" htmlFor={searchId}>
                {search.label || "Search this list"}
              </label>
              <input
                id={searchId}
                type="search"
                className="field w-full py-1.5 text-sm"
                value={search.value}
                placeholder={search.placeholder || "Search"}
                onChange={(event) => search.onChange(event.target.value)}
              />
            </div>
          ) : null}

          {/* The answer to the question the chips raise, said once. */}
          {tally ? (
            <p className="shrink-0 text-sm text-ink-soft" aria-live="polite">
              {tally.shown === tally.total
                ? `${tally.total} ${tally.total === 1 ? tally.noun : tally.plural || `${tally.noun}s`}`
                : `${tally.shown} of ${tally.total}`}
            </p>
          ) : null}

          {answered || (search && search.value) ? (
            <button
              type="button"
              className="shrink-0 text-sm text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
              onClick={onClear}
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

      {front.length ? (
        <div
          className={`flex flex-col gap-2 ${search || tally ? "mt-2.5" : ""}`}
        >
          {front.map((group) => (
            <Group key={group.id} group={group} />
          ))}
        </div>
      ) : null}

      {back.length ? (
        <div className="mt-2.5">
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((was) => !was)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition hover:text-ink ${
              backAnswered
                ? "border-teal/60 font-medium text-ink"
                : "border-[var(--line)] text-ink-soft hover:border-[var(--line-hover)]"
            }`}
          >
            More
            {/* An answered drawer is marked, not filled. A solid chip here reads
                as a filter you chose on purpose, and the drawer usually holds a
                default somebody never touched. */}
            {backAnswered ? (
              <span className="rounded-full bg-teal px-1.5 text-xs font-semibold text-white">
                {backAnswered}
              </span>
            ) : null}
            <svg
              viewBox="0 0 12 12"
              className={`h-3 w-3 transition-transform ${moreOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {moreOpen ? (
            <div className="mt-2 flex flex-col gap-2">
              {back.map((group) => (
                <Group key={group.id} group={group} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
