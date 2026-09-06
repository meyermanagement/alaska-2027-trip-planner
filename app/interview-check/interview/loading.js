import PageSkeleton, { Bar } from "@/components/PageSkeleton";

// Same shape as the real interview -- a heading, two option cards and a
// reason band -- so practice and real fill in the same way.
export default function LoadingPracticeInterview() {
  return (
    <PageSkeleton label="Loading the practice interview">
      <div className="mx-auto w-full max-w-2xl px-1 pt-6">
        <div className="space-y-3" aria-hidden="true">
          <Bar className="h-3 w-32" />
          <Bar className="h-8 w-3/4" />
          <Bar className="h-4 w-2/3" />
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2" aria-hidden="true">
          <Bar className="h-28 w-full rounded-2xl" />
          <Bar className="h-28 w-full rounded-2xl" />
        </div>
        <div className="mt-6 space-y-2" aria-hidden="true">
          <Bar className="h-4 w-40" />
          <Bar className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    </PageSkeleton>
  );
}
