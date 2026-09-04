import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

export default function LoadingNewTrip() {
  return (
    <PageSkeleton label="Loading the trip builder">
      <TitleBlock />
      <div className="card space-y-3 p-5" aria-hidden="true">
        <Bar className="h-4 w-44" />
        <Bar className="h-28 w-full rounded-2xl" />
        <Bar className="h-9 w-40" />
      </div>
    </PageSkeleton>
  );
}
