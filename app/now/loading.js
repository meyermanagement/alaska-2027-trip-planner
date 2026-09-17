import PageSkeleton, {
  CardBlock,
  RowsBlock,
  TitleBlock,
} from "@/components/PageSkeleton";

/**
 * Now is the slowest screen in the app to assemble and the one people open
 * most often from cold: it reads every open task with its trip, the household,
 * the roster, the morning runs and the count of unfiled mail, and then runs the
 * contradiction rules over every upcoming trip's itinerary and animals. Without
 * this the menu press did nothing visible for a second or more.
 *
 * The shapes are the screen's own order rather than a generic stack -- the
 * three bands first, because they are what somebody came here to read, then the
 * morning line, then the list. Bands that turn out to be empty simply do not
 * arrive, which reads as the page settling rather than as something vanishing.
 */
export default function LoadingNow() {
  return (
    <PageSkeleton label="Working out what needs you">
      <TitleBlock />
      <div className="mt-6 space-y-3">
        <CardBlock lines={2} />
        <CardBlock lines={1} />
      </div>
      <div className="mt-6 space-y-4">
        <RowsBlock rows={2} />
        <RowsBlock rows={3} />
      </div>
    </PageSkeleton>
  );
}
