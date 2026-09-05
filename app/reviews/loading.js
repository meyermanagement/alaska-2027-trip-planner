import PageSkeleton, { Bar } from "@/components/PageSkeleton";

/**
 * What Past reviews looks like while it is being read.
 *
 * This screen asks for every trip, then every reviewable item on the finished
 * ones, then folds five nights of the same hotel into one place -- so it is one
 * of the slower pages in the app, and it was the one page with no skeleton. The
 * tab lit up as pending and whatever screen you left sat there looking finished
 * until the whole thing swapped at once.
 *
 * The shapes stand in for the real furniture, in the real order: the title and
 * its line, the search box with the trip picker beside it, the group and sort
 * controls, then two headed groups of place cards two to a row.
 */
function PlaceCard() {
  return (
    <div className="card flex flex-col gap-2.5 p-4" aria-hidden="true">
      <div className="flex items-start gap-2.5">
        <Bar className="h-6 w-6 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bar className="h-4 w-40 max-w-full" />
          <Bar className="h-3 w-28" />
        </div>
      </div>
      <Bar className="h-3.5 w-full" />
      <Bar className="h-3.5 w-2/3" />
      <div className="mt-1 flex items-center gap-3 border-t border-[var(--line)] pt-2.5">
        <Bar className="h-3.5 w-24" />
        <Bar className="ml-auto h-3.5 w-16" />
      </div>
    </div>
  );
}

function GroupBlock({ cards = 2 }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3" aria-hidden="true">
        <Bar className="h-6 w-44 max-w-[60%]" />
        <span className="h-px flex-1 bg-sand-deep" />
        <Bar className="h-3.5 w-16 shrink-0" />
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <PlaceCard key={i} />
        ))}
      </div>
    </div>
  );
}

export default function LoadingReviews() {
  return (
    <PageSkeleton label="Loading your past reviews">
      <div className="mb-6 space-y-3">
        <Bar className="h-8 w-52 max-w-full" />
        <Bar className="h-4 w-full max-w-2xl" />
        <Bar className="h-4 w-2/3 max-w-lg" />
      </div>
      <div className="mb-4 space-y-2.5" aria-hidden="true">
        <div className="flex flex-wrap items-center gap-2">
          <Bar className="h-11 min-w-[12rem] flex-1 rounded-xl" />
          <Bar className="h-11 min-w-[10rem] flex-1 rounded-xl sm:max-w-[16rem]" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Bar className="h-7 w-24" />
          <Bar className="h-7 w-20" />
          <Bar className="h-7 w-20" />
          <Bar className="ml-auto h-7 w-28" />
        </div>
      </div>
      <div className="space-y-6">
        <GroupBlock cards={2} />
        <GroupBlock cards={2} />
      </div>
    </PageSkeleton>
  );
}
