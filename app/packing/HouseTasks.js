"use client";

import { useState } from "react";
import { TIMING_LABELS, TIMING_ORDER } from "@/lib/format";

const SHARED = "Shared";

// The stages that make sense for something you do to a house. "Book now" and
// "before the trip" are about arranging things and belong on a real task, not on
// taking the bins out, so they are left off rather than offered and never used.
const WHEN = ["travel_day", "day_before", "week_before", "month_before"];

const EMPTY = {
  title: "",
  detail: "",
  timing: "travel_day",
  assignee: SHARED,
  only_when_empty: false,
};

/**
 * The household's departure list.
 *
 * Every other list on this screen decides what goes in the bags. This one decides
 * what happens to the house -- take the bins out, leave the dishwasher open, arm
 * the alarm -- and it lives here because this is the screen you have open at ten
 * at night with the cases half packed.
 *
 * It is stored as tasks rather than packing lines, which is why it looks like a
 * checklist and not like the templates below it. The reason is the morning email:
 * that email reads the pre-travel checklist and never reads the packing list, so
 * as packing rows these would be invisible on the one morning they exist for.
 */
export default function HouseTasks({ tasks: initial = [], people = [] }) {
  const [tasks, setTasks] = useState(initial);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [push, setPush] = useState(null);

  async function send(method, body, label) {
    setBusy(label);
    setError("");
    try {
      const res = await fetch("/api/house-tasks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setError(data?.error || "That did not save. Try again in a moment.");
        return null;
      }
      return data;
    } catch {
      setError("That did not save. Try again in a moment.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function add(form) {
    const data = await send("POST", form, "saving");
    if (!data?.task) return;
    setTasks((prev) => [...prev, data.task]);
    setDraft(null);
  }

  async function save(id, form) {
    const data = await send("PATCH", { id, ...form }, "saving");
    if (!data?.task) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
    setEditing(null);
  }

  async function remove(id) {
    const data = await send("DELETE", { id }, "removing");
    if (!data?.deleted) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setEditing(null);
  }

  // What the button would do, before it does it. A pass that writes onto every
  // upcoming trip is not one to run blind.
  async function ask(apply) {
    setBusy(apply ? "adding" : "looking");
    setError("");
    try {
      const res = await fetch("/api/house-tasks/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apply ? { apply: true } : {}),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setError(data?.error || "That did not work. Try again in a moment.");
        return;
      }
      setPush({ ...data, done: apply });
    } catch {
      setError("That did not work. Try again in a moment.");
    } finally {
      setBusy("");
    }
  }

  const chosen = editing ? tasks.find((t) => t.id === editing) : null;

  return (
    <section className="card mb-4 overflow-hidden">
      <div className="border-b border-[var(--line)] p-4">
        <h2 className="font-display text-lg font-semibold text-ink">
          Leaving the house
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          The things you do to the house on the way out, rather than the things
          that go in the bags. Every new trip gets this list on its pre-travel
          checklist, dated against that trip&rsquo;s own departure.
        </p>
      </div>

      {tasks.length === 0 ? (
        <p className="p-4 text-sm text-ink-soft">
          Nothing here yet. Take the bins out, leave the dishwasher open, arm the
          alarm &mdash; the things you would kick yourself for forgetting from a
          hundred miles away.
        </p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-start gap-3 border-b border-[var(--line)] p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug text-ink">{task.title}</p>
                {task.detail ? (
                  <p className="mt-0.5 text-sm text-ink-soft">{task.detail}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="chip bg-sand-deep text-ink-soft">
                    {TIMING_LABELS[task.timing] || TIMING_LABELS.travel_day}
                  </span>
                  {task.only_when_empty ? (
                    <span className="chip border border-amber/40 bg-amber/10 text-amber">
                      Only if nobody is home
                    </span>
                  ) : null}
                  {task.assignee && task.assignee !== SHARED ? (
                    <span className="chip bg-teal-soft text-teal">
                      {task.assignee}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm shrink-0"
                onClick={() => setEditing(editing === task.id ? null : task.id)}
              >
                {editing === task.id ? "Close" : "Edit"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen ? (
        <Form
          key={chosen.id}
          value={chosen}
          people={people}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(form) => save(chosen.id, form)}
          onDelete={() => remove(chosen.id)}
        />
      ) : null}

      {draft ? (
        <Form
          value={draft}
          people={people}
          busy={busy}
          onCancel={() => setDraft(null)}
          onSave={add}
        />
      ) : null}

      {!draft && !chosen ? (
        <div className="flex flex-wrap items-center gap-2 p-4">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setDraft({ ...EMPTY })}
          >
            Add a task
          </button>
          {tasks.length ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => ask(false)}
              disabled={!!busy}
            >
              {busy === "looking"
                ? "Looking…"
                : "Add these to trips already planned"}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="border-t border-[var(--line)] px-4 py-3 text-sm text-rose">
          {error}
        </p>
      ) : null}

      {push ? (
        <PushPanel
          push={push}
          busy={busy}
          onApply={() => ask(true)}
          onClose={() => setPush(null)}
        />
      ) : null}
    </section>
  );
}

function Form({ value, people, busy, onCancel, onSave, onDelete }) {
  const [form, setForm] = useState({ ...EMPTY, ...value });
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  return (
    <div className="border-t border-[var(--line)] bg-sand/40 p-4">
      <label className="section-label block" htmlFor="house-title">
        What needs doing
      </label>
      <input
        id="house-title"
        className="field mt-1"
        value={form.title}
        onChange={(e) => set({ title: e.target.value })}
        placeholder="Take the trash and recycling out"
      />
      <label className="section-label mt-3 block" htmlFor="house-detail">
        Anything else worth remembering
      </label>
      <input
        id="house-detail"
        className="field mt-1"
        value={form.detail || ""}
        onChange={(e) => set({ detail: e.target.value })}
        placeholder="Which bin, which app, the code"
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="section-label block" htmlFor="house-when">
            When
          </label>
          <select
            id="house-when"
            className="field mt-1"
            value={form.timing}
            onChange={(e) => set({ timing: e.target.value })}
          >
            {TIMING_ORDER.filter((t) => WHEN.includes(t)).map((t) => (
              <option key={t} value={t}>
                {TIMING_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="section-label block" htmlFor="house-who">
            Whose job
          </label>
          <select
            id="house-who"
            className="field mt-1"
            value={form.assignee}
            onChange={(e) => set({ assignee: e.target.value })}
          >
            <option value={SHARED}>{SHARED}</option>
            {people.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-teal"
          checked={form.only_when_empty === true}
          onChange={(e) => set({ only_when_empty: e.target.checked })}
        />
        <span className="text-ink">
          Only when nobody is home
          <span className="mt-0.5 block text-ink-soft">
            Skipped on a trip where somebody in the family is staying behind.
            Arming the alarm or holding the mail with a child in the house is
            worse than not asking.
          </span>
        </span>
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!!busy || !form.title.trim()}
          onClick={() => onSave(form)}
        >
          {busy === "saving" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={!!busy}
        >
          Cancel
        </button>
        {onDelete ? (
          <button
            type="button"
            className="btn btn-ghost ml-auto text-rose"
            onClick={onDelete}
            disabled={!!busy}
          >
            {busy === "removing" ? "Removing…" : "Remove from the list"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What pushing onto existing trips would do, trip by trip.
 *
 * The skipped lines are the point of the panel. A task that quietly fails to
 * appear is a bug the family finds out about from a neighbor; a task that says
 * "skipped, Veda is home" is a decision they can disagree with.
 */
function PushPanel({ push, busy, onApply, onClose }) {
  const rows = (push.trips || []).filter(
    (t) => t.adds.length || t.skipped.length,
  );
  const total = push.totals?.adds || 0;
  const trips = push.totals?.trips || 0;
  return (
    <div className="border-t border-[var(--line)] bg-sand/40 p-4">
      <p className="text-sm font-semibold text-ink">
        {push.done
          ? push.applied?.adds
            ? `Added ${push.applied.adds} ${push.applied.adds === 1 ? "task" : "tasks"} across your upcoming trips.`
            : "Nothing to add — every upcoming trip already has these."
          : total
            ? `This would add ${total} ${total === 1 ? "task" : "tasks"} to ${trips} ${trips === 1 ? "trip" : "trips"}.`
            : "Every upcoming trip already has these."}
      </p>
      {rows.length ? (
        <ul className="mt-3 space-y-2">
          {rows.map((trip) => (
            <li key={trip.id} className="text-sm text-ink">
              <span className="font-semibold">{trip.name}</span>
              {trip.adds.length ? (
                <span className="text-ink-soft"> &mdash; {trip.adds.join(", ")}</span>
              ) : null}
              {trip.already ? (
                <span className="text-ink-soft">
                  {trip.adds.length ? "; " : " \u2014 "}
                  {trip.already} already there
                </span>
              ) : null}
              {trip.skipped.length ? (
                <span className="mt-0.5 block text-amber">
                  Skipped: {trip.skipped.join(", ")} &mdash;{" "}
                  {trip.staying?.length
                    ? `${trip.staying.join(" and ")} ${trip.staying.length === 1 ? "is" : "are"} home`
                    : "somebody is home"}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!push.done && total ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onApply}
            disabled={!!busy}
          >
            {busy === "adding" ? "Adding…" : "Add them"}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {push.done ? "Close" : "Never mind"}
        </button>
      </div>
    </div>
  );
}
