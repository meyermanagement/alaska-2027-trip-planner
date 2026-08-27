import PageSkeleton, { Bar, PillRow } from "@/components/PageSkeleton";

/**
 * What Packing templates looks like while it is still being read.
 *
 * Every other screen had one of these and this one did not, so the tab lit up as
 * pending and the page underneath sat there looking finished until the whole
 * thing swapped at once. The shapes below stand in for the real furniture: the
 * packing templates to choose between, the name of the one you are on, the row of
 * people to filter by, and two of the per-person sections with their tinted
 * heading.
 */
function SectionBlock({ rows = 4 }) {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <div className="flex items-center gap-3 border-b border-[var(--line)] bg-sand/60 px-4 py-2.5">
        <Bar className="h-6 w-20" />
        <Bar className="h-3.5 w-16" />
        <Bar className="ml-auto h-6 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 px-4 py-3 ${
            i === 0 ? "" : "border-t border-[var(--line)]"
          }`}
        >
          <Bar className="h-4 flex-1 max-w-xs" />
          <Bar className="hidden h-5 w-20 sm:block" />
          <Bar className="h-5 w-8 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default function LoadingPacking() {
  return (
    <PageSkeleton label="Loading your packing templates">
      <div className="mb-6 space-y-3">
        <Bar className="h-8 w-56 max-w-full" />
        <Bar className="h-4 w-full max-w-2xl" />
        <Bar className="h-4 w-3/4 max-w-xl" />
      </div>
      <PillRow widths={["w-28", "w-24", "w-32", "w-20"]} />
      <div className="mb-4 space-y-3">
        <Bar className="h-6 w-40" />
        <div className="flex flex-wrap gap-2" aria-hidden="true">
          <Bar className="h-7 w-14" />
          <Bar className="h-7 w-16" />
          <Bar className="h-7 w-16" />
          <Bar className="h-7 w-20" />
        </div>
      </div>
      <div className="space-y-4">
        <SectionBlock rows={4} />
        <SectionBlock rows={3} />
      </div>
    </PageSkeleton>
  );
}
