import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// The box is the whole screen, so the placeholder is a box.
export default function LoadingAboutYou() {
  return (
    <PageSkeleton label="Loading what you wrote">
      <TitleBlock />
      <div className="card space-y-3 p-5" aria-hidden="true">
        <Bar className="h-4 w-40" />
        <Bar className="h-40 w-full rounded-2xl" />
        <Bar className="h-9 w-32" />
      </div>
    </PageSkeleton>
  );
}
