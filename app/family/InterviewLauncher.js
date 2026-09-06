import Link from "next/link";

// The one door into the interview. Sits above the People list on the Family
// screen -- if there is anything left to do, it says so and opens the interview
// with one tap; if every question has been answered or skipped, the whole panel
// is gone.
//
// Three states, and one of them is nothing:
//
//   nothing started   "Get to know the family" -- the promise, plain
//   part done          "Finish getting to know the family" and how much is left
//   done              (returns null; the launcher is not drawn at all)
//
// Only shown to the primary. The Family page already redirects secondaries
// somewhere they can act, so no gating here.
export default function InterviewLauncher({ progress }) {
  if (!progress || progress.complete) return null;

  const started = progress.started;
  const remaining = progress.total - progress.answered;

  return (
    <div className="mb-6 rounded-2xl border border-teal/40 bg-teal-soft/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="section-label text-teal">What Aly still asks</p>
          <p className="mt-1 font-display text-lg text-ink">
            {started
              ? `${remaining} more question${remaining === 1 ? "" : "s"} to answer.`
              : "She has not asked yet."}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {started
              ? "Pick up where you left off. Nothing is lost between visits."
              : "Nine short questions, on behalf of the household. Two options each, or say what fits better. Skip any of them."}
          </p>
        </div>
        <Link href="/interview" className="btn btn-primary shrink-0">
          {started
            ? "Finish getting to know the family"
            : "Get to know the family"}
        </Link>
      </div>
    </div>
  );
}
