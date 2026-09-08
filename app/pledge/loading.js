import PageSkeleton, {
  Bar,
  CardBlock,
  TitleBlock,
} from "@/components/PageSkeleton";

// Pledge is a plain content page: a section label, a title, an intro
// paragraph, then three promise cards on the same rounded card the real page
// uses. Three cards, not four -- No bias, No selling your information, No ads.
export default function LoadingPledge() {
  return (
    <PageSkeleton label="Loading our pledge">
      <TitleBlock />
      <div className="mt-6 space-y-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <CardBlock key={i} lines={3} />
        ))}
      </div>
      <div className="mt-8 space-y-2" aria-hidden="true">
        <Bar className="h-3 w-full max-w-md" />
        <Bar className="h-3 w-3/4 max-w-sm" />
      </div>
    </PageSkeleton>
  );
}
