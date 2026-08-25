import PageSkeleton, { CardBlock, TitleBlock } from "@/components/PageSkeleton";

export default function LoadingReviews() {
  return (
    <PageSkeleton label="Loading preferences and reviews">
      <TitleBlock wide />
      <div className="space-y-4">
        <CardBlock lines={4} />
        <CardBlock lines={3} />
        <CardBlock lines={3} />
      </div>
    </PageSkeleton>
  );
}
