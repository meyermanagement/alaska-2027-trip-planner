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
// Aly speaks here, as she does on the questions themselves: this is the door
// into her interview, and a panel that narrated her in the third person
// ("what Aly still asks") handed the reader to a screen where she was
// suddenly saying "I". The count comes from progress.total rather than a
// number written into the copy, which had drifted a question behind.
//
// The eyebrow spells its own type out instead of using .section-label,
// because that class is unlayered and its color declaration beats a Tailwind
// text- utility, so the teal never landed.
//
// Only shown to the primary. The Family page already redirects secondaries
// somewhere they can act, so no gating here.
export default function InterviewLauncher({ progress }) {
  if (!progress || progress.complete) return null;

  const started = progress.started;
  const remaining = progress.total - progress.answered;

  return (
    <div className="mb-6 rounded-2xl border border-teal/40 bg-teal-soft/40 p-4 sm:p-5">
      {/* Stacked below sm and side by side above it. The row used to be one
        flex-wrap line at every width, and because the text column carries
        min-w-0 it shrank instead of wrapping: on a 320-wide phone the lead
        collapsed to one word per line beside a button that would not give up
        any of its own width. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-teal">
            What I still want to ask
          </p>
          <p className="mt-1 font-display text-lg text-ink">
            {started
              ? `${remaining} more question${remaining === 1 ? "" : "s"} to answer.`
              : "I have not asked yet."}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {started
              ? "Pick up where you left off. I keep every answer between visits."
              : `${progress.total} short questions about the household. Pick an option, or say what fits better. Skip any of them.`}
          </p>
        </div>
        <Link
          href="/interview"
          className="btn btn-primary w-full text-center sm:w-auto sm:shrink-0"
        >
          {started
            ? "Finish getting to know the family"
            : "Get to know the family"}
        </Link>
      </div>
    </div>
  );
}
