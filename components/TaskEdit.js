"use client";

import { PRIORITY_LABELS, PRIORITY_ORDER } from "@/lib/format";
import { ON_A_DATE, WhenField } from "@/components/TaskWhen";

/**
 * The form for changing a reminder, wherever you found it.
 *
 * It was written twice, once on the page that gathers every trip's reminders
 * and once on the tab that holds one trip's. Same five fields in the same
 * order, and the same three rules -- a date box that appears only when the
 * timing is an actual date, a person list that keeps somebody who has since
 * left the roster rather than silently reassigning their task, and a priority
 * list. The two copies had already parted company on their labels: one form's
 * boxes were called "What the reminder says" and "Anything worth remembering
 * with it", the other's said "Reminder" and "Detail", so the same field taught
 * you two different things depending on which door you came through.
 *
 * `people` is the list this task may be assigned to; a name not in it is added
 * at the bottom so the current assignee never disappears out of the control
 * that is supposed to be showing them.
 */
export default function TaskEdit({
  idPrefix,
  draft,
  onDraft,
  people = ["Shared"],
  onSubmit,
  onCancel,
  compact = false,
}) {
  if (!draft) return null;
  const set = (patch) => onDraft({ ...draft, ...patch });
  const btn = compact ? "px-3 py-1.5 text-xs" : "";
  return (
    <form
      className={
        compact
          ? "no-print mt-3 space-y-2 rounded-xl border border-[var(--line)] bg-sand/40 p-3"
          : "space-y-2"
      }
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        className="field"
        value={draft.title}
        aria-label="What the reminder says"
        placeholder="What the reminder says"
        onChange={(e) => set({ title: e.target.value })}
        required
      />
      <textarea
        className="field"
        rows={2}
        value={draft.detail || ""}
        aria-label="Note"
        placeholder="Anything worth remembering with it — a number, a link, what it is for"
        onChange={(e) => set({ detail: e.target.value })}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <div
          className={
            draft.timing === ON_A_DATE
              ? "grid gap-2 sm:grid-cols-2"
              : "grid gap-2"
          }
        >
          <WhenField
            idPrefix={idPrefix}
            timing={draft.timing}
            due={draft.due_date}
            onTiming={(value) =>
              set({
                timing: value,
                due_date: value === ON_A_DATE ? draft.due_date : "",
              })
            }
            onDue={(value) => set({ due_date: value })}
          />
        </div>
        <select
          className="field"
          value={draft.assignee}
          aria-label="Who it is down to"
          onChange={(e) => set({ assignee: e.target.value })}
        >
          {people.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {/* Somebody who is no longer on the roster is still who this is down
              to, and dropping them silently would be a reassignment nobody
              asked for. */}
          {!people.includes(draft.assignee) && (
            <option value={draft.assignee}>{draft.assignee}</option>
          )}
        </select>
        <select
          className="field"
          value={draft.priority}
          aria-label="Priority"
          onChange={(e) => set({ priority: e.target.value })}
        >
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button type="submit" className={`btn btn-primary ${btn}`}>
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={`btn btn-ghost ${btn}`}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
