import PageSkeleton, { RowsBlock, TitleBlock } from "@/components/PageSkeleton";

export default function LoadingRewards() {
  return (
    <PageSkeleton label="Loading your wallet">
      <TitleBlock />
      <RowsBlock rows={4} />
    </PageSkeleton>
  );
}
