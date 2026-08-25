"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PriorityMeter from "@/components/PriorityMeter";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  assigneeColor,
  formatShortDay,
} from "@/lib/format";
import {
  DUE_BUCKETS,
  DUE_FILTERS,
  bucketOf,
  dueInfo,
  isHigh,
  matchesDueFilter,
  sortReminders,
} from "@/lib/reminders";

/**
 * Everything still open across every upcoming trip, on one page. The trip tabs
 * answer "what is left for Alaska"; this answers the question you actually ask
 * on a Tuesday morning — what needs doing next, and what is already late.
 */
export default function Reminders({ tasks, today, userId }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [due, setDue] = useState("all");
  const [priority, setPriority] = useState("all");
  // Ticking something off should feel instant, so the row leaves the list the
  // moment it is clicked rather than waiting for the round trip and refresh.
  const [justDone, setJustDone] = useState([]);

  // Each task arrives with its trip, so the date it wants doing and the group it
  // belongs in are worked out once here rather than on every render pass.
  const rows = useMemo(
    () =>
      tasks
        .filter((task) => !justDone.includes(task.id))
        .map((task) => {
          const info = dueInfo(task, task.trip, today);
          return {
            task,
            trip: task.trip,
            due: info,
            bucket: bucketOf(info.date, today),
          };
        }),
    [tasks, today, justDone],
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
              <span className="ml-2 chip bg-amber/15 text-amber">
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
                  className={`flex items-start gap-3 border-b border-sand/80 px-4 py-3 last:border-0 ${
                    isHigh(row.task)
                      ? "bg-rose/[0.04] shadow-[inset_3px_0_0_0_var(--color-rose)]"
                      : ""
                  }`}
                >
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
                        href={`/trips/${row.trip.slug}?tab=tasks`}
                        className="chip bg-teal-soft text-teal transition hover:bg-teal hover:text-white"
                      >
                        {row.trip.name}
                      </Link>
                      <span
                        className={`chip ${assigneeColor(row.task.assignee)}`}
                      >
                        {row.task.assignee}
                      </span>
                      {row.due.exact ? (
                        <span className="chip bg-amber/15 text-amber">
                          Due {formatShortDay(row.due.date)}
                        </span>
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
                ? "border-teal/80 bg-teal text-white"
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
