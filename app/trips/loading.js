import PageSkeleton, { TitleBlock } from "@/components/PageSkeleton";
import BoardSkeleton from "./BoardSkeleton";

export default function LoadingTrips() {
  return (
    <PageSkeleton label="Loading your trips">
      <TitleBlock />
      <BoardSkeleton />
    </PageSkeleton>
  );
}
