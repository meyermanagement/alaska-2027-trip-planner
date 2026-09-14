import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// The progress chips, a title, and the tall panel the agreement is read in. Held
// at roughly the right height so the gate does not blink empty on the way in --
// a consent screen that flashes is a consent screen people learn to click past.
export default function LoadingBetaConsent() {
  return (
    <PageSkeleton label="Loading the beta agreement">
      <div className="mb-4 flex gap-2" aria-hidden="true">
        <Bar className="h-6 w-14 rounded-full" />
        <Bar className="h-6 w-16 rounded-full" />
        <Bar className="h-6 w-14 rounded-full" />
        <Bar className="h-6 w-12 rounded-full" />
      </div>
      <TitleBlock wide />
      <div className="space-y-4">
        <div className="card space-y-3 p-4" aria-hidden="true">
          <Bar className="h-4 w-40" />
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-11/12" />
          <Bar className="h-4 w-4/5" />
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-3/4" />
        </div>
        <Bar className="h-5 w-72" />
        <Bar className="h-5 w-64" />
        <Bar className="h-10 w-40 rounded-full" />
      </div>
    </PageSkeleton>
  );
}
