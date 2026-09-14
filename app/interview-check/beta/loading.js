import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// The same shape the real gate holds -- a step line, a bar, a title, and the
// tall panel the agreement is read in -- so the rehearsal arrives looking like
// the screen it is rehearsing.
export default function LoadingPracticeBetaConsent() {
  return (
    <PageSkeleton label="Loading the practice beta consent screens">
      <div className="mb-4 space-y-2" aria-hidden="true">
        <Bar className="h-3 w-40" />
        <Bar className="h-1 w-full rounded-full" />
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
