"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TIMING_LABELS,
  TIMING_ORDER,
  assigneeColor,
  formatShortDay,
  priorityChip,
  priorityOf,
  priorityRank,
} from "@/lib/format";

export default function Tasks({ items, tripId, travelers, userId, onChange }) {
  const supabase = useMemo(() => createClient(), []);
  const [newTitle, setNewTitle] = useState("");
  const [newTiming, setNewTiming] = useState("now");
  const [newAssignee, setNewAssignee] = useState("Shared");
  const [newPriority, setNewPriority] = useState("normal");
  const [hideDone, setHideDone] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    title: "",
    detail: "",
    assignee: "Shared",
    timing: "now",
    priority: "normal",
    due_date: "",
  });

  const people = travelers.length
    ? travelers
    : ["Mark", "Steph", "Veda", "Shared"];

  // A finished task has no urgency left, so it neither jumps the queue nor keeps
  // its badge — it just sits where it was.
  const rank = (task) => (task.is_done ? 1 : priorityRank(task));

  const grouped = useMemo(() => {
    const map = new Map();
    items
      .filter((t) => (hideDone ? !t.is_done : true))
      .forEach((t) => {
        if (!map.has(t.timing)) map.set(t.timing, []);
        map.get(t.timing).push(t);
      });
    // Inside a group the urgent ones come first, then everything normal, then
    // the ones that can wait. Anything level pegging stays in the order it was
    // already in.
    return TIMING_ORDER.filter((k) => map.has(k)).map((k) => [
      k,
      map
        .get(k)
        .map((t, i) => [t, i])
        .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
        .map(([t]) => t),
    ]);
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
    if (!window.confirm(`Delete the task “${task.title}”?`)) return;
    await supabase.from("predeparture_tasks").delete().eq("id", task.id);
    onChange();
  }

  function startEdit(task) {
    setEditingId(task.id);
    setEditDraft({
      title: task.title || "",
      detail: task.detail || "",
      assignee: task.assignee || "Shared",
      timing: task.timing || "now",
      priority: priorityOf(task),
      due_date: task.due_date || "",
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editDraft.title.trim()) return;
    await supabase
      .from("predeparture_tasks")
      .update({
        title: editDraft.title.trim(),
        detail: editDraft.detail.trim() || null,
        assignee: editDraft.assignee,
        timing: editDraft.timing,
        priority: editDraft.priority,
        due_date: editDraft.due_date || null,
      })
      .eq("id", editingId);
    setEditingId(null);
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
      priority: newPriority,
      sort_order: 999,
    });
    setNewTitle("");
    onChange();
  }

  const done = items.filter((t) => t.is_done).length;
  const openHigh = items.filter(
    (t) => !t.is_done && priorityOf(t) === "high",
  ).length;

  return (
    <section>
      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-soft">
          {done} of {items.length} complete
          {openHigh > 0 && (
            <span className="ml-2 chip bg-rose/12 text-rose">
              {openHigh} high priority still open
            </span>
          )}
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
        className="card no-print mb-5 grid gap-2 p-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
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
        <select
          className="field"
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value)}
          aria-label="Priority"
        >
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <button className="btn btn-primary">Add</button>
      </form>

      <div className="space-y-4">
        {grouped.map(([timing, rows]) => (
          <div key={timing} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--line)] bg-sand/60 px-4 py-2.5">
              <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                {TIMING_LABELS[timing]}
              </h3>
              <span className="text-xs font-semibold text-ink-soft">
                {rows.filter((r) => r.is_done).length}/{rows.length}
              </span>
            </div>
            <ul>
              {rows.map((task) =>
                editingId === task.id ? (
                  <li
                    key={task.id}
                    className="border-b border-sand/80 bg-teal/5 px-4 py-3 last:border-0"
                  >
                    <form onSubmit={saveEdit} className="space-y-2">
                      <input
                        className="field"
                        placeholder="Task"
                        value={editDraft.title}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, title: e.target.value })
                        }
                        required
                      />
                      <textarea
                        className="field"
                        rows={2}
                        placeholder="Detail"
                        value={editDraft.detail}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, detail: e.target.value })
                        }
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          className="field"
                          value={editDraft.timing}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              timing: e.target.value,
                            })
                          }
                        >
                          {TIMING_ORDER.map((t) => (
                            <option key={t} value={t}>
                              {TIMING_LABELS[t]}
                            </option>
                          ))}
                        </select>
                        <select
                          className="field"
                          value={editDraft.assignee}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              assignee: e.target.value,
                            })
                          }
                        >
                          {people.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                          {!people.includes(editDraft.assignee) && (
                            <option value={editDraft.assignee}>
                              {editDraft.assignee}
                            </option>
                          )}
                        </select>
                        <select
                          className="field"
                          value={editDraft.priority}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              priority: e.target.value,
                            })
                          }
                          aria-label="Priority"
                        >
                          {PRIORITY_ORDER.map((p) => (
                            <option key={p} value={p}>
                              {PRIORITY_LABELS[p]}
                            </option>
                          ))}
                        </select>
                        <input
                          className="field"
                          type="date"
                          value={editDraft.due_date}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              due_date: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <button className="btn btn-primary">Save</button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </li>
                ) : (
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
                        <span
                          className={`chip ${assigneeColor(task.assignee)}`}
                        >
                          {task.assignee}
                        </span>
                        <span className={`chip ${priorityChip(task).cls}`}>
                          <span
                            aria-hidden="true"
                            className="mr-1 text-[0.6rem]"
                          >
                            {priorityChip(task).mark}
                          </span>
                          {priorityChip(task).label}
                        </span>
                        {task.due_date && (
                          <span className="chip bg-amber/15 text-amber">
                            Due {formatShortDay(task.due_date)}
                          </span>
                        )}
                        {task.itinerary_item_id && (
                          <span className="chip bg-teal-soft text-teal">
                            From the itinerary
                          </span>
                        )}
                      </div>
                      {task.detail && (
                        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                          {task.detail}
                        </p>
                      )}
                    </div>
                    <div className="no-print flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => startEdit(task)}
                        className="text-xs font-bold uppercase tracking-wide text-teal transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                        aria-label={`Edit ${task.title}`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(task)}
                        className="text-xs font-semibold text-ink-soft/60 transition hover:text-rose sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                        aria-label={`Remove ${task.title}`}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ),
              )}
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
