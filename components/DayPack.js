"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dayPackLines, packedLabel } from "@/lib/daypack/pack";
import { ensureCaseRow, matchCaseRow } from "@/lib/daypack/link";
import { ASK_ALY_EVENT } from "./AskAlyTrigger";
import { assigneeColor } from "@/lib/format";
import ZoneBand, { SunIcon } from "./ZoneBand";
import ConfirmSheet from "./ConfirmSheet";

/**
 * What goes in the bag on one day, on the day it belongs to.
 *
 * The suitcase list and this list answer different questions, and the tick is the
 * reason they cannot be the same rows: packed means "it is in the case" and this
 * means "it is on me today". So a rain shell can be in the case for the whole trip
 * and still be unticked here on the morning it rains.
 *
 * Advice arrives as a line. A pro tip filed onto this day is drawn like everything
 * else, with a tick box, and ticking it is what turns it into a real line -- the row
 * is written with the tip's id on it and the tip itself is marked done, so it stops
 * being advice at the same moment it becomes a thing in the bag. Nobody has to
 * copy anything out.
 */
export default function DayPack({
  date,
  dayLabel = "",
  heading = "Day pack",
  tripId,
  rows = [],
  tips = [],
  people = [],
  userId = null,
  readOnly = false,
  onChange = () => {},
  className = "",
  collapsible = false,
  defaultOpen = false,
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);
  const [item, setItem] = useState("");
  const [who, setWho] = useState("Shared");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(defaultOpen);
  // The removal question, held while it is being asked: which line, and which
  // packing row the answer is about.
  const [ask, setAsk] = useState(null);

  const lines = useMemo(
    () => dayPackLines({ rows, tips, date }),
    [rows, tips, date],
  );

  // A day with nothing in the bag is still a day somebody can put something in
  // the bag for, so the card stays -- but not for somebody who cannot write to
  // this trip, who would be reading an empty box with no way to fill it.
  if (readOnly && !lines.length) return null;

  async function toggle(line) {
    if (readOnly) return;
    setBusy(line.key);
    setError("");
    const now = new Date().toISOString();
    if (line.kind === "tip") {
      // Accepting advice and packing it are the same gesture, so the row is
      // written already ticked. The tip is put away in the same breath: it has
      // done its job, and leaving it active would draw it again tomorrow beside
      // the row it produced.
      // Accepted advice is a thing on the trip too, so it goes on the packing
      // list in the same breath -- matched to the line that is already there when
      // there is one, written when there is not.
      const inCase = await ensureCaseRow(supabase, {
        tripId,
        item: line.item,
        assignee: "Shared",
        userId,
      });
      const { error: writeError } = await supabase
        .from("day_pack_items")
        .insert({
          trip_id: tripId,
          item_date: date,
          item: line.item,
          why: line.why || null,
          assignee: "Shared",
          is_packed: true,
          packed_by: userId,
          packed_at: now,
          source: "tip",
          from_tip_id: line.tipId,
          from_packing_id: inCase.id,
          created_by: userId,
          updated_by: userId,
        });
      if (writeError) {
        setError("That could not be saved. Try again.");
        setBusy(null);
        return;
      }
      await supabase
        .from("pro_tips")
        .update({ status: "done", resolved_by: userId, resolved_at: now })
        .eq("id", line.tipId);
    } else {
      const next = !line.isPacked;
      const { error: writeError } = await supabase
        .from("day_pack_items")
        .update({
          is_packed: next,
          packed_by: next ? userId : null,
          packed_at: next ? now : null,
          updated_by: userId,
          updated_at: now,
        })
        .eq("id", line.rowId);
      if (writeError) setError("That could not be saved. Try again.");
    }
    setBusy(null);
    onChange();
  }

  // Coming off a day is not the same as staying home. Dropping the binoculars
  // from Wednesday usually means Thursday instead, so the case is a question
  // asked once and never an assumption -- and answering "leave it" leaves the
  // packing line exactly as it was. (The other direction is a consequence, not a
  // question: taking it out of the case takes it off every day, and the packing
  // screen says so before it does it.)
  //
  // The question is asked whenever the case has the thing, whether or not this
  // row remembers being tied to it. Rows written before the two lists were tied
  // together carry no link, and so did rows Aly wrote on a day the packing write
  // failed; the link is the fast path and the name is the fallback, because a
  // silent removal is the one outcome that loses information.
  async function remove(line) {
    if (readOnly || line.kind === "tip") return;
    let caseId = line.fromPackingId || null;
    let caseItem = line.item;
    if (!caseId) {
      setBusy(line.key);
      const { data } = await supabase
        .from("packing_items")
        .select("id, item, assignee, stashed_at")
        .eq("trip_id", tripId);
      setBusy(null);
      const hit = matchCaseRow(data || [], line.item, line.assignee);
      if (hit) {
        caseId = hit.id;
        caseItem = hit.item;
      }
    }
    // Nothing in the case to decide about, so there is nothing to ask: the line
    // is somebody's own note on one day and it goes.
    if (!caseId) {
      await dropLine(line);
      return;
    }
    setAsk({ line, caseId, caseItem });
  }

  async function dropLine(line) {
    setBusy(line.key);
    const { error: writeError } = await supabase
      .from("day_pack_items")
      .delete()
      .eq("id", line.rowId);
    setBusy(null);
    setAsk(null);
    if (writeError) {
      setError("That could not be saved. Try again.");
      return;
    }
    onChange();
  }

  async function dropBoth(line, caseId) {
    setBusy(line.key);
    // The packing row is the parent, so removing it takes this line with it.
    const { error: writeError } = await supabase
      .from("packing_items")
      .delete()
      .eq("id", caseId);
    setBusy(null);
    setAsk(null);
    if (writeError) {
      setError("That could not be saved. Try again.");
      return;
    }
    onChange();
  }

  async function add(event) {
    event.preventDefault();
    const name = item.trim();
    if (!name) return;
    setBusy("new");
    setError("");
    // Same rule as everywhere else: it cannot be on somebody's back today and
    // absent from the trip. If the case already has it, the two rows are tied
    // together; if not, the list gains it, unpacked, which is the truth.
    const inCase = await ensureCaseRow(supabase, {
      tripId,
      item: name,
      assignee: who || "Shared",
      userId,
    });
    const { error: writeError } = await supabase.from("day_pack_items").insert({
      trip_id: tripId,
      item_date: date,
      item: name,
      assignee: who || "Shared",
      source: "you",
      from_packing_id: inCase.id,
      created_by: userId,
      updated_by: userId,
    });
    setBusy(null);
    if (writeError) {
      setError(
        /duplicate|unique/i.test(writeError.message || "")
          ? "That is already on this day."
          : "That could not be saved. Try again.",
      );
      return;
    }
    setItem("");
    setAdding(false);
    onChange();
  }

  const count = packedLabel(lines);

  const body = (
    <>
      {/* No heading when the caller has already written one. On the Packing page
          the day and the count are on the row you pressed to get here, and saying
          "Day pack, 1 of 5" again two lines below it is the same sentence twice.
          A band says it too, so a collapsible card never repeats it either. */}
      {heading && !collapsible ? (
        <div className="flex items-baseline gap-2">
          <h4 className="text-sm font-semibold text-ink">{heading}</h4>
          {count && (
            <span className="tabular text-xs text-ink-soft">{count}</span>
          )}
        </div>
      ) : null}

      {lines.length > 0 && (
        <ul className={heading ? "mt-2 space-y-1.5" : "space-y-1.5"}>
          {lines.map((line) => (
            <li key={line.key} className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={line.isPacked}
                disabled={readOnly || busy === line.key}
                onChange={() => toggle(line)}
                aria-label={`${line.isPacked ? "Take" : "Put"} “${line.item}” ${
                  line.isPacked ? "out of" : "in"
                } the day pack`}
                className="mt-0.5 size-4 shrink-0 accent-teal"
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`text-sm ${
                    line.isPacked ? "text-ink-soft line-through" : "text-ink"
                  }`}
                >
                  {line.item}
                </span>
                {line.assignee && line.assignee !== "Shared" && (
                  <span
                    className={`ml-2 whitespace-nowrap rounded-full px-1.5 py-0.5 align-middle text-[0.7rem] ${assigneeColor(
                      line.assignee,
                    )}`}
                  >
                    {line.assignee}
                  </span>
                )}
                {line.everyDay && (
                  <span className="ml-2 whitespace-nowrap rounded-full bg-sand px-1.5 py-0.5 align-middle text-[0.7rem] text-ink-soft">
                    Every day
                  </span>
                )}
                {line.kind === "tip" && (
                  <span className="ml-2 whitespace-nowrap rounded-full bg-amber/15 px-1.5 py-0.5 align-middle text-[0.7rem] font-semibold text-amber">
                    From a tip
                  </span>
                )}
                {line.why && (
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {line.why}
                  </span>
                )}
              </span>
              {!readOnly && line.kind === "row" && (
                <button
                  type="button"
                  onClick={() => remove(line)}
                  disabled={busy === line.key}
                  aria-label={`Take “${line.item}” off the day pack`}
                  className="shrink-0 rounded px-1 text-xs text-ink-soft transition hover:text-ink"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {lines.length === 0 && (
        <p className="mt-1 text-xs text-ink-soft">
          {date
            ? "Nothing in the bag for this day yet."
            : "Nothing carried on every day of this trip yet."}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-amber">{error}</p>}

      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {adding ? (
            <form onSubmit={add} className="flex w-full flex-wrap gap-2">
              <input
                autoFocus
                value={item}
                onChange={(event) => setItem(event.target.value)}
                placeholder="Binoculars"
                aria-label="What goes in the bag"
                className="min-w-0 flex-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink"
              />
              <select
                value={who}
                onChange={(event) => setWho(event.target.value)}
                aria-label="Whose"
                className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink"
              >
                <option value="Shared">Shared</option>
                {people.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy === "new" || !item.trim()}
                className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
              >
                {busy === "new" ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setItem("");
                  setError("");
                }}
                className="rounded-lg px-2 py-1.5 text-sm text-ink-soft"
              >
                Cancel
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-xs font-semibold text-teal underline underline-offset-2"
              >
                Add a thing
              </button>
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent(ASK_ALY_EVENT, {
                      detail: {
                        seed: `What else should we have in the day pack for ${dayLabel || date}?`,
                        focus: "itinerary",
                      },
                    }),
                  )
                }
                className="text-xs font-semibold text-teal underline underline-offset-2"
              >
                Ask Aly what else
              </button>
            </>
          )}
        </div>
      )}

      {/* The one real decision in here, asked in the app's own voice rather than
          in the browser's. It names the packing line it found, because the line
          being carried and the line in the case are not always spelled the same
          way, and either answer is a full sentence about what happens. */}
      {ask && (
        <ConfirmSheet
          title="Take it out of the case as well?"
          body={
            <>
              <p>
                “{ask.line.item}” comes off{" "}
                {ask.line.everyDay ? "every day of this trip" : "this day"}{" "}
                either way.
              </p>
              <p>
                It is also on this trip's packing list
                {ask.caseItem &&
                ask.caseItem.toLowerCase() !== ask.line.item.toLowerCase()
                  ? ` as “${ask.caseItem}”`
                  : ""}
                . Taking it off there takes it off every day it is carried.
              </p>
            </>
          }
          busy={busy === ask.line.key}
          actions={[
            {
              label: "Leave it on the packing list",
              onPick: () => dropLine(ask.line),
            },
            {
              label: "Take it off both",
              tone: "danger",
              onPick: () => dropBoth(ask.line, ask.caseId),
            },
          ]}
          onCancel={() => setAsk(null)}
        />
      )}
    </>
  );

  // Inside a day, the bag is a band you open rather than a card that is always
  // there. A day already holds every flight, room and booking somebody has made;
  // a fifth open box of tick lines above them pushed the day itself down the
  // screen, and most days nobody touches the bag at all. Shut, it still says how
  // much is in it, which is the one thing worth knowing without opening it.
  if (collapsible) {
    return (
      <section className={className}>
        <ZoneBand
          icon={<SunIcon className="h-[15px] w-[15px]" />}
          name={heading || "Day pack"}
          count={count || (lines.length ? "" : "Nothing in it yet")}
          level={4}
          open={open}
          onToggle={() => setOpen((was) => !was)}
        />
        {open ? (
          <div className="zone-kids">
            <div className="rounded-[0.875rem] border border-line bg-white/60 px-3 py-2.5">
              {body}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div
      className={`rounded-[0.875rem] border border-line bg-white/60 px-3 py-2.5 ${className}`}
    >
      {body}
    </div>
  );
}
