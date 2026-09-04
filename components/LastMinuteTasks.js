"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LAST_MINUTE_HEADING,
  lastMinuteTasks,
  nearDeparture,
} from "@/lib/tasks/lastMinute";
import { assigneeColor } from "@/lib/format";

/**
 * The handful of tasks that are about leaving, on the two screens people open on
 * the day they leave.
 *
 * Shut when it arrives, and it says how many are in it while shut -- that count is
 * the whole point of the closed state, because "Last-minute tasks · 3" is a reason
 * to open something and "Last-minute tasks" is not. Ticking a row here writes the
 * same three columns the tasks screen writes, so a thing ticked on the packing list
 * is ticked everywhere, and the row leaves the box on the next read.
 *
 * It draws nothing at all away from the trip -- see nearDeparture -- and nothing
 * when there is nothing left to do. An accordion that is always there is furniture.
 */
export default function LastMinuteTasks({
  tasks = [],
  trip = null,
  today,
  userId = null,
  onChange = () => {},
  onOpenTasks = null,
  readOnly = false,
  className = "",
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  if (!nearDeparture(trip, today)) return null;
  const rows = lastMinuteTasks(tasks, trip, today);
  if (rows.length === 0) return null;

  async function tick(task) {
    if (readOnly) return;
    setBusy(task.id);
    await supabase
      .from("predeparture_tasks")
      .update({
        is_done: true,
        done_by: userId,
        done_at: new Date().toISOString(),
      })
      .eq("id", task.id);
    setBusy(null);
    onChange();
  }

  return (
    <div
      className={`no-print rounded-[0.875rem] border border-amber/40 bg-amber/5 ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span
          aria-hidden="true"
          className={`text-xs text-amber transition ${open ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="text-sm font-semibold text-ink">
          {LAST_MINUTE_HEADING}
        </span>
        <span className="tabular rounded-full bg-amber/15 px-2 py-0.5 text-xs font-semibold text-amber">
          {rows.length}
        </span>
        <span className="ml-auto text-xs text-ink-soft">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="border-t border-amber/25 px-3 pb-3 pt-2">
          <ul className="space-y-1.5">
            {rows.map((task) => (
              <li key={task.id} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={readOnly || busy === task.id}
                  onChange={() => tick(task)}
                  aria-label={`Mark “${task.title}” done`}
                  className="mt-0.5 size-4 shrink-0 accent-teal"
                />
                <span className="min-w-0 flex-1 text-sm text-ink">
                  {task.title}
                  {task.assignee && (
                    <span
                      className={`ml-2 whitespace-nowrap rounded-full px-1.5 py-0.5 align-middle text-[0.7rem] ${assigneeColor(
                        task.assignee,
                      )}`}
                    >
                      {task.assignee}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {onOpenTasks && (
            <button
              type="button"
              onClick={onOpenTasks}
              className="mt-2.5 text-xs font-semibold text-teal underline underline-offset-2"
            >
              Open the tasks screen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
