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
export default function NowGreeting({ greeting, name, today, sentence }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Now · {formatFullDay(today)}
      </div>
      {/* No count beside the name. The number lives on the Now row in the menu,
          where it is worth having because that screen is not the one you are
          looking at; here the bands underneath carry their own counts, and the
          sentence below says the same thing in words. */}
      <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
        {greeting}
        {name ? `, ${name}` : ""}
      </h1>
      {sentence && (
        <p className="mt-1 max-w-prose text-sm text-ink-soft">{sentence}</p>
      )}
    </div>
  );
}
