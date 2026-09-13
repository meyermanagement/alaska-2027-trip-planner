import { Bar } from "@/components/PageSkeleton";

/**
 * What Meet Aly looks like while it is still being read.
 *
 * This used to be the Compass, spinning, with "Aly is coming to say hi" under
 * it -- and on a refresh it was the second loading screen in a row. The opening
 * veil is already up for the first half-second of a document load, so what the
 * family actually saw was the compass crossing its map, then the veil lifting
 * onto another compass, this one turning on the spot. Two waits, back to back,
 * for one arrival.
 *
 * The rule is one wait at a time, and the swinging compass belongs to the
 * opening. So this is what every other screen in the app does while its data is
 * on its way: the furniture of the real screen, drawn as grey shapes, so the
 * page fills in rather than being replaced. The circle stands in for the mark,
 * the bars for the greeting, and the two panels for the side-by-side answers
 * the screen argues with.
 *
 * No menu bar, because the real screen has none -- this is first-run, before
 * there is anything to navigate to.
 */
export default function LoadingMeetAly() {
  return (
    <main
      className="screen px-5 pb-16 pt-7"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading your introduction to Aly</span>
      <div className="space-y-10" aria-hidden="true">
        <header className="flex items-start gap-4">
          <span className="sk block size-14 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-3">
            <Bar className="h-3.5 w-20" />
            <Bar className="h-8 w-72 max-w-full" />
            <Bar className="h-4 w-full max-w-md" />
          </div>
        </header>

        <div className="space-y-3">
          <Bar className="h-4 w-56 max-w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="card space-y-3 p-4">
                <Bar className="h-3.5 w-24" />
                <Bar className="h-4 w-full" />
                <Bar className="h-4 w-5/6" />
                <Bar className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Bar className="h-4 w-44" />
          <div className="flex flex-wrap gap-2">
            <Bar className="h-8 w-40 rounded-lg" />
            <Bar className="h-8 w-32 rounded-lg" />
            <Bar className="h-8 w-36 rounded-lg" />
            <Bar className="h-8 w-28 rounded-lg" />
          </div>
        </div>

        <Bar className="h-11 w-44 rounded-full" />
      </div>
    </main>
  );
}
