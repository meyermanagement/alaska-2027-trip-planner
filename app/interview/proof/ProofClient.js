"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CompassLoader from "@/components/CompassLoader";

/**
 * The client shell for the interview proof step.
 *
 * On mount, kicks off two model calls in parallel via the /api/interview
 * /proof endpoint and paints them into a side-by-side card. The primary
 * can re-roll on a different category (food or day) to see the same
 * proof against another question. The button at the bottom carries them
 * onward to the after-interview screen (what Aly already put on your
 * trips + ask a real question).
 */
export default function ProofClient({ demo = false, backHref = null } = {}) {
  const router = useRouter();
  const [category, setCategory] = useState("food");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    fetch("/api/interview/proof", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, demo }),
    })
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.ok) {
          setError(json?.error || "That didn't come through.");
          setLoading(false);
          return;
        }
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("That didn't come through. Try again in a moment.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, demo]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="section-label text-ink-soft">Proof</p>
        <h1 className="font-display text-3xl font-semibold leading-tight">
          Watch the same question, answered two ways.
        </h1>
        <p className="text-base leading-relaxed text-ink-soft">
          Aly is answering one real question about your next trip. On the
          left is what she would say if she knew nothing about you. On the
          right is what she says with everything you just told her folded
          in. Same question, same model. The difference is the interview.
        </p>
      </header>

      <nav
        className="flex flex-wrap items-center gap-2"
        aria-label="Question category"
      >
        <span className="section-label text-ink-soft">Ask about:</span>
        <button
          type="button"
          onClick={() => setCategory("food")}
          className={`rounded-full border px-3 py-1.5 text-sm ${
            category === "food"
              ? "border-teal bg-teal text-white"
              : "border-sand-deep bg-white text-ink-soft"
          }`}
        >
          Where to eat
        </button>
        <button
          type="button"
          onClick={() => setCategory("day")}
          className={`rounded-full border px-3 py-1.5 text-sm ${
            category === "day"
              ? "border-teal bg-teal text-white"
              : "border-sand-deep bg-white text-ink-soft"
          }`}
        >
          What to do
        </button>
      </nav>

      {loading && (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-teal">
          <CompassLoader size={64} label="Aly is answering the same question twice." />
          <p className="text-sm text-ink-soft">
            Two answers, side by side. This takes a moment.
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-terra-deep/50 bg-terra-soft/40 p-4 text-sm text-ink">
          {error}{" "}
          <button
            type="button"
            className="ml-2 underline underline-offset-4"
            onClick={() => setCategory(category)}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <section
            aria-labelledby="proof-question-heading"
            className="rounded-2xl border border-sand-deep bg-sand-soft/60 p-4"
          >
            <p className="section-label text-ink-soft">
              The question Aly is answering
            </p>
            <p
              id="proof-question-heading"
              className="mt-1 font-display text-lg text-ink"
            >
              &ldquo;{data.question}&rdquo;
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="flex flex-col gap-2 rounded-2xl border border-sand-deep bg-white p-4">
              <header>
                <p className="section-label text-ink-soft">
                  Aly, knowing nothing about you
                </p>
                <p className="mt-1 text-xs italic text-ink-soft">
                  What a general travel article would say.
                </p>
              </header>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {data.without || "(no answer)"}
              </p>
            </article>

            <article className="flex flex-col gap-2 rounded-2xl border-2 border-teal bg-teal-soft/30 p-4">
              <header>
                <p className="section-label text-teal">
                  Aly, with your interview
                </p>
                <p className="mt-1 text-xs italic text-ink-soft">
                  Based on the {data.preferenceCount || "several"} things you
                  just told her.
                </p>
              </header>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {data.withPrefs || "(no answer)"}
              </p>
            </article>
          </div>

          <p className="text-xs italic text-ink-soft">
            Aly is a model. Both answers are her best guess in the moment;
            she'll say different things on different runs. What's stable is
            that the right-hand answer will keep fitting your family and the
            left-hand answer will keep fitting nobody in particular.
          </p>
        </>
      )}

      <div className="flex flex-wrap gap-2 border-t border-sand-deep pt-5">
        <button
          type="button"
          onClick={() =>
            router.push(demo ? backHref || "/interview-check" : "/welcome/after-interview")
          }
          className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          Show me what Aly did with all this
        </button>
      </div>
    </div>
  );
}
