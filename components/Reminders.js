"use client";

import { useMemo, useState } from "react";
import ClearedTips from "@/components/ClearedTips";
import Link from "next/link";
import { PendingSpark } from "./LinkPending";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PriorityMeter from "@/components/PriorityMeter";
import AddToCalendar from "@/components/AddToCalendar";
import { eventFromTask } from "@/lib/calendar";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  assigneeColor,
  formatShortDay,
} from "@/lib/format";
import {
  DueChip,
  ON_A_DATE,
  WhenField,
  whenColumns,
} from "@/components/TaskWhen";
import {
  DUE_BUCKETS,
  DUE_FILTERS,
  bucketOf,
  dueInfo,
  isHigh,
  matchesDueFilter,
  sortReminders,
} from "@/lib/reminders";
import { tripPath } from "@/lib/trips/route";

/**
 * Everything still open across every upcoming trip, on one page. The trip tabs
 * answer "what is left for Alaska"; this answers the question you actually ask
 * on a Tuesday morning — what needs doing next, and what is already late.
 */
// readOnly is a secondary traveler: the list is already narrowed to their own
// tasks by policy, and the tick is the only thing they may move.
export default function Reminders({
  tasks,
  today,
  userId,
  assigneesByTrip = {},
  readOnly = false,
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [due, setDue] = useState("all");
  const [priority, setPriority] = useState("all");
  // Ticking something off should feel instant, so the row leaves the list the
  // moment it is clicked rather than waiting for the round trip and refresh.
  const [justDone, setJustDone] = useState([]);
  // Which row is open for editing, and the changes made to any row so far. The
  // page's tasks come down from the server, so an edit is held here too and laid
  // over the top — otherwise the row would snap back to its old date for the
  // moment it takes the refresh to come round.
  const [editingId, setEditingId] = useState(null);
  const [edits, setEdits] = useState({});
  const [draft, setDraft] = useState(null);

  // Each task arrives with its trip, so the date it wants doing and the group it
  // belongs in are worked out once here rather than on every render pass.
  const rows = useMemo(
    () =>
      tasks
        .filter((task) => !justDone.includes(task.id))
        .map((raw) => {
          const task = edits[raw.id] ? { ...raw, ...edits[raw.id] } : raw;
          const info = dueInfo(task, task.trip, today);
          return {
            task,
            trip: task.trip,
            due: info,
            bucket: bucketOf(info.date, today),
          };
        }),
    [tasks, today, justDone, edits],
  );

  const shown = rows.filter(
    (row) =>
      matchesDueFilter(row.bucket, due) &&
      (priority === "all" || (row.task.priority || "normal") === priority),
  );

  const groups = DUE_BUCKETS.map((bucket) => [
    bucket,
    sortReminders(shown.filter((row) => row.bucket === bucket.id)),
  ]).filter(([, list]) => list.length > 0);

  const openHigh = rows.filter((row) => isHigh(row.task)).length;
  const overdue = rows.filter((row) => row.bucket === "overdue").length;

  async function complete(row) {
    setJustDone((ids) => [...ids, row.task.id]);
    await supabase
      .from("predeparture_tasks")
      .update({
        is_done: true,
        done_by: userId,
        done_at: new Date().toISOString(),
      })
      .eq("id", row.task.id);
    router.refresh();
  }

  // Opening the editor is the moment the stage-or-date question gets asked, so a
  // task that already has a date opens on the date and everything else opens on
  // its stage.
  function startEdit(task) {
    setEditingId(task.id);
    setDraft({
      timing: task.due_date ? ON_A_DATE : task.timing || "now",
      due_date: task.due_date || "",
      priority: task.priority || "normal",
      assignee: task.assignee || "Shared",
    });
  }

  async function saveEdit(row) {
    const patch = {
      ...whenColumns(draft.timing, draft.due_date, row.trip, today),
      priority: draft.priority,
      assignee: draft.assignee,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (draft.timing === ON_A_DATE && !draft.due_date) return;
    setEdits((all) => ({ ...all, [row.task.id]: patch }));
    setEditingId(null);
    setDraft(null);
    await supabase
      .from("predeparture_tasks")
      .update(patch)
      .eq("id", row.task.id);
    router.refresh();
  }

  return (
    <section>
      <p className="mb-4 text-sm text-ink-soft">
        {rows.length === 0 ? (
          "Nothing outstanding on any upcoming trip."
        ) : (
          <>
            <span className="font-semibold text-ink">
              {rows.length} still open
            </span>
            {openHigh > 0 && (
              <span className="ml-2 chip bg-rose/12 text-rose">
                {openHigh} high priority
              </span>
            )}
            {overdue > 0 && (
              <span className="ml-2 chip bg-rose/15 text-rose">
                {overdue} past due
              </span>
            )}
          </>
        )}
      </p>

      <div className="no-print mb-5 flex flex-col gap-2.5">
        <FilterRow
          legend="When"
          options={DUE_FILTERS}
          value={due}
          onChange={setDue}
        />
        <FilterRow
          legend="Priority"
          options={[
            { id: "all", label: "All" },
            ...PRIORITY_ORDER.map((p) => ({
              id: p,
              label: PRIORITY_LABELS[p],
            })),
          ]}
          value={priority}
          onChange={setPriority}
        />
      </div>

      <div className="space-y-4">
        {groups.map(([bucket, list]) => (
          <div key={bucket.id} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--line)] bg-sand/60 px-4 py-2.5">
              <h2 className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                {bucket.label}
              </h2>
              <span className="text-xs font-semibold text-ink-soft">
                {list.length}
              </span>
            </div>
            <ul>
              {list.map((row) => (
                <li
                  key={row.task.id}
                  className={`border-b border-sand/80 px-4 py-3 last:border-0 ${
                    isHigh(row.task)
                      ? "bg-rose/[0.04] shadow-[inset_3px_0_0_0_var(--color-rose)]"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5 shrink-0 accent-teal"
                      checked={false}
                      onChange={() => complete(row)}
                      aria-label={`Mark ${row.task.title} done`}
                    />
                    <PriorityMeter task={row.task} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {row.task.title}
                        </span>
                        <Link
                          href={tripPath(row.trip, "tasks")}
                          className="chip inline-flex items-center gap-1.5 bg-teal-soft text-teal transition hover:bg-teal hover:text-on-accent"
                        >
                          {row.trip.name}
                          <PendingSpark className="h-3 w-3" />
                        </Link>
                        <span
                          className={`chip ${assigneeColor(row.task.assignee)}`}
                        >
                          {row.task.assignee}
                        </span>
                        {row.due.exact ? (
                          <DueChip due={row.due.date} today={today} />
                        ) : (
                          <span className="chip bg-sand-deep text-ink-soft">
                            {row.due.note}
                            {row.due.date
                              ? ` · around ${formatShortDay(row.due.date)}`
                              : ""}
                          </span>
                        )}
                      </div>
                      {row.task.detail && (
                        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                          {row.task.detail}
                        </p>
                      )}
                    </div>
                    <div className="no-print flex shrink-0 items-center gap-1">
                      {row.due.date && (
                        <AddToCalendar
                          compact
                          className="mt-0.5"
                          event={eventFromTask(row.task, row.trip, today)}
                        />
                      )}
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() =>
                            editingId === row.task.id
                              ? setEditingId(null)
                              : startEdit(row.task)
                          }
                          className="rounded-lg px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-ink-faint transition hover:bg-sand hover:text-teal"
                          aria-expanded={editingId === row.task.id}
                        >
                          {editingId === row.task.id ? "Close" : "Edit"}
                        </button>
                      )}
                    </div>
                  </div>

                  {editingId === row.task.id && draft && (
                    <form
                      className="no-print mt-3 grid gap-2 rounded-xl border border-[var(--line)] bg-sand/40 p-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_auto]"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveEdit(row);
                      }}
                    >
                      <div
                        className={`grid gap-2 ${
                          draft.timing === ON_A_DATE ? "sm:grid-cols-2" : ""
                        }`}
                      >
                        <WhenField
                          idPrefix={`rem-${row.task.id}`}
                          timing={draft.timing}
                          due={draft.due_date}
                          onTiming={(value) =>
                            setDraft({
                              ...draft,
                              timing: value,
                              due_date:
                                value === ON_A_DATE ? draft.due_date : "",
                            })
                          }
                          onDue={(value) =>
                            setDraft({ ...draft, due_date: value })
                          }
                        />
                      </div>
                      <select
                        className="field"
                        value={draft.assignee}
                        aria-label="Who it is down to"
                        onChange={(e) =>
                          setDraft({ ...draft, assignee: e.target.value })
                        }
                      >
                        {(assigneesByTrip[row.trip.id] || ["Shared"]).map(
                          (name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ),
                        )}
                        {/* Somebody who is no longer on the roster is still who
                            this is down to, and dropping them silently would be
                            a reassignment nobody asked for. */}
                        {!(assigneesByTrip[row.trip.id] || []).includes(
                          draft.assignee,
                        ) && (
                          <option value={draft.assignee}>
                            {draft.assignee}
                          </option>
                        )}
                      </select>
                      <select
                        className="field"
                        value={draft.priority}
                        aria-label="Priority"
                        onChange={(e) =>
                          setDraft({ ...draft, priority: e.target.value })
                        }
                      >
                        {PRIORITY_ORDER.map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABELS[p]}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          className="btn btn-primary px-3 py-1.5 text-xs"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setDraft(null);
                          }}
                          className="btn btn-ghost px-3 py-1.5 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="card p-6 text-center text-sm text-ink-soft">
            {rows.length === 0
              ? "All clear — every task on every upcoming trip is done."
              : "Nothing matches those filters."}
          </p>
        )}
      </div>
      <ClearedTips />
    </section>
  );
}

function FilterRow({ legend, options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        {legend}
      </span>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={`rounded-full border px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] transition ${
              active
                ? "border-teal/80 bg-teal text-on-accent"
                : "border-[var(--line)] bg-white/70 text-ink-soft hover:border-teal/30 hover:text-teal"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
