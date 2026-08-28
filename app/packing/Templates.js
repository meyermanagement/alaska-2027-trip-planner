"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { assigneeColor } from "@/lib/format";

const SHARED = "Shared";

/** "Veda's list", but "the shared list" — nobody says "Shared's list". */
function whosePhrase(person) {
  return person === SHARED ? "the shared list" : `${person}\u2019s list`;
}
const EMPTY_DRAFT = { item: "", category: "", quantity: "", assignee: SHARED };

/**
 * The packing templates, arranged by who packs what rather than by
 * category. A trip's own list is grouped by category, because when you are
 * standing over an open suitcase you want all the toiletries together; here the
 * question being asked is a different one — "what does Veda always take?" — so
 * the person comes first and the category is a heading inside their list.
 *
 * Anyone with items but no longer on the travelers list still gets a section, so
 * a name nobody uses any more can be corrected instead of being invisible.
 */
export default function Templates({ travelers, templates, items }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const base = templates.find((t) => t.is_base) || templates[0] || null;
  const [templateId, setTemplateId] = useState(base?.id || null);
  const [who, setWho] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);
  const [adding, setAdding] = useState(null);
  const [addDraft, setAddDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const template = templates.find((t) => t.id === templateId) || null;
  const mine = useMemo(
    () => items.filter((i) => i.template_id === templateId),
    [items, templateId],
  );

  const known = travelers.length ? travelers : ["Mark", "Steph", "Veda"];
  // Everyone who could own an item: the family, Shared, and any leftover name
  // still attached to something in this list.
  const people = useMemo(() => {
    const list = [...known, SHARED];
    mine.forEach((i) => {
      if (i.assignee && !list.includes(i.assignee)) list.push(i.assignee);
    });
    return list;
  }, [known, mine]);

  const countFor = (person) =>
    mine.filter((i) => (i.assignee || SHARED) === person).length;

  const categories = useMemo(
    () =>
      Array.from(new Set(mine.map((i) => i.category).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [mine],
  );

  // Person → category → items, in the order the people are listed rather than
  // alphabetically, so the family reads the way it does everywhere else.
  const sections = useMemo(() => {
    const shown = who === "all" ? people : [who];
    return shown.map((person) => {
      const rows = mine.filter((i) => (i.assignee || SHARED) === person);
      const byCategory = new Map();
      rows.forEach((i) => {
        const key = i.category || "General";
        if (!byCategory.has(key)) byCategory.set(key, []);
        byCategory.get(key).push(i);
      });
      return {
        person,
        count: rows.length,
        stray: !known.includes(person) && person !== SHARED,
        groups: Array.from(byCategory.entries()).sort((a, b) =>
          a[0].localeCompare(b[0]),
        ),
      };
    });
  }, [mine, people, who, known]);

  const nextSort = () =>
    mine.reduce((max, i) => Math.max(max, i.sort_order || 0), 0) + 1;

  async function run(work) {
    setBusy(true);
    setError("");
    const { error: problem } = await work();
    setBusy(false);
    if (problem) {
      setError(problem.message);
      return false;
    }
    router.refresh();
    return true;
  }

  function startAdd(person) {
    setAdding(person);
    setEditingId(null);
    setAddDraft({ ...EMPTY_DRAFT, assignee: person });
  }

  async function submitAdd(e) {
    e.preventDefault();
    if (!addDraft.item.trim() || !templateId) return;
    const ok = await run(() =>
      supabase.from("packing_template_items").insert({
        template_id: templateId,
        item: addDraft.item.trim(),
        category: addDraft.category.trim() || "General",
        assignee: addDraft.assignee,
        quantity: addDraft.quantity.trim() || null,
        sort_order: nextSort(),
      }),
    );
    // Left open on purpose: adding to a packing template is usually adding several.
    if (ok) setAddDraft({ ...EMPTY_DRAFT, assignee: addDraft.assignee });
  }

  function startEdit(row) {
    setAdding(null);
    setEditingId(row.id);
    setEditDraft({
      item: row.item || "",
      category: row.category || "",
      quantity: row.quantity || "",
      assignee: row.assignee || SHARED,
    });
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!editDraft.item.trim()) return;
    const ok = await run(() =>
      supabase
        .from("packing_template_items")
        .update({
          item: editDraft.item.trim(),
          category: editDraft.category.trim() || "General",
          assignee: editDraft.assignee,
          quantity: editDraft.quantity.trim() || null,
        })
        .eq("id", editingId),
    );
    if (ok) setEditingId(null);
  }

  async function remove(row) {
    if (!window.confirm(`Take “${row.item}” off the packing template?`)) return;
    await run(() =>
      supabase.from("packing_template_items").delete().eq("id", row.id),
    );
  }

  // Starting a new person off with a copy of somebody else's list, which is what
  // an empty section almost always wants.
  async function copyFrom(person, from) {
    const rows = mine
      .filter((i) => (i.assignee || SHARED) === from)
      .map((i, n) => ({
        template_id: templateId,
        item: i.item,
        category: i.category,
        assignee: person,
        quantity: i.quantity,
        sort_order: nextSort() + n,
      }));
    if (!rows.length) return;
    if (
      !window.confirm(
        `Copy all ${rows.length} of ${from}’s items onto ${person}’s list?`,
      )
    )
      return;
    await run(() => supabase.from("packing_template_items").insert(rows));
  }

  if (!template) {
    return (
      <p className="card p-6 text-center text-sm text-ink-soft">
        There are no packing templates saved yet. Create a trip and Aly will
        build one, or ask her to start a packing template for the family.
      </p>
    );
  }

  return (
    <section>
      {templates.length > 1 && (
        <div className="no-print mb-4 flex flex-wrap gap-2">
          {templates.map((t) => {
            const on = t.id === templateId;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTemplateId(t.id);
                  setWho("all");
                  setEditingId(null);
                  setAdding(null);
                }}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                  on
                    ? "border-teal bg-teal-soft/50"
                    : "border-[var(--line)] bg-white hover:border-teal/40"
                }`}
              >
                <span className="block font-semibold">{t.name}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  {t.is_base ? "Every trip starts here" : "Added on top"} ·{" "}
                  {items.filter((i) => i.template_id === t.id).length} items
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="card mb-4 p-4">
        <h2 className="font-display text-lg font-semibold">{template.name}</h2>
        {template.description && (
          <p className="mt-1 text-sm text-ink-soft">{template.description}</p>
        )}
        {mine.length === 0 && (
          <p className="mt-2 text-sm text-ink-soft">
            {template.is_base
              ? "This list is empty, so new trips start with nothing packed. Add what the family always takes and every trip from here on begins with it."
              : "This add-on is empty. Put the gear here that only suits one kind of trip \u2014 cold-weather layers, snorkeling kit \u2014 and keep the base list to what travels everywhere."}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setWho("all")}
            className={`chip border ${
              who === "all"
                ? "border-teal bg-teal text-white"
                : "border-[var(--line)] bg-white text-ink-soft"
            }`}
          >
            Everyone · {mine.length}
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
              {p} · {countFor(p)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">
          {error}
        </p>
      )}

      <datalist id="template-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.person} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)] bg-sand/60 px-4 py-2.5">
              <span className={`chip ${assigneeColor(section.person)}`}>
                {section.person}
              </span>
              <span className="text-xs font-semibold text-ink-soft">
                {section.count} {section.count === 1 ? "item" : "items"}
              </span>
              {section.stray && (
                <span className="text-xs text-ink-soft">
                  Not on the Family tab — reassign these to fold them in.
                </span>
              )}
              <button
                onClick={() => startAdd(section.person)}
                className="no-print ml-auto text-xs font-bold uppercase tracking-wide text-teal"
              >
                + Add
              </button>
            </div>

            {adding === section.person && (
              <form
                onSubmit={submitAdd}
                className="no-print grid grid-cols-2 gap-2 border-b border-[var(--line)] bg-teal/5 px-4 py-3 sm:grid-cols-[2fr_1fr_5rem_auto_auto]"
              >
                <input
                  className="field col-span-2 sm:col-span-1"
                  placeholder={`What ${section.person} always takes`}
                  value={addDraft.item}
                  onChange={(e) =>
                    setAddDraft({ ...addDraft, item: e.target.value })
                  }
                  autoFocus
                  required
                />
                <input
                  className="field"
                  placeholder="Category"
                  list="template-categories"
                  value={addDraft.category}
                  onChange={(e) =>
                    setAddDraft({ ...addDraft, category: e.target.value })
                  }
                />
                <input
                  className="field"
                  placeholder="Qty"
                  value={addDraft.quantity}
                  onChange={(e) =>
                    setAddDraft({ ...addDraft, quantity: e.target.value })
                  }
                />
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Add"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setAdding(null)}
                >
                  Done
                </button>
              </form>
            )}

            {section.count === 0 ? (
              <div className="px-4 py-4 text-sm text-ink-soft">
                <p>Nothing on {whosePhrase(section.person)} yet.</p>
                {people.filter((p) => p !== section.person && countFor(p) > 0)
                  .length > 0 && (
                  <p className="no-print mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs">Start from someone else:</span>
                    {people
                      .filter((p) => p !== section.person && countFor(p) > 0)
                      .map((p) => (
                        <button
                          key={p}
                          onClick={() => copyFrom(section.person, p)}
                          disabled={busy}
                          className="chip border border-[var(--line)] bg-white text-ink-soft hover:border-teal/40 hover:text-teal"
                        >
                          Copy {countFor(p)} from {p}
                        </button>
                      ))}
                  </p>
                )}
              </div>
            ) : (
              section.groups.map(([category, rows]) => (
                <div key={category}>
                  <h3 className="bg-white px-4 pb-1 pt-3 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                    {category}
                  </h3>
                  <ul>
                    {rows.map((row) =>
                      editingId === row.id ? (
                        <li
                          key={row.id}
                          className="border-b border-sand/80 bg-teal/5 px-4 py-3 last:border-0"
                        >
                          <form onSubmit={submitEdit} className="space-y-2">
                            <input
                              className="field"
                              value={editDraft.item}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  item: e.target.value,
                                })
                              }
                              required
                            />
                            <div className="grid gap-2 sm:grid-cols-3">
                              <label className="block">
                                <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                                  Category
                                </span>
                                <input
                                  className="field"
                                  placeholder="Category"
                                  list="template-categories"
                                  value={editDraft.category}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      category: e.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                                  Who packs it
                                </span>
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
                                </select>
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                                  Quantity
                                </span>
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
                              </label>
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="btn btn-primary"
                                disabled={busy}
                              >
                                {busy ? "Saving…" : "Save"}
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
                        </li>
                      ) : (
                        <li
                          key={row.id}
                          className="group flex items-center gap-3 border-b border-sand/80 px-4 py-2.5 last:border-0"
                        >
                          <span className="min-w-0 flex-1 text-sm">
                            {row.item}
                            {row.quantity ? (
                              <span className="text-ink-soft">
                                {" "}
                                ×{row.quantity}
                              </span>
                            ) : null}
                          </span>
                          <div className="no-print flex shrink-0 items-center gap-2">
                            <button
                              onClick={() => startEdit(row)}
                              className="text-xs font-bold uppercase tracking-wide text-teal transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                              aria-label={`Edit ${row.item}`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => remove(row)}
                              className="text-xs font-semibold text-ink-soft/60 transition hover:text-rose sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                              aria-label={`Remove ${row.item}`}
                            >
                              ✕
                            </button>
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
