import PageSkeleton, { RowsBlock, TitleBlock } from "@/components/PageSkeleton";

export default function LoadingPeople() {
  return (
    <PageSkeleton label="Loading the family">
      <TitleBlock />
      <RowsBlock rows={4} />
    </PageSkeleton>
  );
}
