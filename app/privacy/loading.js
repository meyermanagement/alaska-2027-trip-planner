import PageSkeleton, {
  Bar,
  CardBlock,
  TitleBlock,
} from "@/components/PageSkeleton";

// A long document: title, a run of prose, then the cards that carry the seven
// data categories. Three cards rather than seven, because the skeleton is a
// promise that something is coming, not a count of it.
export default function LoadingPrivacy() {
  return (
    <PageSkeleton label="Loading the privacy policy">
      <TitleBlock />
      <div className="mt-6 space-y-2" aria-hidden="true">
        <Bar className="h-3 w-full max-w-md" />
        <Bar className="h-3 w-full max-w-md" />
        <Bar className="h-3 w-2/3 max-w-sm" />
      </div>
      <div className="mt-8 space-y-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <CardBlock key={i} lines={3} />
        ))}
      </div>
    </PageSkeleton>
  );
}
