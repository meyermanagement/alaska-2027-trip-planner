import { formatFullDay } from "@/lib/format";

/**
 * The first line of the app.
 *
 * It replaces a page title, and it is allowed to: this screen is the front door
 * now, and "Now" as a heading told a family nothing they did not already know
 * from having pressed the app. What earns the space is the date -- because half
 * of what the screen says is dated -- and one sentence about what today is,
 * written by the page from the trips it just read.
 *
 * The greeting is worked out on the server, in the household's own zone, so it
 * cannot say good morning to somebody's evening because the machine rendering it
 * sits in a different one.
 */
export default function NowGreeting({ greeting, name, today, sentence, count }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Now · {formatFullDay(today)}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
        {count ? (
          <span
            className="rounded-full bg-sand px-2 py-0.5 text-xs font-semibold text-ink-soft"
            aria-label={`${count} needing you`}
          >
            {count}
          </span>
        ) : null}
      </div>
      {sentence && (
        <p className="mt-1 max-w-prose text-sm text-ink-soft">{sentence}</p>
      )}
    </div>
  );
}
