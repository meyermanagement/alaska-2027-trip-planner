import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// Three tiles under a heading. The placeholder is three cards the same
// height as the real tiles so the page fills in rather than jumping.
export default function LoadingPracticeHub() {
  return (
    <PageSkeleton label="Loading practice">
      <TitleBlock />
      <div className="space-y-3" aria-hidden="true">
        <Bar className="h-20 w-full rounded-2xl" />
        <Bar className="h-20 w-full rounded-2xl" />
        <Bar className="h-20 w-full rounded-2xl" />
      </div>
    </PageSkeleton>
  );
}
