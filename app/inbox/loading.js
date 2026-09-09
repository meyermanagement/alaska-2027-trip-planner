import PageSkeleton, {
  Bar,
  CardBlock,
  TitleBlock,
} from "@/components/PageSkeleton";

/**
 * What the inbox looks like while its data is on its way.
 *
 * The frame is the shared one; only the parts the database owns are drawn
 * as grey shapes. Below the title we draw a stand-in for the family
 * address strip (a rectangle roughly the size of the sand-coloured band
 * that carries the address and the Copy button) so the page does not
 * shift down when the real strip appears.
 *
 * We draw three card placeholders roughly the shape of a pending message
 * card, because three is the count the eye reads as "some" rather than
 * "one or none". If the real list turns out to be shorter, the cards fade
 * in place; if longer, the rest arrive under them.
 */
export default function LoadingInbox() {
  return (
    <PageSkeleton label="Loading your inbox">
      <TitleBlock />
      <div
        className="mb-6 h-16 rounded-2xl border border-[var(--line)] bg-sand"
        aria-hidden="true"
      >
        <div className="flex h-full items-center justify-between px-4">
          <div className="min-w-0 space-y-2">
            <Bar className="h-3 w-24" />
            <Bar className="h-4 w-56 max-w-full" />
          </div>
          <Bar className="h-8 w-16 shrink-0 rounded-xl" />
        </div>
      </div>
      <div className="space-y-3">
        <CardBlock lines={2} />
        <CardBlock lines={2} />
        <CardBlock lines={2} />
      </div>
    </PageSkeleton>
  );
}
