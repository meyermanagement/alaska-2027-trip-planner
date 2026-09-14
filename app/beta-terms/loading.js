import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// All prose, no cards: the terms are a run of headed paragraphs, so the skeleton
// is a title and four blocks of lines rather than anything framed.
export default function LoadingBetaTerms() {
  return (
    <PageSkeleton label="Loading the beta terms">
      <TitleBlock />
      <div className="mt-6 space-y-6" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Bar className="h-4 w-40" />
            <Bar className="h-3 w-full max-w-md" />
            <Bar className="h-3 w-3/4 max-w-sm" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
