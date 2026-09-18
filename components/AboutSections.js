"use client";

import { useState } from "react";
import {
  aboutChipSentence,
  hasAboutChip,
  toggleAboutChip,
} from "@/lib/travelers/aboutChips";
import {
  ABOUT_ME_CHIP_GROUPS,
  ABOUT_ME_MICRO_PROMPTS,
} from "@/lib/travelers/profile";
import {
  buildSportsChipItems,
  sportsChipItemsForPlaceWords,
} from "@/lib/travelers/sports";

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
  // Home as words, for a caller that has the place somebody typed and no
  // coordinate for it -- the rehearsal, where nothing has been geocoded and
  // there is no family row to read. When set it wins over the coordinate,
  // because a caller that has both is telling us the coordinate belongs to
  // somebody else: the real family, not the one being rehearsed.
  homePlace = null,
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

  const [feedback, setFeedback] = useState("");

  function addChip(group, item) {
    const sentence = aboutChipSentence(group, item);
    const removing = hasAboutChip(parts[group.target], sentence);
    setParts((prev) => ({
      ...prev,
      [group.target]: toggleAboutChip(prev[group.target], sentence),
    }));
    setFeedback(`${removing ? "Removed" : "Added"}: ${sentence}`);
  }

  // Fill the sports chip group with local teams first, general sports after.
  // The rest of ABOUT_ME_CHIP_GROUPS is used as-is; only "sports" is dynamic.
  const chipGroups = ABOUT_ME_CHIP_GROUPS.map((g) =>
    g.key === "sports"
      ? {
          ...g,
          items: homePlace
            ? sportsChipItemsForPlaceWords(homePlace)
            : buildSportsChipItems(homeLat, homeLon),
        }
      : g,
  );
  const chipsFor = (targetKey) =>
    chipGroups.filter((g) => g.target === targetKey);

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      <p className="text-xs text-ink-soft">
        Write your own answer or use the suggestions. Select a pill to add or
        remove a sentence, then edit it if needed. Share only what you&apos;re
        comfortable sharing.
      </p>
      <span className="sr-only" role="status">
        {feedback}
      </span>
      {ABOUT_ME_MICRO_PROMPTS.map((p, idx) => {
        const groups = chipsFor(p.key);
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
                  className="text-2xs font-semibold uppercase tracking-[0.09em] text-ink-faint"
                >
                  {idx + 1} of {ABOUT_ME_MICRO_PROMPTS.length}
                </p>
                <label
                  htmlFor={`${idPrefix}-${p.key}`}
                  className="mt-0.5 block font-display text-lg font-semibold leading-snug text-ink"
                >
                  {p.question}
                </label>
              </div>
            </div>
            <textarea
              id={`${idPrefix}-${p.key}`}
              className="field text-base leading-relaxed"
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
                        aria-label={`${isOpen ? "Hide" : "Show"} ${group.label} suggestions`}
                        aria-controls={`${idPrefix}-suggestions-${group.key}`}
                        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-ink"
                      >
                        <span>{group.label}</span>
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
                        <div
                          id={`${idPrefix}-suggestions-${group.key}`}
                          className="border-t border-sand-deep px-3 py-2.5"
                        >
                          <ul className="flex flex-wrap gap-1.5">
                            {group.items.map((item) => {
                              const added = hasAboutChip(
                                parts[group.target],
                                aboutChipSentence(group, item),
                              );
                              return (
                                <li key={item}>
                                  <button
                                    type="button"
                                    onClick={() => addChip(group, item)}
                                    aria-pressed={added}
                                    aria-label={
                                      added
                                        ? `Remove: ${aboutChipSentence(group, item)}`
                                        : `Add: ${aboutChipSentence(group, item)}`
                                    }
                                    className={`min-h-11 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                                      added
                                        ? "border-teal bg-teal text-on-accent"
                                        : "border-teal/40 bg-white text-ink hover:border-teal hover:bg-teal-soft/40"
                                    }`}
                                  >
                                    {added ? `✓ ${item}` : `+ ${item}`}
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
