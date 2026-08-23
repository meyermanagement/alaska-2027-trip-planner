"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TIMING_LABELS, TIMING_ORDER, assigneeColor } from "@/lib/format";

export default function Tasks({ items, tripId, travelers, userId, onChange }) {
  const supabase = useMemo(() => createClient(), []);
  const [newTitle, setNewTitle] = useState("");
  const [newTiming, setNewTiming] = useState("now");
  const [newAssignee, setNewAssignee] = useState("Shared");
  const [hideDone, setHideDone] = useState(false);

  const people = travelers.length
    ? travelers
    : ["Mark", "Steph", "Veda", "Shared"];

  const grouped = useMemo(() => {
    const map = new Map();
    items
      .filter((t) => (hideDone ? !t.is_done : true))
      .forEach((t) => {
        if (!map.has(t.timing)) map.set(t.timing, []);
        map.get(t.timing).push(t);
      });
    return TIMING_ORDER.filter((k) => map.has(k)).map((k) => [k, map.get(k)]);
  }, [items, hideDone]);

  async function toggle(task) {
    await supabase
      .from("predeparture_tasks")
      .update({
        is_done: !task.is_done,
        done_by: task.is_done ? null : userId,
        done_at: task.is_done ? null : new Date().toISOString(),
      })
      .eq("id", task.id);
    onChange();
  }

  async function remove(task) {
    await supabase.from("predeparture_tasks").delete().eq("id", task.id);
    onChange();
  }

  async function add(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await supabase.from("predeparture_tasks").insert({
      trip_id: tripId,
      title: newTitle.trim(),
      timing: newTiming,
      assignee: newAssignee,
      sort_order: 999,
    });
    setNewTitle("");
    onChange();
  }

  const done = items.filter((t) => t.is_done).length;

  return (
    <section>
      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-soft">
          {done} of {items.length} complete
        </p>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
          />
          Hide completed
        </label>
      </div>

      <form
        onSubmit={add}
        className="card no-print mb-5 grid gap-2 p-4 sm:grid-cols-[2fr_1fr_1fr_auto]"
      >
        <input
          className="field"
          placeholder="Add a task"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <select
          className="field"
          value={newTiming}
          onChange={(e) => setNewTiming(e.target.value)}
        >
          {TIMING_ORDER.map((t) => (
            <option key={t} value={t}>
              {TIMING_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={newAssignee}
          onChange={(e) => setNewAssignee(e.target.value)}
        >
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button className="btn btn-primary">Add</button>
      </form>

      <div className="space-y-4">
        {grouped.map(([timing, rows]) => (
          <div key={timing} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-sand-deep bg-sand/60 px-4 py-2.5">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wide">
                {TIMING_LABELS[timing]}
              </h3>
              <span className="text-xs font-semibold text-ink-soft">
                {rows.filter((r) => r.is_done).length}/{rows.length}
              </span>
            </div>
            <ul>
              {rows.map((task) => (
                <li
                  key={task.id}
                  className="group flex items-start gap-3 border-b border-sand/80 px-4 py-3 last:border-0"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-teal"
                    checked={task.is_done}
                    onChange={() => toggle(task)}
                    aria-label={`Mark ${task.title} done`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          task.is_done ? "strike-done" : ""
                        }`}
                      >
                        {task.title}
                      </span>
                      <span className={`chip ${assigneeColor(task.assignee)}`}>
                        {task.assignee}
                      </span>
                    </div>
                    {task.detail && (
                      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                        {task.detail}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => remove(task)}
                    className="no-print shrink-0 text-xs font-semibold text-ink-soft/60 opacity-0 transition group-hover:opacity-100 hover:text-rose"
                    aria-label={`Remove ${task.title}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="card p-6 text-center text-sm text-ink-soft">
            All clear — no open tasks.
          </p>
        )}
      </div>
    </section>
  );
}
