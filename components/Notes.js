"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Notes({ items, tripId, userId, userName, onChange }) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: "", body: "" });

  async function add(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    await supabase.from("trip_notes").insert({
      trip_id: tripId,
      author_id: userId,
      author_name: userName,
      title: title.trim() || null,
      body: body.trim(),
    });
    setTitle("");
    setBody("");
    setBusy(false);
    onChange();
  }

  async function togglePin(note) {
    await supabase
      .from("trip_notes")
      .update({ pinned: !note.pinned })
      .eq("id", note.id);
    onChange();
  }

  async function remove(note) {
    if (!window.confirm("Delete this note?")) return;
    await supabase.from("trip_notes").delete().eq("id", note.id);
    onChange();
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditDraft({ title: note.title || "", body: note.body || "" });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editDraft.body.trim()) return;
    setBusy(true);
    await supabase
      .from("trip_notes")
      .update({
        title: editDraft.title.trim() || null,
        body: editDraft.body.trim(),
      })
      .eq("id", editingId);
    setBusy(false);
    setEditingId(null);
    onChange();
  }

  return (
    <section>
      <form onSubmit={add} className="card no-print mb-5 space-y-3 p-4">
        <input
          className="field"
          placeholder="Note title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="field"
          rows={3}
          placeholder="Share something with the family — a decision, a reminder, a link…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Posting…" : "Post note"}
        </button>
      </form>

      <div className="space-y-3">
        {items.map((note) =>
          editingId === note.id ? (
            <form
              key={note.id}
              onSubmit={saveEdit}
              className="card space-y-3 p-4 ring-1 ring-teal/30"
            >
              <p className="tabular text-[0.8rem] font-semibold text-teal">
                Editing this note
              </p>
              <input
                className="field"
                placeholder="Note title (optional)"
                value={editDraft.title}
                onChange={(e) =>
                  setEditDraft({ ...editDraft, title: e.target.value })
                }
              />
              <textarea
                className="field"
                rows={4}
                value={editDraft.body}
                onChange={(e) =>
                  setEditDraft({ ...editDraft, body: e.target.value })
                }
                required
              />
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <article key={note.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {note.title && (
                    <h3 className="font-display text-base font-semibold">
                      {note.title}
                    </h3>
                  )}
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                    {note.body}
                  </p>
                  <p className="mt-2 text-xs text-ink-soft/80">
                    {note.author_name || "Family"} ·{" "}
                    {new Date(note.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="no-print flex shrink-0 flex-col items-end gap-1">
                  <button
                    onClick={() => togglePin(note)}
                    className="text-xs font-semibold text-ink-soft hover:text-teal"
                  >
                    {note.pinned ? "📌 Pinned" : "Pin"}
                  </button>
                  <button
                    onClick={() => startEdit(note)}
                    className="text-xs font-bold uppercase tracking-wide text-teal"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(note)}
                    className="text-xs font-semibold text-ink-soft/60 hover:text-rose"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ),
        )}
        {items.length === 0 && (
          <p className="card p-6 text-center text-sm text-ink-soft">
            No notes yet.
          </p>
        )}
      </div>
    </section>
  );
}
