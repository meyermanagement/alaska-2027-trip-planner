"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { PendingSpark, Spinner } from "@/components/LinkPending";
import LocationField from "@/components/LocationField";
import WhenToGo from "@/components/WhenToGo";
import PlaceExpect from "@/components/PlaceExpect";
import { MONTHS, monthsSaid } from "@/lib/someday/months";

/**
 * The whole answer as one line, for the row that is not being edited.
 *
 * The nights and the airfare ceiling are deliberately absent. Both are still
 * stored, and Aly still writes them when somebody says a length or a price out
 * loud, but nothing checks fares on a schedule yet, so showing them here asked
 * the family to maintain numbers that changed nothing.
 */
function placeSaid(row, travelers) {
  const bits = [monthsSaid(row.months)];
  const ids = row.traveler_ids || [];
  if (ids.length) {
    const names = travelers
      .filter((person) => ids.includes(person.id))
      .map((person) => person.name);
    if (names.length) bits.push(names.join(", "));
  }
  return bits.join(" \u00b7 ");
}

/**
 * The ranks a place can be given, highest first.
 *
 * Words rather than the five numbers that were here before. A number asked the
 * family to hold a scale in their heads and then argue about whether a place was
 * a 2 or a 3, an argument with no answer and nothing downstream that reads the
 * difference. High, medium and low say it out loud and are legible on a card
 * where a bare 3 was not.
 *
 * Stored as the same smallint, 1 first, so the sort and everything reading the
 * column keep working: the word is the label, the number is still the order.
 */
const RANKS = [
  { value: 1, label: "High" },
  { value: 2, label: "Medium" },
  { value: 3, label: "Low" },
];

/** The rank on a row, or null when it is unranked or out of range. */
function rankOf(row) {
  return RANKS.some((rank) => rank.value === row?.priority)
    ? row.priority
    : null;
}

/**
 * Which sort the list is in. Priority is the one you get without asking.
 *
 * Soonest month was here and is gone. The months on a bucket-list row say which
 * time of year a place is worth going in, not which year, so ordering by the
 * next one to come round put a place somebody might go to in nine years above a
 * place they are saving for next spring, and read as a schedule the list does
 * not have.
 */
const SORTS = [
  { id: "priority", label: "Priority" },
  { id: "newest", label: "Newest" },
];

/**
 * The list in the order somebody asked for.
 *
 * Every sort ends on the same tiebreak -- the order the places were added --
 * so two rows the sort cannot separate never swap places between renders.
 */
function sorted(rows, how) {
  const list = [...rows];
  const added = (row) => new Date(row.created_at || 0).getTime();
  if (how === "newest") return list.sort((a, b) => added(b) - added(a));
  // Unranked is not a six. It is an absence, and it sits after everything
  // somebody has actually thought about.
  const rank = (row) => rankOf(row) ?? 9;
  return list.sort((a, b) => rank(a) - rank(b) || added(a) - added(b));
}

/** "September 2026", for dating a season claim that will age. */
function saidWhen(value) {
  const at = value ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Why these months, when Aly is the one who said it.
 *
 * Only ever shown for a window somebody accepted. A row ticked by hand has no
 * line here, and that silence is honest: it means the family decided, not that
 * the app has forgotten why. The date is on it because a season answer read off
 * the web in September is a claim about September, and a family looking at this
 * eighteen months later should be able to see how old it is before they trust it.
 */
function MonthsWhy({ row }) {
  if (!row.months_reason) return null;
  const sources = Array.isArray(row.months_sources)
    ? row.months_sources.filter((one) => one?.url).slice(0, 3)
    : [];
  const when = saidWhen(row.months_said_at);

  return (
    <div className="mt-1.5 border-l-2 border-teal/30 pl-3">
      <p className="text-sm leading-relaxed text-ink-soft">
        {row.months_reason}
      </p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-ink-faint">
        {when ? <span>Aly, {when}</span> : <span>Aly</span>}
        {sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
          >
            {source.title || "Source"}
          </a>
        ))}
      </p>
    </div>
  );
}

/**
 * The pill that says a rank on a shut row.
 *
 * On the card because the rank is the one field worth reading while scanning:
 * the whole point of folding a row away is to leave the two things that decide
 * whether you open it, which are where and how much you want it. Unranked says
 * so in words rather than going blank, because a missing pill reads as a bug.
 */
function RankPill({ row }) {
  const rank = rankOf(row);
  if (!rank) {
    return (
      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs text-ink-faint">
        No priority
      </span>
    );
  }
  const tone =
    rank === 1
      ? "border-teal/40 bg-teal/10 text-teal"
      : rank === 2
        ? "border-[var(--line)] text-ink-soft"
        : "border-[var(--line)] text-ink-faint";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {RANKS.find((one) => one.value === rank).label}
    </span>
  );
}

/** The disclosure arrow, pointing down once the row is open. */
function Caret({ open }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`mt-1.5 h-4 w-4 shrink-0 text-ink-faint transition-transform ${
        open ? "rotate-90" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

/**
 * The filters, in the order the ranks are in, with unranked last.
 *
 * Unranked is its own filter rather than folded into low, because not having
 * decided is not the same as having decided the place is a low priority, and
 * the list of places nobody has ranked yet is the one a person actually wants
 * to pull up and work through.
 */
const FILTERS = [
  ...RANKS.map((rank) => ({ id: String(rank.value), label: rank.label })),
  { id: "none", label: "Unranked" },
];

/** Whether a row answers a filter. */
function underFilter(row, only) {
  if (!only) return true;
  if (only === "none") return rankOf(row) === null;
  return rankOf(row) === Number(only);
}

const BLANK = {
  place: "",
  lat: null,
  lon: null,
  why: "",
  months: [],
  // Null rather than medium. A place nobody has ranked should stay unranked, not
  // be handed a middling answer the family never chose.
  priority: null,
  traveler_ids: [],
  // Carried through the form so an accepted window survives the save, and
  // cleared the moment somebody ticks a month themselves.
  months_reason: null,
  months_sources: [],
  months_said_at: null,
};

function formFrom(row) {
  if (!row) return { ...BLANK };
  return {
    place: row.place || "",
    lat: row.lat ?? null,
    lon: row.lon ?? null,
    why: row.why || "",
    months: [...(row.months || [])],
    priority: rankOf(row),
    traveler_ids: [...(row.traveler_ids || [])],
    months_reason: row.months_reason || null,
    months_sources: Array.isArray(row.months_sources) ? row.months_sources : [],
    months_said_at: row.months_said_at || null,
  };
}

/**
 * The bucket list, and the form that both adds to it and edits it.
 *
 * One form for both jobs on purpose: adding a place and correcting one are the
 * same four questions, and two copies of four fields is where the two copies
 * start disagreeing about what a blank answer means.
 */
export default function SomedayList({
  familyId,
  places = [],
  travelers = [],
  trips = [],
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // "new" while adding, a row id while editing one, empty while neither.
  const [editing, setEditing] = useState("");
  const [form, setForm] = useState({ ...BLANK });
  // "form" while the form is writing, else the id of the row being changed.
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // A write is not finished when the database answers; it is finished when the
  // page has been re-read and the row on screen is the row that was saved. The
  // refresh runs inside a transition so that wait is something we can show.
  const [refreshing, startRefresh] = useTransition();
  const awaiting = useRef(false);
  const afterward = useRef(null);

  function settle(after) {
    awaiting.current = true;
    afterward.current = after || null;
    startRefresh(() => router.refresh());
  }

  useEffect(() => {
    if (refreshing || !awaiting.current) return;
    awaiting.current = false;
    setBusy("");
    const after = afterward.current;
    afterward.current = null;
    if (after) after();
  }, [refreshing]);

  // Which order the open list is in. Not remembered between visits on purpose:
  // priority is the answer to "what should we do next", and that is the question
  // somebody has when they open this page, whatever they were sorting by last
  // time they were looking for one particular place.
  const [how, setHow] = useState("priority");

  // Which rank the list is narrowed to, or empty for all of them. Not remembered
  // between visits either, and for the same reason the sort is not: a filter
  // left on from last week is a list with places missing from it and no obvious
  // explanation, which is worse than one press.
  const [only, setOnly] = useState("");

  // Which rows are unfolded, by id. A set rather than one id because a family
  // comparing two places wants both open at once, and because the alternative
  // closes the row you were reading when you open another.
  const [unfolded, setUnfolded] = useState(() => new Set());

  function fold(id) {
    setUnfolded((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const settled = places.filter((row) => row.status !== "open");
  const live = useMemo(
    () => places.filter((row) => row.status === "open"),
    [places],
  );

  // Counted before the filter is applied, so the chips can say what pressing
  // them would give you. A chip that leads to an empty screen is worse than one
  // that admits in advance there is nothing behind it.
  const counts = useMemo(() => {
    const tally = { "": live.length };
    for (const filter of FILTERS) {
      tally[filter.id] = live.filter((row) =>
        underFilter(row, filter.id),
      ).length;
    }
    return tally;
  }, [live]);

  const open = useMemo(
    () =>
      sorted(
        live.filter((row) => underFilter(row, only)),
        how,
      ),
    [live, how, only],
  );

  function start(row) {
    setError("");
    setForm(formFrom(row));
    setEditing(row ? row.id : "new");
    // A row being edited is open whatever it was before, since the form is what
    // the fold would otherwise be hiding.
    if (row) setUnfolded((was) => new Set(was).add(row.id));
  }

  function stop() {
    setEditing("");
    setForm({ ...BLANK });
    setError("");
  }

  function set(key, value) {
    setForm((was) => ({ ...was, [key]: value }));
  }

  /**
   * A month ticked by hand, which retires whatever reason was on the row.
   *
   * Aly's sentence names the months it was about, so the moment a person adds or
   * drops one it stops describing what is on screen. Keeping it would leave a
   * confident explanation attached to a set of months nobody explained.
   */
  function toggleMonth(month) {
    setForm((was) => ({
      ...was,
      months: was.months.includes(month)
        ? was.months.filter((m) => m !== month)
        : [...was.months, month].sort((a, b) => a - b),
      months_reason: null,
      months_sources: [],
      months_said_at: null,
    }));
  }

  /** A window accepted inside the form. Fills the boxes; the save keeps the words. */
  function useWindow({ months, reason, sources }) {
    setForm((was) => ({
      ...was,
      months: [...months].sort((a, b) => a - b),
      months_reason: reason || null,
      months_sources: sources || [],
      months_said_at: new Date().toISOString(),
    }));
  }

  function toggleTraveler(id) {
    setForm((was) => ({
      ...was,
      traveler_ids: was.traveler_ids.includes(id)
        ? was.traveler_ids.filter((one) => one !== id)
        : [...was.traveler_ids, id],
    }));
  }

  /**
   * Where the place is, when a point can be had for it.
   *
   * A wish list works perfectly well as words -- "somewhere with a reef" is a
   * legitimate row -- so the coordinate is a convenience and never a
   * requirement. When the family picked a suggestion we already have the point;
   * when they typed the name and moved on, one lookup is worth it, because it is
   * what lets a fare to an airport near the place be recognized as a fare to the
   * place.
   */
  async function pointFor(said) {
    if (Number.isFinite(form.lat) && Number.isFinite(form.lon)) {
      return { lat: form.lat, lon: form.lon };
    }
    try {
      const res = await fetch(`/api/here?q=${encodeURIComponent(said)}`);
      if (!res.ok) return { lat: null, lon: null };
      const json = await res.json();
      const here = json?.here;
      return Number.isFinite(here?.lat) && Number.isFinite(here?.lon)
        ? { lat: here.lat, lon: here.lon }
        : { lat: null, lon: null };
    } catch {
      return { lat: null, lon: null };
    }
  }

  async function save() {
    if (busy) return;
    const said = form.place.trim().replace(/\s+/g, " ");
    if (!said) {
      setError("Say where, and the rest is optional.");
      return;
    }
    setBusy("form");
    setError("");

    const point = await pointFor(said);

    // Only the four fields the form asks about. The nights, the airfare ceiling
    // and the watch flag are left out of the patch on purpose: they are still
    // columns, and Aly still fills them, so an edit here must not quietly
    // overwrite what she wrote with the blank this form no longer collects.
    const row = {
      place: said,
      lat: point.lat,
      lon: point.lon,
      why: form.why.trim() || null,
      months: form.months,
      priority: form.priority,
      traveler_ids: form.traveler_ids,
      months_reason: form.months_reason,
      months_sources: form.months_sources,
      months_said_at: form.months_said_at,
    };

    const { error: dbError } =
      editing === "new"
        ? await supabase
            .from("someday_places")
            .insert({ ...row, family_id: familyId, watch: true })
        : await supabase.from("someday_places").update(row).eq("id", editing);

    if (dbError) {
      setBusy("");
      setError(dbError.message);
      return;
    }
    // The form stays open, spinning, until the list behind it has caught up.
    settle(stop);
  }

  async function change(row, patch) {
    if (busy) return;
    setBusy(row.id);
    setError("");
    const { error: dbError } = await supabase
      .from("someday_places")
      .update(patch)
      .eq("id", row.id);
    if (dbError) {
      setBusy("");
      setError(dbError.message);
      return;
    }
    settle();
  }

  async function drop(row) {
    if (busy) return;
    setBusy(row.id);
    setError("");
    const { error: dbError } = await supabase
      .from("someday_places")
      .delete()
      .eq("id", row.id);
    if (dbError) {
      setBusy("");
      setError(dbError.message);
      return;
    }
    settle();
  }

  const theForm = (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3">
      <div className="w-full sm:w-[30rem]">
        <label className="section-label block" htmlFor="someday-place">
          Where
        </label>
        <LocationField
          value={form.place}
          onChange={(next) => {
            setForm((was) => ({
              ...was,
              place: next,
              // Typed over: the point we had belonged to a different answer.
              lat: was.place === next ? was.lat : null,
              lon: was.place === next ? was.lon : null,
            }));
          }}
          onPick={(place) =>
            setForm((was) => ({
              ...was,
              place: place.value,
              lat: place.lat ?? null,
              lon: place.lon ?? null,
            }))
          }
          placeholder="Kyoto, Japan"
          className="field w-full"
          inputProps={{ id: "someday-place", maxLength: 120 }}
        />
      </div>

      {/*
       * What they want out of the place, not a label for it.
       *
       * "Why this one" was answered with a category -- "the food", "hiking" --
       * which is the least useful thing that could be written there. Asked what
       * they want to do, people write the thing they are actually picturing, and
       * that is what Aly can plan a day around and what makes the row
       * recognizable when a fare turns up two years later. Two lines rather than
       * one box, because the shorter box asked for a label by its shape.
       */}
      <div className="mt-3 w-full sm:w-[30rem]">
        <label className="section-label block" htmlFor="someday-why">
          What you want to do there
        </label>
        <textarea
          id="someday-why"
          className="field min-h-[5.25rem] w-full resize-y"
          rows={3}
          value={form.why}
          maxLength={300}
          placeholder="Walk the temple district in cherry blossom season, and the kids want a night on the bullet train"
          onChange={(event) => set("why", event.target.value)}
        />
      </div>

      <div className="mt-3">
        <p className="section-label">Months you could actually go</p>
        <p className="mt-1 text-sm text-ink-soft">
          Nothing ticked means any month.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MONTHS.map((name, index) => {
            const month = index + 1;
            const on = form.months.includes(month);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                className={
                  on
                    ? "rounded-full border border-teal bg-teal px-2.5 py-1 text-sm font-medium text-white"
                    : "rounded-full border border-[var(--line)] px-2.5 py-1 text-sm text-ink-soft hover:border-[var(--line-hover)]"
                }
                onClick={() => toggleMonth(month)}
              >
                {name}
              </button>
            );
          })}
        </div>
        {/*
         * The help beside the question rather than a screen away from it. The
         * moment somebody most needs this is the moment they are looking at
         * twelve empty boxes for a place they have just named, so it asks with
         * what is typed in the form and not with a saved row.
         */}
        <div className="mt-2 text-sm">
          <WhenToGo
            place={form.place}
            why={form.why}
            months={form.months}
            label="Not sure? Ask Aly when to go"
            onUse={useWindow}
          />
        </div>
      </div>

      {/*
       * The rank, asked as chips for the same reason the months are: three taps
       * side by side let somebody see the whole scale while they choose, where a
       * dropdown asks them to remember it. Pressing the chip that is already on
       * clears it, which is the only way back to unranked once one is set.
       */}
      <div className="mt-3">
        <p className="section-label">How much you want it</p>
        <p className="mt-1 text-sm text-ink-soft">
          Leave it blank if you have not decided.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RANKS.map((rank) => {
            const on = form.priority === rank.value;
            return (
              <button
                key={rank.value}
                type="button"
                aria-pressed={on}
                className={
                  on
                    ? "rounded-full border border-teal bg-teal px-4 py-1 text-sm font-medium text-white"
                    : "rounded-full border border-[var(--line)] px-4 py-1 text-sm text-ink-soft hover:border-[var(--line-hover)]"
                }
                onClick={() => set("priority", on ? null : rank.value)}
              >
                {rank.label}
              </button>
            );
          })}
        </div>
      </div>

      {travelers.length ? (
        <div className="mt-3">
          <p className="section-label">Who it is for</p>
          <p className="mt-1 text-sm text-ink-soft">
            Nobody ticked means the whole household.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {travelers.map((person) => {
              const on = form.traveler_ids.includes(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={on}
                  className={
                    on
                      ? "rounded-full border border-teal bg-teal px-2.5 py-1 text-sm font-medium text-white"
                      : "rounded-full border border-[var(--line)] px-2.5 py-1 text-sm text-ink-soft hover:border-[var(--line-hover)]"
                  }
                  onClick={() => toggleTraveler(person.id)}
                >
                  {person.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary inline-flex items-center gap-2"
          // Pressed, not dimmed: disabled fades the ring turning inside the
          // button, which is the part that has to stay legible. A second press
          // is refused in save instead.
          aria-disabled={busy === "form"}
          onClick={save}
        >
          {busy === "form" ? (
            <>
              <Spinner className="h-4 w-4" />
              Saving&hellip;
            </>
          ) : editing === "new" ? (
            "Add it"
          ) : (
            "Save"
          )}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={Boolean(busy)}
          onClick={stop}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {/*
       * Only once there is enough list to order. Two places do not need a sort
       * control, and a row of buttons above two cards is a question nobody asked.
       */}
      {live.length > 2 ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {SORTS.map((sort) => {
            const on = how === sort.id;
            return (
              <button
                key={sort.id}
                type="button"
                aria-pressed={on}
                className={
                  on
                    ? "rounded-full border border-teal bg-teal px-2.5 py-1 text-sm font-medium text-white"
                    : "rounded-full border border-[var(--line)] px-2.5 py-1 text-sm text-ink-soft hover:border-[var(--line-hover)]"
                }
                onClick={() => setHow(sort.id)}
              >
                {sort.label}
              </button>
            );
          })}

          <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--line)]" />

          {[{ id: "", label: "All" }, ...FILTERS].map((filter) => {
            const on = only === filter.id;
            const count = counts[filter.id] || 0;
            // Nothing behind it, so nothing to press. Still drawn, because a
            // chip that disappears when the last high-priority place is booked
            // makes the row of filters move under your thumb.
            const empty = count === 0;
            return (
              <button
                key={filter.id || "all"}
                type="button"
                aria-pressed={on}
                disabled={empty && !on}
                className={
                  on
                    ? "rounded-full border border-teal bg-teal px-2.5 py-1 text-sm font-medium text-white"
                    : empty
                      ? "cursor-default rounded-full border border-[var(--line)] px-2.5 py-1 text-sm text-ink-faint opacity-60"
                      : "rounded-full border border-[var(--line)] px-2.5 py-1 text-sm text-ink-soft hover:border-[var(--line-hover)]"
                }
                onClick={() => setOnly(filter.id)}
              >
                {filter.label} {count}
              </button>
            );
          })}
        </div>
      ) : null}

      {open.length ? (
        <ul className="space-y-3">
          {open.map((row) => (
            <li key={row.id} className="card p-3">
              {editing === row.id ? (
                theForm
              ) : (
                <div className="flex items-start gap-2">
                  <Caret open={unfolded.has(row.id)} />
                  <div className="min-w-0 flex-1">
                    {/*
                     * The whole head is the target, not the caret alone. A 16px
                     * arrow is a miss on a phone, and the name and the months are
                     * what a thumb aims at anyway.
                     */}
                    <button
                      type="button"
                      aria-expanded={unfolded.has(row.id)}
                      className="-m-1 block w-full p-1 text-left"
                      onClick={() => fold(row.id)}
                    >
                      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-display text-lg font-semibold text-ink">
                          {row.place}
                        </span>
                        <RankPill row={row} />
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-soft">
                        {placeSaid(row, travelers)}
                      </span>
                    </button>

                    {unfolded.has(row.id) ? (
                      <>
                        {row.why ? (
                          <p className="mt-1 text-sm text-ink">{row.why}</p>
                        ) : null}
                        {/* Their words first, then hers. A machine's sentence above
                      the family's own reads as the app having the last word on
                      why they want to go somewhere. */}
                        <MonthsWhy row={row} />
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          {/*
                           * On the card as well as in the form, because changing
                           * a rank is not the same errand as correcting a place:
                           * the form asks four questions and this asks one, and
                           * one press should not put the name and the months
                           * into boxes. Inside the fold rather than on the shut
                           * head, because a select on a row you are scanning is
                           * a control you can change by accident.
                           */}
                          <label className="flex items-center gap-1.5 text-ink-soft">
                            <span className="sr-only">
                              How much you want {row.place}
                            </span>
                            <select
                              className="field"
                              value={rankOf(row) ?? ""}
                              disabled={Boolean(busy)}
                              onChange={(event) => {
                                const next = event.target.value;
                                change(row, {
                                  priority: next ? Number(next) : null,
                                });
                              }}
                            >
                              <option value="">No priority</option>
                              {RANKS.map((rank) => (
                                <option key={rank.value} value={rank.value}>
                                  {rank.label} priority
                                </option>
                              ))}
                            </select>
                          </label>
                          {/*
                           * The way out of the list and into a real trip.
                           *
                           * It carries the row's id and nothing else: the builder reads
                           * the place itself and writes the paragraph, so the link
                           * cannot fall behind an edit made here a second earlier and
                           * the sentence is not something anybody can rewrite in the
                           * address bar. Pressing it changes no data: the place stays
                           * open on this list, and building the trip is what settles
                           * it, rather than a separate field saying so here.
                           */}
                          <Link
                            href={`/trips/new?from=${row.id}`}
                            className="inline-flex items-center gap-1.5 font-medium text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                          >
                            Plan this trip
                            <PendingSpark />
                          </Link>
                          <button
                            type="button"
                            className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                            onClick={() => start(row)}
                          >
                            Edit
                          </button>
                          {/*
                           * Worded to match the two things on the other side of it.
                           * The place is kept rather than deleted, it lands under a
                           * heading that says off the list, and the way back is called
                           * put it back. Remove is not available for this: it lives on
                           * the settled rows and it deletes for good, so wearing that
                           * word here would make a reversible thing look final.
                           */}
                          <button
                            type="button"
                            className="text-ink-soft underline decoration-[var(--line)] underline-offset-2 hover:text-ink"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              change(row, { status: "retired", watch: false })
                            }
                          >
                            Take it off the list
                          </button>
                          {busy === row.id ? (
                            <span className="inline-flex items-center gap-1.5 text-ink-soft">
                              <Spinner className="h-4 w-4 text-teal" />
                              Saving&hellip;
                            </span>
                          ) : null}
                        </div>
                        {/*
                         * On its own line rather than in the row above, because what
                         * it opens is a panel of windows and a panel unfolding out of
                         * a row of links reads as the links having broken.
                         */}
                        <div className="mt-2 text-sm">
                          <WhenToGo
                            placeId={row.id}
                            place={row.place}
                            why={row.why || ""}
                            months={row.months || []}
                            disabled={Boolean(busy)}
                            onUse={({ months, reason, sources }) =>
                              change(row, {
                                months: [...months].sort((a, b) => a - b),
                                months_reason: reason || null,
                                months_sources: sources || [],
                                months_said_at: new Date().toISOString(),
                              })
                            }
                          />
                        </div>
                        {/*
                         * A second line under it rather than a second link beside it.
                         * The two questions are asked at different moments -- the
                         * months when somebody is looking at empty ticks, this one
                         * when they are deciding whether the place is realistic at
                         * all -- and both open panels, so a shared row would put two
                         * things that unfold next to each other.
                         */}
                        <div className="mt-2 text-sm">
                          <PlaceExpect row={row} />
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : live.length ? (
        /*
         * Only reachable by retiring the last place under a filter that is still
         * on, since a chip with nothing behind it cannot be pressed. It says
         * which filter rather than going blank, because an empty list under a
         * filter looks exactly like an empty list.
         */
        <div className="card p-4">
          <p className="text-sm text-ink-soft">
            Nothing on the list is{" "}
            {only === "none"
              ? "unranked"
              : `${(FILTERS.find((one) => one.id === only)?.label || "").toLowerCase()} priority`}
            .{" "}
            <button
              type="button"
              className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
              onClick={() => setOnly("")}
            >
              Show all {counts[""]}
            </button>
          </p>
        </div>
      ) : editing !== "new" ? (
        <div className="card p-4">
          <h2 className="font-display text-lg font-semibold">
            Nothing on the list yet
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            A place and the months you could go is enough for Aly to know a fare
            worth mentioning from one that is merely cheap. Without a list she
            is guessing at what you want.
          </p>
        </div>
      ) : null}

      {editing === "new" ? (
        theForm
      ) : (
        <button
          type="button"
          className="btn btn-primary mt-3"
          onClick={() => start(null)}
        >
          Add a place
        </button>
      )}

      {settled.length ? (
        <div className="mt-8">
          <h2 className="section-label">Booked, or off the list</h2>
          <ul className="mt-2 space-y-2">
            {settled.map((row) => {
              const trip = trips.find((one) => one.id === row.trip_id) || null;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[var(--line)] pt-2 text-sm first:border-0 first:pt-0"
                >
                  <span className="font-medium text-ink">{row.place}</span>
                  <span className="text-ink-soft">
                    {row.status === "booked"
                      ? trip
                        ? `Became ${trip.name}`
                        : "Booked"
                      : "Off the list"}
                  </span>
                  <button
                    type="button"
                    className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      change(row, {
                        status: "open",
                        trip_id: null,
                        watch: true,
                      })
                    }
                  >
                    Put it back
                  </button>
                  <button
                    type="button"
                    className="text-ink-faint underline decoration-[var(--line)] underline-offset-2 hover:text-rose"
                    disabled={Boolean(busy)}
                    onClick={() => drop(row)}
                  >
                    Remove
                  </button>
                  {busy === row.id ? (
                    <span className="inline-flex items-center gap-1.5 text-ink-soft">
                      <Spinner className="h-4 w-4 text-teal" />
                      Saving&hellip;
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
