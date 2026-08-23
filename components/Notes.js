"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Notes({ items, tripId, userId, userName, onChange }) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

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
    await supabase.from("trip_notes").delete().eq("id", note.id);
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
        {items.map((note) => (
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
                  onClick={() => remove(note)}
                  className="text-xs font-semibold text-ink-soft/60 hover:text-rose"
                >
                  Delete
                </button>
              </div>
            </div>
          </article>
        ))}
        {items.length === 0 && (
          <p className="card p-6 text-center text-sm text-ink-soft">
            No notes yet.
          </p>
        )}
      </div>
    </section>
  );
}
