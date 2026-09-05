"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PriorityMeter from "@/components/PriorityMeter";
import LastMinuteTasks from "@/components/LastMinuteTasks";
import FilterChips from "@/components/FilterChips";
import AddToCalendar from "@/components/AddToCalendar";
import { eventFromTask } from "@/lib/calendar";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TIMING_LABELS,
  TIMING_ORDER,
  assigneeColor,
  formatShortDay,
  priorityOf,
  priorityRank,
} from "@/lib/format";
import { dueWording, todayISO } from "@/lib/reminders";
import {
  DueChip,
  ON_A_DATE,
  WhenField,
  timingGroupOf,
  whenColumns,
} from "@/components/TaskWhen";

// readOnly is a secondary traveler: they see only the tasks assigned to them and
// may tick one off. Adding, rewording and removing come off the screen -- see the
// note in Packing.js for why an ungated button here would silently lie.
export default function Tasks({
  items,
  tripId,
  trip,
  travelers,
  userId,
  today: todayProp,
  onChange,
  readOnly = false,
}) {
  // Handed down from the server when there is one; worked out here otherwise, so
  // this still behaves if it is ever mounted somewhere that forgets to pass it.
  const today = todayProp || todayISO();
  const supabase = useMemo(() => createClient(), []);
  const [newTitle, setNewTitle] = useState("");
  const [newTiming, setNewTiming] = useState("now");
  const [newDue, setNewDue] = useState("");
  const [newAssignee, setNewAssignee] = useState("Shared");
  const [newPriority, setNewPriority] = useState("normal");
  // On by default. A pre-departure list is a list of what is still to do: the
  // completed rows are a record, and on a trip that has been planned for months
  // they are most of the page, so the ten things that still need doing open
  // below a wall of struck-through ones. Ticking a task now makes it leave the
  // list, which is the right feeling and reversible in one click.
  const [hideDone, setHideDone] = useState(true);
  // The row under the add form used to be a legend: the word Priority, then the
  // three meters and their names, explaining what the bars mean. It looked
  // exactly like the filter on the Reminders page one level up, so it got
  // pressed, and nothing happened. It filters now, and still says what the bars
  // mean by wearing one on each chip.
  const [priority, setPriority] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    title: "",
    detail: "",
    assignee: "Shared",
    timing: "now",
    priority: "normal",
    due_date: "",
  });

  // See the same fallback in Packing: names belong to the account, not the code.
  const people = travelers.length ? travelers : ["Shared"];

  // A finished task has no urgency left, so it neither jumps the queue nor keeps
  // its badge — it just sits where it was.
  const rank = (task) => (task.is_done ? 1 : priorityRank(task));

  // Priority is how you feel about a task. A due date that has arrived is not a
  // feeling, so late and imminent work climbs above it — but only that work, or
  // a date on everything would quietly replace the priority meter.
  const pressing = (task) => {
    if (task.is_done || !task.due_date) return 1;
    const word = dueWording(task.due_date, today);
    return word?.late || word?.soon ? 0 : 1;
  };

  const grouped = useMemo(() => {
    const map = new Map();
    items
      .filter((t) => (hideDone ? !t.is_done : true))
      .filter((t) => priority === "all" || priorityOf(t) === priority)
      .forEach((t) => {
        const key = timingGroupOf(t, trip, today);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(t);
      });
    // Inside a group the urgent ones come first, then everything normal, then
    // the ones that can wait. Anything level pegging stays in the order it was
    // already in.
    return TIMING_ORDER.filter((k) => map.has(k)).map((k) => [
      k,
      map
        .get(k)
        .map((t, i) => [t, i])
        .sort(
          (a, b) =>
            pressing(a[0]) - pressing(b[0]) ||
            // Among the pressing ones, the earliest date first.
            (pressing(a[0]) === 0
              ? String(a[0].due_date).localeCompare(String(b[0].due_date))
              : 0) ||
            rank(a[0]) - rank(b[0]) ||
            a[1] - b[1],
        )
        .map(([t]) => t),
    ]);
  }, [items, hideDone, priority, trip, today]);

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
      // A task with a date answered the question with a date, so the control
      // opens the way it was last answered.
      timing: task.due_date ? ON_A_DATE : task.timing || "now",
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
        ...whenColumns(editDraft.timing, editDraft.due_date, trip, today),
        priority: editDraft.priority,
      })
      .eq("id", editingId);
    setEditingId(null);
    onChange();
  }

  async function add(e) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if (newTiming === ON_A_DATE && !newDue) return;
    await supabase.from("predeparture_tasks").insert({
      trip_id: tripId,
      title: newTitle.trim(),
      ...whenColumns(newTiming, newDue, trip, today),
      assignee: newAssignee,
      priority: newPriority,
      sort_order: 999,
    });
    setNewTitle("");
    setNewDue("");
    onChange();
  }

  // Anything still open that can be pinned to a day, ready to hand to a calendar.
  const openEvents = useMemo(
    () =>
      items
        .filter((t) => !t.is_done)
        .map((t) => eventFromTask(t, trip))
        .filter(Boolean),
    [items, trip],
  );

  const done = items.filter((t) => t.is_done).length;
  const openHigh = items.filter(
    (t) => !t.is_done && priorityOf(t) === "high",
  ).length;
  const late = items.filter(
    (t) => !t.is_done && t.due_date && t.due_date < today,
  ).length;

  return (
    <section>
      {/* The same box the packing list carries, above the same list it is part of.
          It is not a filter on the piles below -- those still hold every task at
          every stage -- it is the short version, shut, for the morning when
          reading down forty rows is not going to happen. */}
      <LastMinuteTasks
        tasks={items}
        trip={trip}
        today={today}
        userId={userId}
        onChange={onChange}
        readOnly={readOnly}
        className="mb-4"
      />
      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-soft">
          {done} of {items.length} complete
          {late > 0 && (
            <span className="ml-2 chip bg-rose/15 text-rose">
              {late} past due
            </span>
          )}
          {openHigh > 0 && (
            <span className="ml-2 chip bg-rose/12 text-rose">
              {openHigh} high priority still open
            </span>
          )}
        </p>
        <div className="flex items-center gap-3">
          {openEvents.length > 0 && (
            <AddToCalendar
              compact
              events={openEvents}
              title={trip?.name ? `${trip.name} tasks` : "Trip tasks"}
            />
          )}
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
      </div>

      {!readOnly && (
        <form
          onSubmit={add}
          className={`card no-print mb-5 grid gap-2 p-4 ${
            newTiming === ON_A_DATE
              ? "sm:grid-cols-[1.8fr_1.15fr_1.15fr_1fr_1fr_auto]"
              : "sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
          }`}
        >
          <input
            className="field"
            placeholder="Add a task"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <WhenField
            idPrefix="new-task"
            timing={newTiming}
            due={newDue}
            onTiming={(value) => {
              setNewTiming(value);
              if (value !== ON_A_DATE) setNewDue("");
            }}
            onDue={setNewDue}
          />
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
      )}

      <div className="no-print mb-3 px-1">
        <FilterChips
          legend="Priority"
          value={priority}
          onChange={setPriority}
          options={[
            { id: "all", label: "All" },
            // High first, the way the list itself is ordered.
            ...PRIORITY_ORDER.map((p) => ({
              id: p,
              label: PRIORITY_LABELS[p],
              icon: <PriorityMeter task={{ priority: p }} className="mt-0" />,
            })),
          ]}
        />
      </div>

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
                        <WhenField
                          idPrefix={`edit-${task.id}`}
                          timing={editDraft.timing}
                          due={editDraft.due_date}
                          onTiming={(value) =>
                            setEditDraft({
                              ...editDraft,
                              timing: value,
                              due_date:
                                value === ON_A_DATE ? editDraft.due_date : "",
                            })
                          }
                          onDue={(value) =>
                            setEditDraft({ ...editDraft, due_date: value })
                          }
                        />
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
                    <PriorityMeter task={task} dim={task.is_done} />
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
                        {task.due_date && !task.is_done && (
                          <DueChip due={task.due_date} today={today} />
                        )}
                        {task.due_date && task.is_done && (
                          <span className="chip bg-sand-deep text-ink-soft">
                            Was due {formatShortDay(task.due_date)}
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
                      {!task.is_done && eventFromTask(task, trip) && (
                        <AddToCalendar
                          compact
                          event={eventFromTask(task, trip)}
                        />
                      )}
                      {!readOnly && (
                        <button
                          onClick={() => startEdit(task)}
                          className="text-xs font-bold uppercase tracking-wide text-teal transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                          aria-label={`Edit ${task.title}`}
                        >
                          Edit
                        </button>
                      )}
                      {!readOnly && (
                        <button
                          onClick={() => remove(task)}
                          className="text-xs font-semibold text-ink-soft/60 transition hover:text-rose sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                          aria-label={`Remove ${task.title}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="card p-6 text-center text-sm text-ink-soft">
            {items.length === 0
              ? "Nothing on the list yet."
              : priority !== "all"
                ? `Nothing ${PRIORITY_LABELS[priority].toLowerCase()} priority${
                    hideDone ? " is still open" : ""
                  }.`
                : hideDone
                  ? // Everything is done and hidden, so the page would otherwise
                    // be blank under a header saying 8 of 8 complete. Say where
                    // the rows went, and offer the way back to them.
                    "All clear — everything on this list is done."
                  : "All clear — no open tasks."}
            {priority !== "all" && (
              <button
                type="button"
                className="ml-2 font-semibold text-teal underline"
                onClick={() => setPriority("all")}
              >
                Show every priority
              </button>
            )}
            {priority === "all" && items.length > 0 && hideDone && done > 0 && (
              <button
                type="button"
                className="ml-2 font-semibold text-teal underline"
                onClick={() => setHideDone(false)}
              >
                Show the {done} completed
              </button>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
