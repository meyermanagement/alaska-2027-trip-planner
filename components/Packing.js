"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { assigneeColor } from "@/lib/format";
import ProTips from "./ProTips";

export default function Packing({
  items,
  tripId,
  travelers,
  userId,
  onChange,
  templates = [],
  tips = [],
  today,
  everLooked = false,
}) {
  const supabase = useMemo(() => createClient(), []);
  const [who, setWho] = useState("all");
  const [hidePacked, setHidePacked] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newAssignee, setNewAssignee] = useState("Shared");
  const [editingId, setEditingId] = useState(null);
  // Sending the item being edited to a packing template. Held per item so the
  // message stays attached to the row it belongs to, and cleared when another
  // row is opened.
  const base = templates.find((t) => t.is_base) || templates[0] || null;
  const [templateId, setTemplateId] = useState(base?.id || "");
  const [toTemplate, setToTemplate] = useState(null);
  const [editDraft, setEditDraft] = useState({
    item: "",
    category: "",
    assignee: "Shared",
    quantity: "",
    notes: "",
  });

  const people = travelers.length
    ? travelers
    : ["Mark", "Steph", "Veda", "Shared"];

  const categories = useMemo(() => {
    const list = Array.from(new Set(items.map((i) => i.category)));
    return list.sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visible = items.filter((i) => {
    if (
      who !== "all" &&
      !(i.assignee || "").toLowerCase().includes(who.toLowerCase())
    )
      return false;
    if (hidePacked && i.is_packed) return false;
    return true;
  });

  const grouped = useMemo(() => {
    const map = new Map();
    visible.forEach((i) => {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category).push(i);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  async function toggle(item) {
    await supabase
      .from("packing_items")
      .update({
        is_packed: !item.is_packed,
        packed_by: item.is_packed ? null : userId,
        packed_at: item.is_packed ? null : new Date().toISOString(),
      })
      .eq("id", item.id);
    onChange();
  }

  async function remove(item) {
    if (!window.confirm(`Remove “${item.item}” from the list?`)) return;
    await supabase.from("packing_items").delete().eq("id", item.id);
    onChange();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setToTemplate(null);
    setEditDraft({
      item: item.item || "",
      category: item.category || "",
      assignee: item.assignee || "Shared",
      quantity: item.quantity || "",
      notes: item.notes || "",
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editDraft.item.trim()) return;
    await supabase
      .from("packing_items")
      .update({
        item: editDraft.item.trim(),
        category: (editDraft.category || "General").trim(),
        assignee: editDraft.assignee,
        quantity: editDraft.quantity.trim() || null,
        notes: editDraft.notes.trim() || null,
      })
      .eq("id", editingId);
    setEditingId(null);
    onChange();
  }

  /**
   * Put the item being edited on a packing template as well.
   *
   * Things are invented while packing for a real trip — that is when you notice
   * the thing you always forget — and until now the only way to keep one was to
   * remember it, walk to the Packing templates screen, and type it again. The
   * edits on screen are saved first so what lands on the template is what is
   * being looked at rather than what was there when the form opened.
   *
   * The trip's own copy stays exactly where it is. Nothing about this trip
   * changes, and neither does any trip that already exists: a template is only
   * read when a new trip is built.
   */
  async function alsoAddToTemplate() {
    const chosen = templates.find((t) => t.id === templateId);
    const name = editDraft.item.trim();
    if (!chosen || !name) return;
    setToTemplate({ state: "saving" });

    const patch = {
      item: name,
      category: (editDraft.category || "General").trim(),
      assignee: editDraft.assignee,
      quantity: editDraft.quantity.trim() || null,
      notes: editDraft.notes.trim() || null,
    };
    const { error: editError } = await supabase
      .from("packing_items")
      .update(patch)
      .eq("id", editingId);
    if (editError) {
      setToTemplate({ state: "error", message: "That did not save." });
      return;
    }

    // Already on that template, by name and person? Say so rather than adding a
    // second one — a template with the same thing twice on it quietly puts it on
    // every future trip twice.
    const { data: already } = await supabase
      .from("packing_template_items")
      .select("id")
      .eq("template_id", chosen.id)
      .ilike("item", name)
      .eq("assignee", patch.assignee)
      .limit(1);
    if (already && already.length) {
      setToTemplate({
        state: "done",
        message: `Already on ${chosen.name} for ${patch.assignee}.`,
      });
      onChange();
      return;
    }

    const { error } = await supabase.from("packing_template_items").insert({
      template_id: chosen.id,
      item: name,
      category: patch.category,
      assignee: patch.assignee,
      quantity: patch.quantity,
      sort_order: 999,
      created_by: userId,
    });
    setToTemplate(
      error
        ? { state: "error", message: "That did not save to the template." }
        : {
            state: "done",
            message: `Added to ${chosen.name}. Trips you create from now on will start with it.`,
          },
    );
    onChange();
  }

  async function add(e) {
    e.preventDefault();
    if (!newItem.trim()) return;
    await supabase.from("packing_items").insert({
      trip_id: tripId,
      item: newItem.trim(),
      category: (newCategory || "General").trim(),
      assignee: newAssignee,
      sort_order: 999,
    });
    setNewItem("");
    onChange();
  }

  const packed = items.filter((i) => i.is_packed).length;
  const pct = items.length ? Math.round((packed / items.length) * 100) : 0;

  return (
    <section>
      {/* Above the progress bar, because the point of a packing tip is to be read
          before the list is worked through rather than after. */}
      <ProTips
        tips={tips}
        today={today}
        tripId={tripId}
        scope="packing"
        everLooked={everLooked}
        heading="Before you pack"
      />
      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>
            {packed} of {items.length} packed
          </span>
          <span className="text-teal">{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand-deep">
          <div
            className="h-full rounded-full bg-teal transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setWho("all")}
          className={`chip border ${
            who === "all"
              ? "border-teal bg-teal text-white"
              : "border-[var(--line)] bg-white text-ink-soft"
          }`}
        >
          Everyone
        </button>
        {people.map((p) => (
          <button
            key={p}
            onClick={() => setWho(p)}
            className={`chip border ${
              who === p
                ? "border-teal bg-teal text-white"
                : "border-[var(--line)] bg-white text-ink-soft"
            }`}
          >
            {p}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal"
            checked={hidePacked}
            onChange={(e) => setHidePacked(e.target.checked)}
          />
          Hide packed
        </label>
      </div>

      <p className="no-print mb-4 text-xs text-ink-soft">
        This list started from the family&rsquo;s packing templates. Changes
        here stay on this trip &mdash;{" "}
        <Link
          href="/packing"
          className="font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
        >
          edit the packing templates
        </Link>{" "}
        to change what every future trip starts with.
      </p>

      <form
        onSubmit={add}
        className="card no-print mb-5 grid gap-2 p-4 sm:grid-cols-[2fr_1fr_auto_auto]"
      >
        <input
          className="field"
          placeholder="Add an item"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
        />
        <input
          className="field"
          placeholder="Category"
          list="packing-categories"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
        />
        <datalist id="packing-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
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
        {grouped.map(([category, rows]) => (
          <div key={category} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--line)] bg-sand/60 px-4 py-2.5">
              <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                {category}
              </h3>
              <span className="text-xs font-semibold text-ink-soft">
                {rows.filter((r) => r.is_packed).length}/{rows.length}
              </span>
            </div>
            <ul>
              {rows.map((item) =>
                editingId === item.id ? (
                  <li
                    key={item.id}
                    className="border-b border-sand/80 bg-teal/5 px-4 py-3 last:border-0"
                  >
                    <form onSubmit={saveEdit} className="space-y-2">
                      <input
                        className="field"
                        placeholder="Item"
                        value={editDraft.item}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, item: e.target.value })
                        }
                        required
                      />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <input
                          className="field"
                          placeholder="Category"
                          list="packing-categories"
                          value={editDraft.category}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              category: e.target.value,
                            })
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
                        <input
                          className="field"
                          placeholder="Quantity"
                          value={editDraft.quantity}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              quantity: e.target.value,
                            })
                          }
                        />
                      </div>
                      <input
                        className="field"
                        placeholder="Notes"
                        value={editDraft.notes}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, notes: e.target.value })
                        }
                      />
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
                      {templates.length > 0 && (
                        <div className="border-t border-sand pt-2">
                          <label
                            className="text-xs font-semibold text-ink-soft"
                            htmlFor="packing-to-template"
                          >
                            Keep this for future trips
                          </label>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <select
                              id="packing-to-template"
                              className="field text-sm"
                              style={{ width: "auto", maxWidth: "100%" }}
                              value={templateId}
                              onChange={(e) => {
                                setTemplateId(e.target.value);
                                setToTemplate(null);
                              }}
                            >
                              {templates.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                  {t.is_base ? " (base)" : ""}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-ghost whitespace-nowrap text-sm"
                              onClick={alsoAddToTemplate}
                              disabled={
                                toTemplate?.state === "saving" ||
                                !editDraft.item.trim()
                              }
                            >
                              {toTemplate?.state === "saving"
                                ? "Adding\u2026"
                                : "Add to packing template"}
                            </button>
                          </div>
                          <p
                            className={`mt-1.5 text-xs ${
                              toTemplate?.state === "error"
                                ? "text-rose"
                                : "text-ink-soft"
                            }`}
                          >
                            {toTemplate?.message ||
                              "Saves your edits and puts this on the chosen template as well. Trips that already exist are left alone."}
                          </p>
                        </div>
                      )}
                    </form>
                  </li>
                ) : (
                  <li
                    key={item.id}
                    className="group flex items-start gap-3 border-b border-sand/80 px-4 py-2.5 last:border-0"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5 shrink-0 accent-teal"
                      checked={item.is_packed}
                      onChange={() => toggle(item)}
                      aria-label={`Mark ${item.item} packed`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm ${item.is_packed ? "strike-done" : ""}`}
                        >
                          {item.item}
                          {item.quantity ? (
                            <span className="text-ink-soft">
                              {" "}
                              ×{item.quantity}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`chip ${assigneeColor(item.assignee)}`}
                        >
                          {item.assignee}
                        </span>
                      </div>
                      {item.notes && (
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {item.notes}
                        </p>
                      )}
                    </div>
                    <div className="no-print flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => startEdit(item)}
                        className="text-xs font-bold uppercase tracking-wide text-teal transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                        aria-label={`Edit ${item.item}`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(item)}
                        className="text-xs font-semibold text-ink-soft/60 transition hover:text-rose sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                        aria-label={`Remove ${item.item}`}
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
            Nothing left in this view. Nice work.
          </p>
        )}
      </div>
    </section>
  );
}
