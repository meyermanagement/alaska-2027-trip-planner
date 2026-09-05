"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ASK_ALY_EVENT } from "./AskAlyTrigger";
import { coverQueuePatch } from "@/lib/covers/queue";
import { TEMPLATES_FOCUS } from "@/lib/agent/context";
import { FIRST_NAME, templateRequest } from "@/lib/packing/newTemplate";
import { houseListOnto } from "@/lib/tasks/onto";

/**
 * Moves a finished draft into Upcoming trips, and builds its packing list on the
 * way through.
 *
 * Two things have to be true before it can move, and both are worth saying out
 * loud rather than silently refusing: a trip in Upcoming is sorted and counted
 * down by its dates, so it needs them; and dates that have already gone by would
 * send it straight past Upcoming into Past trips, which is never what someone
 * means when they finalise a plan.
 *
 * The list used to be offered afterwards, and the offer was unreachable. All
 * three screens that show this button stop showing it the instant the trip is no
 * longer a draft: the trips board moves the card into Upcoming, the draft page
 * becomes the trip page, and the draft banner on the trip page is drawn only for
 * drafts. So a button reading "start its packing list?" was appearing into a
 * component already being unmounted, and a family who moved a draft across
 * simply arrived at an empty list with nothing having asked them.
 *
 * So the move asks first, and shows its working. Pressing the button opens a
 * panel naming what the list would be built from -- the base list, the add-ons
 * this trip counts as, and the fact that recent trips and the month are also
 * read -- with the add-ons tappable right there. That is the adjustment worth
 * offering at this moment: the items themselves are edited on the packing screen
 * afterwards, but which lists they come out of is a decision that has to be made
 * before anything is generated, and it was previously buried two screens away
 * behind "Built from".
 *
 * A family with no base list at all is the case that used to fail silently: with
 * no templates the generator has no floor to build on, so the list arrives thin
 * or empty and nothing explains why. The panel says so and offers to have Aly
 * start one, which is the same door the Packing templates screen offers when it
 * is empty.
 *
 * Nothing here is decided for anybody. The panel has three ways out: move and
 * build the list, move without one, or cancel. A trip that already has a list
 * gets a fourth: move and rebuild it from scratch, from the sources shown. That
 * one asks twice, because it is the only button here that throws anything away
 * -- and it is refused outright once anybody has started ticking items off,
 * which is the route's own rule rather than this screen's. Only the move itself and the
 * add-on choice are written from this component; the list is built by
 * /api/packing/generate, which refuses drafts and refuses to overwrite a list
 * anyone has started packing.
 *
 * And it is the moment the trip's picture becomes worth drawing, which happens
 * without being offered -- a cover is what the card is mostly made of once the
 * trip is on the trips board, and there is nothing to decide about wanting one.
 * The move itself does not wait for it: it writes a note on the row and the
 * screen picks it up. See lib/covers/queue.js.
 */

/**
 * Asks whichever of these buttons is on the page to open its panel.
 *
 * The button lives near the top of the draft screen, beside the progress bar it
 * belongs to, and the draft screen is long — six basics, the ideas, the days,
 * and the summary of everything else. By the time somebody has read to the
 * bottom and decided the draft is finished, the control that finishes it is
 * several screens back up. A second button down there that only said "scroll
 * up" would be a signpost; this one does the thing, and the scroll is so the
 * panel it opens is actually looked at rather than opened out of sight.
 *
 * `detail.tripId` is checked because the trips board mounts one of these per
 * draft card, and an unaddressed event there would open all of them at once.
 */
export const PROMOTE_DRAFT_EVENT = "alyeska:promote-draft";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthOf(date) {
  const n = Number(String(date || "").slice(5, 7));
  return MONTHS[n - 1] || "";
}

function things(n) {
  return `${n} item${n === 1 ? "" : "s"}`;
}

export default function PromoteDraft({ trip, onDone, hasPacking = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [needsList, setNeedsList] = useState(false);

  // What the list would be built from. Read when the panel opens rather than
  // with the screen: three different screens mount this button, only one of
  // them already knows the family's templates, and none of them should pay for
  // a query nobody opened.
  const [base, setBase] = useState(null);
  const [addOns, setAddOns] = useState([]);
  const [chosen, setChosen] = useState(() => new Set());
  const [wasChosen, setWasChosen] = useState(() => new Set());
  const [listCount, setListCount] = useState(hasPacking ? -1 : 0);
  const [packedCount, setPackedCount] = useState(0);
  const [sure, setSure] = useState(false);
  const hostRef = useRef(null);

  const look = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [tplRes, itemRes, linkRes, listRes] = await Promise.all([
      // Row-level security keeps this to the family's own, so no family filter
      // is needed here. An animal's list is left out: whether the dog's things
      // are packed follows from whether the dog is coming, which the roster
      // answers, so it is not one of the kinds of trip this is.
      supabase
        .from("packing_templates")
        .select("id, name, is_base")
        .is("pet_id", null)
        .order("is_base", { ascending: false })
        .order("name", { ascending: true }),
      supabase.from("packing_template_items").select("template_id"),
      supabase
        .from("trip_templates")
        .select("template_id")
        .eq("trip_id", trip.id),
      // is_packed as well as the count: a list nobody has touched can be rebuilt,
      // and a list somebody has started working through cannot.
      supabase
        .from("packing_items")
        .select("id, is_packed")
        .eq("trip_id", trip.id)
        .is("stashed_at", null),
    ]);

    const held = new Map();
    for (const row of itemRes.data || []) {
      held.set(row.template_id, (held.get(row.template_id) || 0) + 1);
    }
    const all = (tplRes.data || []).map((t) => ({
      ...t,
      count: held.get(t.id) || 0,
    }));
    const links = new Set(
      (linkRes.data || []).map((r) => r.template_id).filter(Boolean),
    );

    setBase(all.find((t) => t.is_base) || null);
    setAddOns(all.filter((t) => !t.is_base));
    setChosen(new Set(links));
    setWasChosen(new Set(links));
    const lines = listRes.data || [];
    setListCount(lines.length);
    setPackedCount(lines.filter((r) => r.is_packed).length);
    setLoading(false);
  }, [trip.id]);

  useEffect(() => {
    if (open) look();
  }, [open, look]);

  const begin = useCallback(() => {
    setProblem("");
    if (!trip.start_date || !trip.end_date) {
      setProblem(
        "It needs a first and last day before it can move — ask Aly for dates, or set them under Edit trip.",
      );
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (trip.end_date < today) {
      setProblem(
        "Those dates have already gone by, so it would land in Past trips. Change the dates first.",
      );
      return;
    }
    setOpen(true);
  }, [trip.start_date, trip.end_date]);

  // Opened from somewhere else on the page. The scroll waits a frame so it is
  // measuring the panel rather than the button it replaced, and it centers
  // rather than aligning to the top because the panel is taller than a button
  // and its buttons are at the bottom of it. When the dates refuse the move,
  // begin() writes a sentence instead of opening anything -- and that sentence
  // is the thing worth scrolling to, so the scroll happens either way.
  useEffect(() => {
    function onAsk(e) {
      const wanted = e?.detail?.tripId;
      if (wanted && wanted !== trip.id) return;
      begin();
      requestAnimationFrame(() => {
        hostRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }
    window.addEventListener(PROMOTE_DRAFT_EVENT, onAsk);
    return () => window.removeEventListener(PROMOTE_DRAFT_EVENT, onAsk);
  }, [trip.id, begin]);

  function toggle(id) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function askAly(seed) {
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: { seed, autoSend: true, focus: TEMPLATES_FOCUS },
      }),
    );
  }

  async function move(build, rebuild = false) {
    setProblem("");
    setNeedsList(false);
    const supabase = createClient();

    // The add-on choice first, because it is what the list is built from and a
    // list built before it was saved would be built from the old answer.
    const added = [...chosen].filter((id) => !wasChosen.has(id));
    const dropped = [...wasChosen].filter((id) => !chosen.has(id));
    if (added.length || dropped.length) {
      setBusy("Saving what it counts as…");
      if (dropped.length) {
        const { error } = await supabase
          .from("trip_templates")
          .delete()
          .eq("trip_id", trip.id)
          .in("template_id", dropped);
        if (error) {
          setBusy("");
          setProblem("That did not save. Try it again.");
          return;
        }
      }
      if (added.length) {
        const { error } = await supabase
          .from("trip_templates")
          .insert(added.map((id) => ({ trip_id: trip.id, template_id: id })));
        if (error) {
          setBusy("");
          setProblem("That did not save. Try it again.");
          return;
        }
      }
      await supabase
        .from("trips")
        .update({ templates_chosen_at: new Date().toISOString() })
        .eq("id", trip.id);
      setWasChosen(new Set(chosen));
    }

    setBusy("Moving…");
    const patch = { status: "planning" };
    const { error } = await supabase
      .from("trips")
      .update({ ...patch, ...(coverQueuePatch(trip, patch) || {}) })
      .eq("id", trip.id);
    if (error) {
      setBusy("");
      setProblem("That did not save. Try it again.");
      return;
    }

    // The trip has moved. Anything else has to happen before the refresh, which
    // takes this button off the screen along with the rest of the draft.

    // The household's own departure list -- bins, thermostat, mail -- which is
    // held back from drafts and so has never been written onto this trip. This is
    // the moment it becomes eligible, and it is not offered as a choice: it is a
    // handful of lines the family does on every single departure, and the whole
    // point of writing them down once is never having to remember to attach
    // them. See lib/tasks/onto.js.
    setBusy("Adding the house list\u2026");
    await houseListOnto(trip.id);

    if (build) {
      setBusy(
        rebuild
          ? "Building it again from scratch…"
          : "Working out its packing list…",
      );
      let built = false;
      try {
        const res = await fetch("/api/packing/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId: trip.id, replace: rebuild }),
        });
        const out = res.ok ? await res.json() : null;
        // On a first build, "skipped" means a list was already there, which is
        // as good an outcome as having built one. On a rebuild it means the
        // route refused -- somebody has packed something -- and that is a
        // failure worth saying, not a silent no-op.
        built = Boolean(
          out && (out.count > 0 || (!rebuild && out.source === "skipped")),
        );
      } catch {
        built = false;
      }
      if (!built) {
        // Leave the screen alone so the retry below stays pressable. The trip
        // has already moved; only its list is missing.
        setBusy("");
        setOpen(false);
        setNeedsList(!rebuild);
        setProblem(
          rebuild
            ? "It has moved, but its list was left as it was — it could not be built again just now."
            : "It has moved, but its packing list could not be worked out just now.",
        );
        return;
      }
    }

    setBusy("");
    if (onDone) onDone();
    router.refresh();
  }

  const hasList = listCount > 0 || listCount === -1;
  const month = monthOf(trip.start_date);
  const working = Boolean(busy);

  return (
    <span
      ref={hostRef}
      className="no-print inline-flex w-full flex-col items-start gap-1"
    >
      {!open && (
        <button
          type="button"
          onClick={begin}
          className="text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal disabled:opacity-60"
        >
          Move to Upcoming trips
        </button>
      )}

      {problem && (
        <span className="text-xs font-normal leading-relaxed text-rose">
          {problem}
        </span>
      )}

      {needsList && (
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent(ASK_ALY_EVENT, {
                detail: {
                  seed: "Start the packing list for this trip.",
                  autoSend: true,
                },
              }),
            )
          }
          className="text-xs font-normal leading-relaxed text-ink-soft underline decoration-[var(--line-strong)] underline-offset-2 hover:text-teal"
        >
          Try its packing list again?
        </button>
      )}

      {open && (
        <div className="mt-1 w-full max-w-xl rounded-[0.875rem] border border-[var(--line)] bg-white px-3.5 py-3 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
            {hasList
              ? "Its packing list"
              : "Its packing list would be built from"}
          </p>

          {loading ? (
            <p className="mt-2 text-xs text-ink-soft">Looking…</p>
          ) : (
            <>
              {/* A list already there is left alone by the move -- but the
                  sources are still worth showing, because they are what a
                  rebuild would use and they are adjustable in the same breath. */}
              {hasList && (
                <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                  It already has a packing list
                  {listCount > 0 ? ` of ${things(listCount)}` : ""}, and the
                  move leaves it exactly as it is. Building it again from
                  scratch would start from:
                </p>
              )}
              {base ? (
                <p className="mt-2 text-xs leading-relaxed text-ink">
                  <span className="font-semibold">{base.name}</span>
                  <span className="text-ink-soft">
                    {" "}
                    — {things(base.count)}, and every trip starts there.
                  </span>
                </p>
              ) : (
                <div className="mt-2 rounded-[0.75rem] border border-amber/35 bg-amber/10 px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-ink">
                    You have no base packing list yet — the list every trip
                    starts from. Without it there is little to build on, so what
                    arrives will be thin.
                  </p>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() =>
                      askAly(templateRequest({ name: FIRST_NAME, first: true }))
                    }
                    className="mt-2 text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal disabled:opacity-60"
                  >
                    Have Aly start a base list first
                  </button>
                </div>
              )}

              {addOns.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-xs leading-relaxed text-ink-soft">
                    Which of these it also counts as — tap to change:
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    {addOns.map((t) => {
                      const on = chosen.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggle(t.id)}
                          disabled={working}
                          aria-pressed={on}
                          className={`inline-block max-w-full rounded-[999px] border px-2.5 py-1 text-left text-[0.675rem] font-semibold uppercase leading-snug tracking-[0.06em] [overflow-wrap:anywhere] ${
                            on
                              ? "border-teal/40 bg-teal/10 font-semibold text-teal"
                              : "border-[var(--line)] bg-white text-ink-soft"
                          } ${working ? "opacity-60" : ""}`}
                        >
                          {on ? "✓ " : ""}
                          {t.name}
                          <span className="font-normal text-ink-faint">
                            {" · "}
                            {t.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">
                Then what you actually packed on recent trips
                {trip.destination ? `, where ${trip.destination} is` : ""}
                {month ? ` in ${month}` : ""}, and who is going. You can change
                every line of it on the packing screen afterwards — nothing here
                is final.
              </p>

              {/* The one thing on this panel that can lose work, so it is said
                  before it is offered, and it is not offered at all once the
                  list has been started -- the route would refuse it anyway. */}
              {hasList && packedCount > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-amber">
                  {things(packedCount)} on it {packedCount === 1 ? "is" : "are"}{" "}
                  already ticked off, so it cannot be built again from scratch —
                  that would throw away what you have done. Ask Aly for the
                  pieces you want instead.
                </p>
              )}
            </>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => move(!hasList)}
              disabled={working || loading}
              className="btn btn-primary text-xs disabled:opacity-60"
            >
              {busy ||
                (hasList
                  ? "Move to Upcoming trips"
                  : "Move and build the list")}
            </button>
            {!hasList && (
              <button
                type="button"
                onClick={() => move(false)}
                disabled={working || loading}
                className="text-xs font-semibold text-ink-soft underline decoration-[var(--line-strong)] underline-offset-2 hover:text-teal disabled:opacity-60"
              >
                Move without a list
              </button>
            )}
            {hasList && packedCount === 0 && (
              <button
                type="button"
                onClick={() => {
                  if (!sure) {
                    setSure(true);
                    return;
                  }
                  move(true, true);
                }}
                disabled={working || loading}
                className={`text-xs font-semibold underline underline-offset-2 disabled:opacity-60 ${
                  sure
                    ? "text-rose decoration-rose/40 hover:decoration-rose"
                    : "text-ink-soft decoration-[var(--line-strong)] hover:text-teal"
                }`}
              >
                {sure
                  ? `Yes — replace ${listCount > 0 ? things(listCount) : "the list"}`
                  : "Move and start the list from scratch"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSure(false);
                setOpen(false);
              }}
              disabled={working}
              className="text-xs font-normal text-ink-soft underline decoration-[var(--line)] underline-offset-2 hover:text-ink disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
          {sure && !working && (
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              Every unpacked line goes, and a new list is worked out from the
              sources above. Anything set aside stays set aside.
            </p>
          )}
        </div>
      )}
    </span>
  );
}
