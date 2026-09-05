/* Its own bar rather than the one in PageSkeleton, which is a server component --
   it reads the chosen skin off a cookie -- and this file is imported by the board
   itself, on the client, so that a menu press can put the skeleton back up without
   a trip to the server. One rounded grey bar is not worth sharing across that
   boundary. */
function Bar({ className = "" }) {
  return <span className={`sk block rounded-full ${className}`} />;
}

/**
 * The shape of the trip board while it is being read.
 *
 * Shared by three callers, which is why it is its own file: the route's
 * `loading.js`, for arriving here from another screen; the keyed boundary in
 * `page.js`, for a group typed or shared as an address; and the board itself, for a
 * group asked for from the menu while the board is already on screen. That last one
 * exists because those three menu rows are one screen with a different group
 * showing -- the address changes without the segment unmounting, and a segment that
 * does not unmount never shows its `loading.js` again.
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
