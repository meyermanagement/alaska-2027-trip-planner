import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// Same shape as the real About you screen -- a heading, a big textarea
// and a button -- so the practice paragraph fills in the same way.
export default function LoadingPracticeAboutYou() {
  return (
    <PageSkeleton label="Loading the practice About you">
      <TitleBlock />
      <div className="card space-y-3 p-5" aria-hidden="true">
        <Bar className="h-4 w-40" />
        <Bar className="h-40 w-full rounded-2xl" />
        <Bar className="h-9 w-40 rounded-full" />
      </div>
    </PageSkeleton>
  );
}
