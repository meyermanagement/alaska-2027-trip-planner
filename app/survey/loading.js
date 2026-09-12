import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// Six panels of questions, each a heading and a run of prompts with something to
// press or type underneath. Two are drawn here: enough that the frame does not
// blink out on the way from the menu, and not so much that the skeleton has to be
// kept in step with the question list.
export default function LoadingSurvey() {
  return (
    <PageSkeleton label="Loading the beta survey">
      <TitleBlock />
      <div className="mt-6 space-y-6" aria-hidden="true">
        {[0, 1].map((panel) => (
          <div key={panel} className="card space-y-5 p-5">
            <div className="space-y-2">
              <Bar className="h-5 w-40" />
              <Bar className="h-3 w-full max-w-md" />
            </div>
            {[0, 1, 2].map((question) => (
              <div key={question} className="space-y-2">
                <Bar className="h-4 w-3/4 max-w-sm" />
                <Bar className="h-11 w-56 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
