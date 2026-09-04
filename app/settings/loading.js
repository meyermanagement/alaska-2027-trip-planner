import PageSkeleton, {
  Bar,
  CardBlock,
  TitleBlock,
} from "@/components/PageSkeleton";

// Settings had no skeleton at all, so going there from the menu closed the sheet
// and then left the previous screen on the glass until the database answered --
// which on a slow answer is indistinguishable from a press that missed.
//
// Three sections in the order the real screen has them: the paragraph and its
// button, the five looks on the same grid the picker uses, then the account.
export default function LoadingSettings() {
  return (
    <PageSkeleton label="Loading your settings">
      <TitleBlock />
      <div className="space-y-10" aria-hidden="true">
        <div className="space-y-3">
          <Bar className="h-6 w-32" />
          <Bar className="h-4 w-full max-w-md" />
          <Bar className="h-9 w-36" />
        </div>
        <div className="space-y-4">
          <Bar className="h-6 w-28" />
          <Bar className="h-4 w-full max-w-sm" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <CardBlock key={i} lines={2} />
            ))}
          </div>
        </div>
        <div className="space-y-3 border-t border-[var(--line)] pt-8">
          <Bar className="h-6 w-28" />
          <Bar className="h-4 w-56" />
          <Bar className="h-4 w-44" />
        </div>
      </div>
    </PageSkeleton>
  );
}
