"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { assigneeColor } from "@/lib/format";
import { matchesQuery } from "@/lib/packing/find";
import { LAST_MINUTE_LABEL } from "@/lib/packing/lastMinute";
import PropagatePanel from "@/components/PropagatePanel";
import TripsUsing from "@/components/TripsUsing";
import FirstTemplate from "@/components/FirstTemplate";
import { ASK_ALY_EVENT } from "@/components/AskAlyTrigger";
import { TEMPLATES_FOCUS } from "@/lib/agent/context";
import { blankRequest, proposeRequest } from "@/lib/packing/newTemplate";

const SHARED = "Shared";

/** "Veda's list", but "the shared list" — nobody says "Shared's list". */
function whosePhrase(person) {
  return person === SHARED ? "the shared list" : `${person}\u2019s list`;
}
const EMPTY_DRAFT = {
  item: "",
  category: "",
  quantity: "",
  assignee: SHARED,
  lastMinute: false,
};

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
export default function Templates({
  travelers,
  templates,
  items,
  // { [templateId]: [{ id, name, start_date, href, draft }] } -- the upcoming
  // trips each list reaches, worked out on the server by the same rule the push
  // button uses.
  tripsByTemplate = {},
  // Trips with a packing list of their own, offered as the source for a first
  // template. Only read when there are no templates at all.
  packedTrips = [],
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const base = templates.find((t) => t.is_base) || templates[0] || null;
  const [templateId, setTemplateId] = useState(base?.id || null);
  const [who, setWho] = useState("all");
  // The same two ways of looking the trip's own list now has. A base template
  // of seventy-four lines has exactly the trip list's problem: the fastest way
  // to find out whether the sunscreen is already on it was to read the whole
  // thing. Spelling is forgiven -- see lib/packing/find.
  const [find, setFind] = useState("");
  const [onlyCategory, setOnlyCategory] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);
  const [adding, setAdding] = useState(null);
  const [addDraft, setAddDraft] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Renaming the list itself. A name is the only part of a template you cannot
  // fix from here: "Cruise Add-ons" made sense when there was one cruise, and a
  // list called that while the family has a Disney cruise and an Alaska cruise is
  // a list nobody trusts. The alternative was to build the list again under a
  // better name and move every item across by hand.
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState("");

  const template = templates.find((t) => t.id === templateId) || null;
  const mine = useMemo(
    () => items.filter((i) => i.template_id === templateId),
    [items, templateId],
  );

  // Nobody, rather than this family's three, until the roster says otherwise.
  const known = travelers.length ? travelers : [];
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
    const looking = Boolean(find) || onlyCategory !== "all";
    const built = shown.map((person) => {
      const rows = mine.filter(
        (i) =>
          (i.assignee || SHARED) === person &&
          (onlyCategory === "all" ||
            (i.category || "General") === onlyCategory) &&
          matchesQuery(find, i.item, i.category, i.assignee),
      );
      const byCategory = new Map();
      rows.forEach((i) => {
        const key = i.category || "General";
        if (!byCategory.has(key)) byCategory.set(key, []);
        byCategory.get(key).push(i);
      });
      return {
        person,
        looking,
        count: rows.length,
        stray: !known.includes(person) && person !== SHARED,
        groups: Array.from(byCategory.entries()).sort((a, b) =>
          a[0].localeCompare(b[0]),
        ),
      };
    });
    return looking ? built.filter((section) => section.count > 0) : built;
  }, [mine, people, who, known, find, onlyCategory]);

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

  /**
   * Which Add button is open. A person's, or one category inside that person's
   * list -- the two have to be told apart, because a list can hold a category
   * called the same thing as a person and pressing Add on Veda's Toiletries
   * should not open the form under Veda's heading as well.
   */
  const addKey = (person, category) =>
    category ? `${person}\u0000${category}` : person;

  function startAdd(person, category = null) {
    setAdding(addKey(person, category));
    setEditingId(null);
    setAddDraft({
      ...EMPTY_DRAFT,
      assignee: person,
      // Pressing Add on the Toiletries heading has already answered the
      // category more plainly than typing it would, so the question is not
      // asked again.
      category: category || "",
    });
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
        last_minute: !!addDraft.lastMinute,
        sort_order: nextSort(),
      }),
    );
    // Left open on purpose: adding to a packing template is usually adding
    // several. The category is kept as well as the person, because a form opened
    // on the Toiletries heading is still on Toiletries for the next line.
    if (ok)
      setAddDraft({
        ...EMPTY_DRAFT,
        assignee: addDraft.assignee,
        category: addDraft.category,
      });
  }

  function startEdit(row) {
    setAdding(null);
    setEditingId(row.id);
    setEditDraft({
      item: row.item || "",
      category: row.category || "",
      quantity: row.quantity || "",
      assignee: row.assignee || SHARED,
      lastMinute: !!row.last_minute,
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
          last_minute: !!editDraft.lastMinute,
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
  function startRename() {
    if (!template) return;
    setRenaming(true);
    setNameDraft(template.name || "");
    setNameError("");
  }

  async function submitRename(e) {
    e.preventDefault();
    if (!template) return;
    const name = nameDraft.trim();
    setNameError("");
    if (!name) {
      setNameError("A list needs a name.");
      return;
    }
    if (name === (template.name || "").trim()) {
      setRenaming(false);
      return;
    }
    // Two lists with the same name is a trap rather than an error: every place
    // the app names a template -- the pills on a trip's packing form, the chips
    // that say what a trip is built from, what Aly reads back -- becomes a guess.
    const clash = templates.find(
      (t) =>
        t.id !== template.id &&
        (t.name || "").trim().toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      setNameError(
        "There is already a list called that. Two with the same name makes every other screen ambiguous.",
      );
      return;
    }
    const ok = await run(() =>
      supabase.from("packing_templates").update({ name }).eq("id", template.id),
    );
    if (ok) setRenaming(false);
  }

  async function copyFrom(person, from) {
    const rows = mine
      .filter((i) => (i.assignee || SHARED) === from)
      .map((i, n) => ({
        template_id: templateId,
        item: i.item,
        category: i.category,
        assignee: person,
        quantity: i.quantity,
        last_minute: !!i.last_minute,
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
    return <FirstTemplate trips={packedTrips} />;
  }

  // The way to a second list. It is deliberately not a form: what a list is for
  // is a sentence, not four fields, and Aly has to see the sentence anyway. So
  // the button writes the brief into her box with the two things only they know
  // left blank, and does NOT send it -- a prompt that sent itself half-written
  // would produce a list built on the instructions alone.
  // Asking Aly what this particular list is missing. It sends: the brief is
  // complete on its own, because the list, what it is for and what is already on
  // it are all things the screen knows and the user would only be retyping.
  // Each suggestion arrives as its own change with its own tick, so a proposal
  // of twenty can be taken eighteen of.
  function proposeItems() {
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: {
          seed: proposeRequest({
            name: template.name,
            description: template.description,
            isBase: template.is_base,
            count: mine.length,
          }),
          autoSend: true,
          focus: TEMPLATES_FOCUS,
        },
      }),
    );
  }

  function newTemplate() {
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: {
          seed: blankRequest({ hasBase: templates.some((t) => t.is_base) }),
          focus: TEMPLATES_FOCUS,
        },
      }),
    );
  }

  /**
   * The form for a new template line, opened on a person or on one of their
   * categories. One function rather than one per place, so both agree about
   * every question it asks.
   */
  function addForm(person, category) {
    return (
      <form
        onSubmit={submitAdd}
        className={`no-print grid grid-cols-2 gap-2 border-b border-[var(--line)] bg-teal/5 px-4 py-3 ${
          category
            ? "sm:grid-cols-[2fr_5rem_auto_auto_auto]"
            : "sm:grid-cols-[2fr_1fr_5rem_auto_auto]"
        }`}
      >
        <input
          className="field col-span-2 sm:col-span-1"
          placeholder={
            category
              ? `Something else for ${category}`
              : `What ${person} always takes`
          }
          value={addDraft.item}
          onChange={(e) => setAddDraft({ ...addDraft, item: e.target.value })}
          autoFocus
          required
        />
        {/* Only asked when the answer is not already known. */}
        {!category && (
          <input
            className="field"
            placeholder="Category"
            list="template-categories"
            value={addDraft.category}
            onChange={(e) =>
              setAddDraft({ ...addDraft, category: e.target.value })
            }
          />
        )}
        <input
          className="field"
          placeholder="Qty"
          value={addDraft.quantity}
          onChange={(e) =>
            setAddDraft({ ...addDraft, quantity: e.target.value })
          }
        />
        {/* Set here as well as on a trip, because this is where the answer is
            worth keeping: mark the toothbrush once and every trip built from
            this template knows it. */}
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-teal"
            checked={!!addDraft.lastMinute}
            onChange={(e) =>
              setAddDraft({ ...addDraft, lastMinute: e.target.checked })
            }
          />
          {LAST_MINUTE_LABEL}
        </label>
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
    );
  }

  return (
    <section>
      <PropagatePanel />

      <div className="no-print mb-4 flex flex-wrap items-stretch gap-2">
        {templates.length > 1 &&
          templates.map((t) => {
            const on = t.id === templateId;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTemplateId(t.id);
                  setWho("all");
                  setEditingId(null);
                  // A half-typed name belongs to the list it was typed for.
                  setRenaming(false);
                  setNameError("");
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
        <button
          type="button"
          onClick={newTemplate}
          className="rounded-xl border border-dashed border-teal/50 px-3 py-2 text-left text-sm text-teal transition hover:border-teal hover:bg-teal-soft/30"
        >
          <span className="block font-semibold">+ Create packing template</span>
          <span className="mt-0.5 block text-xs text-ink-soft">
            Aly builds it with you
          </span>
        </button>
      </div>

      <div className="card mb-4 p-4">
        {renaming ? (
          <form onSubmit={submitRename} className="space-y-2">
            <label
              className="block text-xs font-semibold text-ink-soft"
              htmlFor="template-name"
            >
              What this list is called
            </label>
            <input
              id="template-name"
              className="field font-display text-lg font-semibold"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              // The name is the thing being changed, so the cursor starts in it
              // rather than making you find the one field on the form.
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Saving\u2026" : "Save name"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setRenaming(false);
                  setNameError("");
                }}
              >
                Cancel
              </button>
            </div>
            <p
              className={`text-xs ${nameError ? "text-rose" : "text-ink-soft"}`}
              role={nameError ? "alert" : undefined}
            >
              {nameError ||
                "Renaming a list changes what it is called everywhere \u2014 on each trip that uses it, and in what Aly reads back to you. Nothing packed changes, and no trip loses the list."}
            </p>
          </form>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-lg font-semibold">
              {template.name}
            </h2>
            <button
              type="button"
              onClick={startRename}
              className="text-xs font-semibold text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal"
            >
              Rename
            </button>
          </div>
        )}
        {template.description && (
          <p className="mt-1 text-sm text-ink-soft">{template.description}</p>
        )}
        <TripsUsing
          trips={tripsByTemplate[template.id]}
          empty={
            template.is_base
              ? "You have no upcoming trips, so there is nothing for this list to reach yet. Every trip you create starts from it."
              : "No upcoming trip uses this add-on. Say a trip is this kind of trip on its own Packing tab, and this list will start reaching it."
          }
        />
        {mine.length === 0 && (
          <p className="mt-2 text-sm text-ink-soft">
            {template.is_base
              ? "This list is empty, so new trips start with nothing packed. Add what the family always takes and every trip from here on begins with it."
              : "This add-on is empty. Put the gear here that only suits one kind of trip \u2014 cold-weather layers, snorkeling kit \u2014 and keep the base list to what travels everywhere."}
          </p>
        )}
        <div className="no-print mt-3">
          <button
            type="button"
            onClick={proposeItems}
            className="btn btn-primary px-4 py-1.5 text-sm"
          >
            Propose items automatically
          </button>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            Aly reads what is on this list already and suggests what is missing.
            Each suggestion comes with a tick of its own, so you can take some
            and leave the rest.
          </p>
        </div>

        {/* Search and one category at a time, the same pair the trip's own
            packing list carries, and offered on the same terms: only once the
            list is long enough that reading it is the slow way to answer. */}
        {mine.length >= 12 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_13rem] sm:items-center">
            <div className="relative min-w-0">
              <input
                type="text"
                className="field pr-16"
                placeholder="Search this template"
                aria-label="Search this packing template"
                value={find}
                onChange={(e) => setFind(e.target.value)}
              />
              {find && (
                <button
                  type="button"
                  onClick={() => setFind("")}
                  className="absolute inset-y-0 right-2 my-auto h-6 rounded-md px-2 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft hover:bg-sand hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>
            {categories.length > 1 && (
              <select
                className="field"
                aria-label="Show one category only"
                value={onlyCategory}
                onChange={(e) => setOnlyCategory(e.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>
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
        {!sections.length && (find || onlyCategory !== "all") && (
          <div className="card px-4 py-6 text-center">
            <p className="text-sm font-semibold text-ink">
              {find
                ? `Nothing on this template looks like “${find}”.`
                : `Nothing under ${onlyCategory}.`}
            </p>
            <p className="mt-1 text-[0.8rem] text-ink-soft">
              {mine.length} {mine.length === 1 ? "item" : "items"} on the list,
              hidden by what is set above.
            </p>
            <button
              type="button"
              className="btn btn-ghost mt-3 px-3 py-1.5 text-xs"
              onClick={() => {
                setFind("");
                setOnlyCategory("all");
              }}
            >
              Show everything again
            </button>
          </div>
        )}
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

            {adding === section.person && addForm(section.person, null)}

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
                  <div className="flex items-center gap-x-3 bg-white px-4 pb-1 pt-3">
                    <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                      {category}
                    </h3>
                    {/* The same small word that edits a row, on the heading of
                        the group it adds to, opening the form directly
                        underneath where the new line will appear. */}
                    <button
                      type="button"
                      onClick={() =>
                        adding === addKey(section.person, category)
                          ? setAdding(null)
                          : startAdd(section.person, category)
                      }
                      aria-expanded={
                        adding === addKey(section.person, category)
                      }
                      className="no-print ml-auto text-xs font-bold uppercase tracking-wide text-teal"
                    >
                      {adding === addKey(section.person, category)
                        ? "Close"
                        : "+ Add"}
                    </button>
                  </div>
                  {adding === addKey(section.person, category) &&
                    addForm(section.person, category)}
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
                            <label className="flex items-start gap-2 text-xs font-semibold text-ink-soft">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 accent-teal"
                                checked={!!editDraft.lastMinute}
                                onChange={(e) =>
                                  setEditDraft({
                                    ...editDraft,
                                    lastMinute: e.target.checked,
                                  })
                                }
                              />
                              <span>
                                Cannot be packed ahead
                                <span className="ml-1 font-normal text-ink-faint">
                                  {"\u2014"} carried onto every trip built from
                                  this template
                                </span>
                              </span>
                            </label>
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
                          {row.last_minute && (
                            <span
                              className="chip shrink-0 border border-amber/40 bg-amber/10 text-amber"
                              title="Cannot be packed ahead"
                            >
                              {LAST_MINUTE_LABEL}
                            </span>
                          )}
                          {/* The same 36px squares as the trip's packing list
                              -- a template row is a packing item too, and the
                              cross here was the same 12px glyph. */}
                          <div className="no-print flex shrink-0 items-center gap-0.5">
                            <button
                              onClick={() => startEdit(row)}
                              className="flex h-9 items-center rounded-full px-2 text-xs font-bold uppercase tracking-wide text-teal transition hover:bg-teal-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                              aria-label={`Edit ${row.item}`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => remove(row)}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft/60 transition hover:bg-rose/10 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                              aria-label={`Remove ${row.item}`}
                            >
                              <svg
                                viewBox="0 0 20 20"
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                aria-hidden="true"
                              >
                                <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
                              </svg>
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
