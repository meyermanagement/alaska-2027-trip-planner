import PageSkeleton, {
  Bar,
  CardBlock,
  PillRow,
} from "@/components/PageSkeleton";

export default function LoadingTrip() {
  return (
    <PageSkeleton label="Loading this trip">
      <div className="mb-6 space-y-3">
        <Bar className="h-9 w-64 max-w-full" />
        <Bar className="h-4 w-52 max-w-full" />
        <div className="flex gap-2 pt-1" aria-hidden="true">
          <Bar className="h-6 w-20" />
          <Bar className="h-6 w-16" />
          <Bar className="h-6 w-20" />
        </div>
      </div>
      <PillRow widths={["w-24", "w-20", "w-24", "w-16", "w-20"]} />
      <div className="space-y-4">
        <CardBlock lines={2} />
        <CardBlock lines={5} />
      </div>
    </PageSkeleton>
  );
}
