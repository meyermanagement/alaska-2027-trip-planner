import { Bar } from "@/components/PageSkeleton";

/**
 * The shape of the trip board while it is being read.
 *
 * Shared by two callers, which is why it is its own file: the route's
 * `loading.js`, for arriving here from another screen, and the keyed boundary in
 * `page.js`, for moving between Trip Builder, Planned Trips and Trip Log. Those
 * three are one screen with a different group showing, so the address changes
 * without the segment unmounting -- and a segment that does not unmount never
 * shows its `loading.js` again. The boundary is keyed on the group so each of
 * those presses gets this back.
 *
 * A group strip, then cards two to a row, each a picture with a line of words
 * and a couple of counts under it.
 */
export default function BoardSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="flex flex-wrap items-center gap-2">
        <Bar className="h-8 w-28" />
        <Bar className="h-8 w-32" />
        <Bar className="h-8 w-24" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="card overflow-hidden p-0"
            style={{ opacity: 1 - i * 0.12 }}
          >
            <Bar className="h-32 w-full rounded-none" />
            <div className="space-y-2.5 p-4">
              <Bar className="h-5 w-40 max-w-full" />
              <Bar className="h-3.5 w-28" />
              <div className="flex gap-2 pt-1">
                <Bar className="h-3.5 w-20" />
                <Bar className="h-3.5 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
