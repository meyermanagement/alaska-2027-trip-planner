import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// A form with a home box, a person row and a save button. The placeholder is
// three cards of roughly the right height so the page never blinks empty.
export default function LoadingWelcome() {
  return (
    <PageSkeleton label="Loading the welcome form">
      <TitleBlock wide />
      <div className="space-y-4">
        <div className="card space-y-3 p-4" aria-hidden="true">
          <Bar className="h-4 w-40" />
          <Bar className="h-10 w-full rounded-xl" />
        </div>
        <div className="card space-y-3 p-4" aria-hidden="true">
          <Bar className="h-4 w-48" />
          <Bar className="h-24 w-full rounded-xl" />
        </div>
        <div className="card space-y-3 p-4" aria-hidden="true">
          <Bar className="h-4 w-40" />
          <Bar className="h-16 w-full rounded-xl" />
        </div>
        <Bar className="h-10 w-56 rounded-full" />
      </div>
    </PageSkeleton>
  );
}
