"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ABOUT_ME_CHIP_GROUPS,
  ABOUT_ME_MICRO_PROMPTS,
} from "@/lib/travelers/profile";
import { buildSportsChipItems } from "@/lib/travelers/sports";

/**
 * The five About-you questions, as cards, wherever somebody edits them.
 *
 * This used to live inside the About-you page, which meant the good version of
 * the question -- five labelled boxes, a counter on each, chip drawers that
 * write a sentence into the box above them -- existed only on the screen a
 * person sees once, on their first sign-in. The Family tab and the Preferences
 * screen, which are where the paragraph actually gets edited afterwards, each
 * had a single unlabelled textarea and a paragraph of prose explaining what to
 * type into it. Same column, three different experiences, and the two that
 * people come back to were the weak ones.
 *
 * So the questions are a component and the surfaces are containers. The
 * About-you page wraps these cards in a heading, an intro and Save/Skip. The
 * Family person form and the Preferences drawer render them in place, in a
 * container that already exists on the screen, so nobody is sent somewhere else
 * and brought back to change a sentence.
 *
 * Controlled: the caller owns the five values and hands us a setter, because
 * every caller needs the values for something we do not do here -- the page
 * turns them into a paragraph on Save, the Family form folds them into a wider
 * save of the whole person.
 */
export default function AboutSections({
  parts,
  setParts,
  // The family's home coordinates, which fill the "Sports and teams" drawer
  // with local teams so somebody in St. Louis is offered the Cardinals rather
  // than a generic "the NFL". Null falls back to the general sports list.
  homeLat = null,
  homeLon = null,
  // Spacing above the first card, which belongs to the container rather than
  // to the questions: a page has a dictation hint above them, a drawer has a
  // heading, a person form has a divider.
  className = "",
  // Prefixes the textarea ids that the labels point at. The Preferences screen
  // can have two people's drawers open at once, and two boxes cannot share an
  // id or a label points at the wrong person's box.
  idPrefix = "about",
}) {
  const [openGroup, setOpenGroup] = useState(null);

  // Chip feedback -- when a chip is tapped, its key goes into justAdded so the
  // chip renders as "added" for a moment, and the target prompt key goes into
  // flashedPrompt so the box the sentence landed in gets a teal ring and the
  // "Just added" strapline for the same window. Both clear on a timer, and
  // re-tapping a chip resets the timer so somebody tapping fast still sees the
  // confirmation.
  const [justAdded, setJustAdded] = useState({});
  const [flashedPrompt, setFlashedPrompt] = useState(null);
  const chipTimersRef = useRef(new Map());
  const flashTimerRef = useRef(null);
  const promptRefs = useRef({});

  // Clean up any pending timers on unmount so closing the drawer mid-flash does
  // not leave setState calls firing against an unmounted component.
  useEffect(() => {
    const chipTimers = chipTimersRef.current;
    const flashTimer = flashTimerRef;
    return () => {
      chipTimers.forEach((id) => clearTimeout(id));
      chipTimers.clear();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  // Append a sentence to the target prompt box, scroll it into view, flash the
  // box, and mark the chip as added. Everything the user needs to notice
  // happens on this one call.
  const appendToPrompt = useCallback(
    (targetKey, sentence, chipId) => {
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
        // Move the caret to the end without stealing focus from the chip
        // button -- taking focus on mobile pops the keyboard, which hides the
        // very box we are trying to point at.
        const end = el.value.length;
        try {
          el.setSelectionRange(end, end);
        } catch {
          // Some browsers throw on setSelectionRange for a textarea that has
          // not been focused yet. Not a real error, ignore.
        }
      }, 0);

      setFlashedPrompt(targetKey);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        setFlashedPrompt((current) => (current === targetKey ? null : current));
        flashTimerRef.current = null;
      }, 1600);

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
    },
    [setParts],
  );

  function addChip(group, item) {
    const chipId = `${group.key}:${item}`;
    appendToPrompt(group.target, `${group.prefix} ${item}.`, chipId);
  }

  // Fill the sports chip group with local teams first, general sports after.
  // The rest of ABOUT_ME_CHIP_GROUPS is used as-is; only "sports" is dynamic.
  const chipGroups = ABOUT_ME_CHIP_GROUPS.map((g) =>
    g.key === "sports"
      ? { ...g, items: buildSportsChipItems(homeLat, homeLon) }
      : g,
  );
  const chipsFor = (targetKey) =>
    chipGroups.filter((g) => g.target === targetKey);

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      {ABOUT_ME_MICRO_PROMPTS.map((p, idx) => {
        const groups = chipsFor(p.key);
        const isFlashed = flashedPrompt === p.key;
        return (
          <section
            key={p.key}
            className="space-y-2 rounded-2xl border border-sand-deep bg-white p-4 shadow-sm sm:p-5"
          >
            {/*
              The label is the heading of the card, so it is sized like one.
              It used to be text-sm semibold sharing a baseline with the "1 of
              4" counter, which made it weigh the same as the sentence in the
              box underneath and left the counter reading first. Now the
              counter is a small line above it and the question is the largest
              thing in the card, so what you are being asked for is legible
              before you read anything else.
            */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  aria-hidden="true"
                  className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-ink-faint"
                >
                  {idx + 1} of {ABOUT_ME_MICRO_PROMPTS.length}
                </p>
                <label
                  htmlFor={`${idPrefix}-${p.key}`}
                  className="mt-0.5 block font-display text-lg font-semibold leading-snug text-ink"
                >
                  {p.label}
                </label>
              </div>
              {isFlashed && (
                <span
                  aria-live="polite"
                  className="shrink-0 pt-1 text-xs font-semibold text-teal"
                >
                  Just added
                </span>
              )}
            </div>
            <textarea
              id={`${idPrefix}-${p.key}`}
              ref={(el) => {
                promptRefs.current[p.key] = el;
              }}
              className={`field text-sm leading-relaxed transition-colors ${
                isFlashed
                  ? "border-teal ring-2 ring-teal/30 bg-teal-soft/25"
                  : ""
              }`}
              rows={4}
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
                        onClick={() => setOpenGroup(isOpen ? null : group.key)}
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
  );
}
