import PageSkeleton, { Bar } from "@/components/PageSkeleton";

/**
 * What the bucket list looks like while it is still being read.
 *
 * Every other screen had one of these and this one did not, so pressing Bucket
 * List lit the row as pending and then left whatever page you were on sitting
 * there looking finished until the whole thing swapped at once. It is the slowest
 * of them to arrive, too: as well as the places it reads the fares, the people
 * and the trips, and then works out a verdict for every open fare before the
 * first pixel is sent. Long enough to wonder whether the press landed.
 *
 * The shapes stand in for the real furniture in the order it appears: the
 * heading and its line, the sort row, three places with the name, the line of
 * who and when under it, the sentence about why, and the controls along the
 * bottom of each card. The drawer at the foot is the forwarding address.
 */
function PlaceBlock({ why = true }) {
  return (
    <li className="card space-y-2 p-3" aria-hidden="true">
      <Bar className="h-6 w-44 max-w-full" />
      <Bar className="h-3.5 w-64 max-w-full" />
      {why ? <Bar className="h-3.5 w-full max-w-lg" /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <Bar className="h-8 w-32" />
        <Bar className="h-4 w-28" />
        <Bar className="h-4 w-24" />
      </div>
      <Bar className="h-4 w-40" />
      <Bar className="h-4 w-44" />
    </li>
  );
}

export default function LoadingSomeday() {
  return (
    <PageSkeleton label="Loading your bucket list">
      <div className="mb-6 space-y-3">
        <Bar className="h-8 w-48 max-w-full" />
        <Bar className="h-4 w-full max-w-2xl" />
        <Bar className="h-4 w-3/4 max-w-xl" />
      </div>

      <div className="tabbar mb-6 flex gap-4" aria-hidden="true">
        <Bar className="h-10 w-24" />
        <Bar className="h-10 w-32" />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" aria-hidden="true">
        <Bar className="h-7 w-20" />
        <Bar className="h-7 w-20" />
      </div>

      <ul className="space-y-3">
        <PlaceBlock />
        <PlaceBlock />
        <PlaceBlock why={false} />
      </ul>

      <div className="mt-8 space-y-3" aria-hidden="true">
        <Bar className="h-4 w-56" />
        <Bar className="h-10 w-full max-w-sm" />
      </div>
    </PageSkeleton>
  );
}
