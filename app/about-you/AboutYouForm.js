"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ABOUT_ME_CHIP_GROUPS,
  ABOUT_ME_EXAMPLES,
  ABOUT_ME_MICRO_PROMPTS,
  aboutMeFromParts,
} from "@/lib/travelers/profile";
import { buildSportsChipItems } from "@/lib/travelers/sports";
import DictationHint from "@/components/DictationHint";

/**
 * The About You page, which is a whole screen rather than a card.
 *
 * Four short prompts, one chip drawer that appends into the matching prompt,
 * five examples underneath. The free-text paragraph is gone -- the nine-row
 * textarea was honest but hard, and every A/B of it ended in two sentences.
 * Now every input on the screen writes into a labelled box, and on save the
 * four boxes concatenate into the same about_me column so nothing downstream
 * changes. Aly still reads one block of text before every answer; the block is
 * just written in four bites with headings.
 *
 * Existing paragraphs are not migrated. The screen starts empty on purpose --
 * the four prompts are the answer to why the old paragraphs were thin, and
 * pre-filling the first box with a dropped paragraph would carry the old shape
 * forward. What the person types here overwrites whatever was there.
 *
 * For a secondary traveler this screen is the whole of their record. Every
 * other column on their row is refused by the database, so the screen says so
 * rather than leaving them to find out by pressing something that will not
 * move.
 *
 * Shown on the first sign-in and then not again once it has been saved.
 * Skipping sets a cookie that lasts as long as the browser session, so
 * somebody who is not in the mood is not trapped and is not nagged twice in
 * one sitting -- but the question comes back next time they sign in, because
 * until it is answered every recommendation the app makes is generic.
 */
export default function AboutYouForm({
  travelerId,
  name,
  first,
  secondary = false,
  // When true, Save does not touch the database. Instead the paragraph the
  // primary would have written is shown back to them with a note that it
  // would have been written to their own page. Used from the practice hub so
  // somebody can rehearse the question without spending their real paragraph.
  practice = false,
  // The family's home coordinates from families.home_lat/home_lon. Used to
  // fill the "Sports and teams" chip drawer with local pro teams so somebody
  // in St. Louis sees the Cardinals and the Blues as the first two chips
  // instead of a generic "the NFL" that could belong to anyone. Null when
  // the family has no geocoded home (rare -- the welcome screen geocodes it)
  // in which case the drawer falls back to the general sports list.
  homeLat = null,
  homeLon = null,
  // Where a first-run user lands after Save or Skip. Defaults to /trips --
  // the original behaviour -- but the first-login chain hands us /interview
  // so the paragraph flows straight into the interview instead of a Trips
  // page with nothing on it. Ignored on the ordinary Settings-driven visit.
  nextHref = "/trips",
}) {
  const [parts, setParts] = useState(() =>
    Object.fromEntries(ABOUT_ME_MICRO_PROMPTS.map((p) => [p.key, ""])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);

  // Chip feedback -- when a chip is tapped, its key goes into justAdded so the
  // chip renders as "✓ added" for a moment. And the target prompt key goes
  // into flashedPrompt so the box the sentence landed in gets a teal ring and
  // the "Just added" strapline for the same window. Both clear on a timer,
  // and re-tapping a chip resets the timer so somebody tapping fast still
  // sees the confirmation.
  const [justAdded, setJustAdded] = useState({}); // { "live:Broadway": timerId }
  const [flashedPrompt, setFlashedPrompt] = useState(null); // "love" | "into" | ...
  const chipTimersRef = useRef(new Map());
  const flashTimerRef = useRef(null);
  const promptRefs = useRef({});

  // Clean up any pending timers on unmount so a fast navigation does not leave
  // setState calls firing against an unmounted component.
  useEffect(() => {
    const chipTimers = chipTimersRef.current;
    const flashTimer = flashTimerRef;
    return () => {
      chipTimers.forEach((id) => clearTimeout(id));
      chipTimers.clear();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  // Append a sentence to the target prompt box, focus and scroll it into view,
  // flash the box, and mark the chip as added. Everything the user needs to
  // notice happens on this one call.
  const appendToPrompt = useCallback((targetKey, sentence, chipId) => {
    const clean = String(sentence || "").trim();
    if (!clean) return;

    setParts((prev) => {
      const existing = String(prev[targetKey] || "").replace(/\s+$/, "");
      const next = existing ? `${existing} ${clean}` : clean;
      return { ...prev, [targetKey]: next };
    });

    // On the next tick, after React writes the new value: bring the box into
    // view and put the caret at the end so somebody who is skimming can see
    // exactly what landed.
    setTimeout(() => {
      const el = promptRefs.current[targetKey];
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Move the caret to the end without stealing focus from the chip button
      // -- taking focus on mobile pops the keyboard, which hides the very box
      // we are trying to point at. The caret still moves, so a subsequent tap
      // on the box lands at the end.
      const end = el.value.length;
      try {
        el.setSelectionRange(end, end);
      } catch {
        // Some browsers throw on setSelectionRange for a textarea that has
        // not been focused yet. Not a real error, ignore.
      }
    }, 0);

    // Flash the prompt for 1600ms; latest tap wins.
    setFlashedPrompt(targetKey);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setFlashedPrompt((current) => (current === targetKey ? null : current));
      flashTimerRef.current = null;
    }, 1600);

    // Mark the specific chip as added for 1600ms. Keyed by group+item so
    // repeated taps of the same chip re-arm cleanly.
    if (chipId) {
      const existing = chipTimersRef.current.get(chipId);
      if (existing) clearTimeout(existing);
      const id = setTimeout(() => {
        setJustAdded((prev) => {
          if (!(chipId in prev)) return prev;
          const next = { ...prev };
          delete next[chipId];
          return next;
        });
        chipTimersRef.current.delete(chipId);
      }, 1600);
      chipTimersRef.current.set(chipId, id);
      setJustAdded((prev) => ({ ...prev, [chipId]: true }));
    }
  }, []);

  function addChip(group, item) {
    const chipId = `${group.key}:${item}`;
    const sentence = `${group.prefix} ${item}.`;
    appendToPrompt(group.target, sentence, chipId);
  }

  const hasAnyText = Object.values(parts).some((v) => String(v).trim());

  async function save() {
    setBusy(true);
    setError("");

    const paragraph = aboutMeFromParts(parts);

    if (practice) {
      setBusy(false);
      setDone(true);
      return;
    }

    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("travelers")
      .update({ about_me: paragraph || null })
      .eq("id", travelerId)
      .select("id");
    setBusy(false);

    if (dbError) {
      setError(dbError.message || "That did not save. Try again in a moment.");
      return;
    }
    // A write the rules refuse does not raise -- row-level security filters the
    // row away and the update reports success having changed nothing. Counting
    // what came back is the only way to tell "saved" from "silently dropped".
    if (!data || data.length === 0) {
      setError(
        secondary
          ? "That did not save. This paragraph is yours to change, so if it keeps refusing, tell a primary traveler in the family — something is wrong at our end, not yours."
          : "That did not save. Ask a primary traveler in the family to write this one for you.",
      );
      return;
    }
    setDone(true);
    if (first) router.replace(nextHref);
    else router.refresh();
  }

  const router = useRouter();

  // Fill the sports chip group with local teams first, general sports after.
  // The rest of ABOUT_ME_CHIP_GROUPS is used as-is; only "sports" is dynamic.
  // Done once per render (cheap: it's a haversine over ~50 metros) so a
  // family that later edits their home address on Settings sees the drawer
  // update the next time they open this page.
  const chipGroups = ABOUT_ME_CHIP_GROUPS.map((g) =>
    g.key === "sports"
      ? { ...g, items: buildSportsChipItems(homeLat, homeLon) }
      : g,
  );
  const chipsFor = (targetKey) =>
    chipGroups.filter((g) => g.target === targetKey);

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">
        {first
          ? name
            ? `Before you start, ${name} — what are you like on a trip?`
            : "Before you start — what are you like on a trip?"
          : "About you"}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Four short questions. Answer any that come easily and skip the rest —
        Aly reads all of them together before she suggests anything. How you
        travel — pace, food, early or late, where to spend the money — is asked
        separately in the interview, so you don&rsquo;t have to say that here.
      </p>

      {secondary && (
        <p className="mt-3 max-w-2xl rounded-xl border border-[var(--line)] bg-sand/40 p-3 text-sm leading-relaxed text-ink-soft">
          These four questions are the one thing about yourself you can change
          here. Your name, your email and your travel documents are looked after
          by a primary traveler in the family — ask them if any of those need
          fixing. What you write below is yours.
        </p>
      )}

      <DictationHint className="mt-5" />

      {/*
        Each of the four prompts is its own card -- a sand-tinted panel with a
        border, generous inside padding, and a clear gap between cards. Before
        this the sections were separated only by vertical rhythm, and with a
        chip drawer expanded under a prompt box the next prompt's label read
        as another line of the same section. Cards give each question its own
        stage.
      */}
      <div className="mt-4 space-y-4">
        {ABOUT_ME_MICRO_PROMPTS.map((p, idx) => {
          const groups = chipsFor(p.key);
          const isFlashed = flashedPrompt === p.key;
          return (
            <section
              key={p.key}
              className="space-y-2 rounded-2xl border border-sand-deep bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span
                    aria-hidden="true"
                    className="text-xs font-semibold uppercase tracking-wide text-ink-faint"
                  >
                    {idx + 1} of {ABOUT_ME_MICRO_PROMPTS.length}
                  </span>
                  <label
                    htmlFor={`about-${p.key}`}
                    className="text-sm font-semibold text-ink"
                  >
                    {p.label}
                  </label>
                </div>
                {isFlashed && (
                  <span
                    aria-live="polite"
                    className="text-xs font-semibold text-teal"
                  >
                    Just added
                  </span>
                )}
              </div>
              <textarea
                id={`about-${p.key}`}
                ref={(el) => {
                  promptRefs.current[p.key] = el;
                }}
                className={`field text-sm leading-relaxed transition-colors ${
                  isFlashed
                    ? "border-teal ring-2 ring-teal/30 bg-teal-soft/25"
                    : ""
                }`}
                rows={3}
                placeholder={p.placeholder}
                value={parts[p.key]}
                onChange={(e) =>
                  setParts((prev) => ({ ...prev, [p.key]: e.target.value }))
                }
              />

              {groups.length > 0 && (
                <div className="space-y-1.5">
                  {groups.map((group) => {
                    const isOpen = openGroup === group.key;
                    return (
                      <div
                        key={group.key}
                        className="rounded-xl border border-sand-deep bg-sand/30"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenGroup(isOpen ? null : group.key)
                          }
                          aria-expanded={isOpen}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-semibold text-ink"
                        >
                          <span>
                            {group.label}{" "}
                            <span className="font-normal text-ink-soft">
                              — tap to add
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className="text-ink-soft transition-transform"
                            style={{
                              transform: isOpen
                                ? "rotate(90deg)"
                                : "rotate(0deg)",
                            }}
                          >
                            ›
                          </span>
                        </button>
                        {isOpen && (
                          <div className="border-t border-sand-deep px-3 py-2.5">
                            <ul className="flex flex-wrap gap-1.5">
                              {group.items.map((item) => {
                                const chipId = `${group.key}:${item}`;
                                const added = !!justAdded[chipId];
                                return (
                                  <li key={item}>
                                    <button
                                      type="button"
                                      onClick={() => addChip(group, item)}
                                      aria-label={
                                        added
                                          ? `${item} added to ${p.label}`
                                          : `Add ${item} to ${p.label}`
                                      }
                                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                                        added
                                          ? "border-teal bg-teal text-on-accent"
                                          : "border-teal/40 bg-white text-ink hover:border-teal hover:bg-teal-soft/40"
                                      }`}
                                    >
                                      {added ? `✓ ${item} added` : `+ ${item}`}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {error && <p className="mt-4 text-sm font-semibold text-rose">{error}</p>}
      {done && !first && !practice && (
        <p className="mt-4 text-sm font-semibold text-teal">
          Saved. Aly will use this from her next answer on.
        </p>
      )}
      {done && practice && (
        <div className="mt-4 rounded-2xl border border-teal/40 bg-teal-soft/40 p-4">
          <p className="section-label text-teal">What would have been saved</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
            {aboutMeFromParts(parts) ||
              "(A blank paragraph, which stays blank.)"}
          </p>
          <p className="mt-3 text-xs text-ink-soft">
            Nothing was written to your own page. Your real About you is
            unchanged.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={busy || !hasAnyText}
        >
          {busy
            ? "Saving…"
            : practice
              ? "Show what would save"
              : first
                ? "Save and get started"
                : "Save"}
        </button>
        {first && !practice && (
          // A plain link rather than a button, and a form post rather than a
          // fetch: the cookie has to be set by the server, and the only thing
          // this does is get out of the way. The hidden next field tells the
          // server-side skip handler where to send them after the cookie is
          // set -- so a first-login skip still lands on the interview.
          <form action="/api/about-you/skip" method="post">
            <input type="hidden" name="next" value={nextHref} />
            <button className="btn btn-ghost" type="submit">
              Skip for now
            </button>
          </form>
        )}
        {practice && (
          <a href="/interview-check" className="btn btn-ghost">
            Back to practice
          </a>
        )}
      </div>

      <div className="mt-9 border-t border-[var(--line)] pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Some examples
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          There is no right answer here. These five are meant to show a range of
          what people put in — who they are, what they care about, what shapes
          what a good trip looks like to them.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ABOUT_ME_EXAMPLES.map((example) => (
            <blockquote
              key={example}
              className="rounded-xl border border-sand-deep bg-sand/50 p-3 text-xs leading-relaxed text-ink-soft"
            >
              &ldquo;{example}&rdquo;
            </blockquote>
          ))}
        </div>
      </div>
    </>
  );
}
