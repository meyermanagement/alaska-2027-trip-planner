import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// Same shape as the real welcome form -- three cards for home, people and
// animals -- so the practice run does not blink empty on its way in.
export default function LoadingPracticeWelcome() {
  return (
    <PageSkeleton label="Loading the practice welcome form">
      <TitleBlock wide />
      <div className="space-y-4">
        <div className="card space-y-3 p-4" aria-hidden="true">
          <Bar className="h-4 w-40" />
          <Bar className="h-10 w-full rounded-xl" />
        </div>
        <div className="card space-y-3 p-4" aria-hidden="true">
          <Bar className="h-4 w-48" />
          <Bar className="h-24 w-full rounded-xl" />
        </div>
        <div className="card space-y-3 p-4" aria-hidden="true">
          <Bar className="h-4 w-40" />
          <Bar className="h-16 w-full rounded-xl" />
        </div>
        <Bar className="h-10 w-56 rounded-full" />
      </div>
    </PageSkeleton>
  );
}
