import PageSkeleton, { CardBlock, TitleBlock } from "@/components/PageSkeleton";

export default function LoadingTrips() {
  return (
    <PageSkeleton label="Loading your trips">
      <TitleBlock />
      <div className="grid gap-4 sm:grid-cols-2">
        <CardBlock lines={4} />
        <CardBlock lines={4} />
        <CardBlock lines={3} />
        <CardBlock lines={3} />
      </div>
    </PageSkeleton>
  );
}
