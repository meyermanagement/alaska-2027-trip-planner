"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { assigneeColor } from "@/lib/format";
import { oneOrShared } from "@/lib/people";
import {
  strandedGroups,
  strandedWords,
  tidyStranded,
} from "@/lib/packing/roster";
import ProTips from "./ProTips";

// readOnly is a secondary traveler: they see only their own lines (the database
// makes sure of that) and the tick is the one thing they may move. Everything
// that adds, edits, removes or tidies comes off the screen, because a forbidden
// UPDATE in Postgres matches no rows instead of raising -- an ungated button
// would look like it worked.
export default function Packing({
  items,
  tripId,
  travelers,
  going = null,
  userId,
  onChange,
  templates = [],
  templateItems: initialTemplateItems = [],
  tips = [],
  today,
  everLooked = false,
  pets = [],
  readOnly = false,
}) {
  const supabase = useMemo(() => createClient(), []);
  const [who, setWho] = useState("all");
  const [hidePacked, setHidePacked] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newAssignee, setNewAssignee] = useState("Shared");
  // Which animal a new line is about, when there is an animal on this trip to
  // pick. Separate from who packs it on purpose: "the horse's feed" and "Mark is
  // bringing it" are two different facts, and the old shape could only hold one
  // of them by making the horse the owner of its own hay.
  const [newPetId, setNewPetId] = useState("");
  const [editingId, setEditingId] = useState(null);
  // Sending the item being edited to a packing template. One pill per template,
  // pressed on and pressed off, because the old shape — a dropdown of templates
  // beside a button called "Add to packing template" — asked you to read two
  // controls and a paragraph to answer one question: is this thing kept, or not?
  // A pill answers it by looking like it. Held per item so the message stays
  // attached to the row it belongs to, and cleared when another row is opened.
  const [toTemplate, setToTemplate] = useState(null);
  // What the packing templates already hold. Without this the offer to keep an
  // item for future trips is made blind: the thing you are looking at may well
  // have arrived on this trip from a template in the first place, and being
  // asked to save it again — with no hint that it is already saved — is how you
  // end up with two of it on every trip after this one. They arrive with the
  // page; the copy here only exists so a row written from this form shows up in
  // the labels without another read.
  const [templateItems, setTemplateItems] = useState(initialTemplateItems);
  const [tidying, setTidying] = useState(false);
  const [tidyNote, setTidyNote] = useState("");
  const [editDraft, setEditDraft] = useState({
    item: "",
    category: "",
    assignee: "Shared",
    quantity: "",
    notes: "",
    petId: "",
  });

  const people = travelers.length
    ? travelers
    : ["Mark", "Steph", "Veda", "Shared"];

  /**
   * The filter pills follow the roster, not the family.
   *
   * A pill for somebody who is not on this trip is a dead end: their lines are
   * set aside the moment they come off, so tapping their name showed an empty
   * list and left you wondering what you had broken. Shared always stays,
   * because everybody's shared things are on every list.
   */
  const filterNames = useMemo(() => {
    const keyName = (v) =>
      String(v || "")
        .trim()
        .toLowerCase();
    const roster = (going || []).filter(Boolean);
    if (!roster.length) return people;
    const names = [];
    for (const name of people) {
      if (name === "Shared") continue;
      if (roster.some((r) => keyName(r) === keyName(name))) names.push(name);
    }
    // Anyone on the roster the family list does not know about — a guest added
    // by name — still gets a pill, since their things are on the list.
    for (const name of roster) {
      if (keyName(name) === keyName("Shared")) continue;
      if (!names.some((n) => keyName(n) === keyName(name))) names.push(name);
    }
    return [...names, "Shared"];
  }, [going, people]);

  /**
   * Which packing templates already hold a given item.
   *
   * Matched on the name without regard to case, because "Rain shell" and "rain
   * shell" are the same forgotten jacket. The person is reported rather than
   * required: an item kept for Shared is worth knowing about when you are
   * looking at Veda's copy of it, and the two are not the same row.
   */
  const keptOn = useMemo(() => {
    const names = new Map(templates.map((t) => [t.id, t]));
    const byName = new Map();
    for (const row of templateItems) {
      const key = String(row.item || "")
        .trim()
        .toLowerCase();
      const template = names.get(row.template_id);
      if (!key || !template) continue;
      const list = byName.get(key) || [];
      list.push({
        id: template.id,
        name: template.name,
        isBase: Boolean(template.is_base),
        assignee: row.assignee || "Shared",
      });
      byName.set(key, list);
    }
    return byName;
  }, [templateItems, templates]);

  const keptFor = (name) =>
    keptOn.get(
      String(name || "")
        .trim()
        .toLowerCase(),
    ) || [];

  /** One short line naming the templates an item is already kept on. */
  function keptLine(item) {
    const on = keptFor(item.item);
    if (!on.length) return null;
    const said = on
      .slice(0, 2)
      .map((t) =>
        t.assignee === item.assignee ? t.name : `${t.name} (${t.assignee})`,
      );
    const rest = on.length - said.length;
    return `Kept on ${said.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`;
  }

  /** Is the thing being edited already on this template, for this person? */
  const keptOnTemplate = (templateId) =>
    keptFor(editDraft.item).some(
      (k) => k.id === templateId && k.assignee === editDraft.assignee,
    );

  const categories = useMemo(() => {
    const list = Array.from(new Set(items.map((i) => i.category)));
    return list.sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visible = items.filter((i) => {
    // An exact name, now that an item belongs to one person or to everybody. The
    // loose match this replaces existed to catch names like "Steph & Veda", which
    // the app no longer writes and no longer keeps.
    if (
      who !== "all" &&
      (i.assignee || "").trim().toLowerCase() !== who.toLowerCase()
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
      // Settled to one traveler or Shared as the form opens, so an older row
      // written before that rule cannot be saved back as it was.
      assignee: oneOrShared(item.assignee, people),
      quantity: item.quantity || "",
      notes: item.notes || "",
      petId: item.pet_id || "",
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
        pet_id: editDraft.petId || null,
      })
      .eq("id", editingId);
    setEditingId(null);
    onChange();
  }

  /**
   * Put the item being edited on a packing template, or take it off again.
   *
   * Things are invented while packing for a real trip — that is when you notice
   * the thing you always forget — and until now the only way to keep one was to
   * remember it, walk to the Packing templates screen, and type it again. The
   * edits on screen are saved first so what lands on the template is what is
   * being looked at rather than what was there when the form opened.
   *
   * Taking it off again is here for the same reason: the pill that can only be
   * pressed one way is a trap, and the alternative was another walk to another
   * screen to undo a press you made by accident.
   *
   * The trip's own copy stays exactly where it is either way. Nothing about this
   * trip changes, and neither does any trip that already exists: a template is
   * only read when a new trip is built.
   */
  async function toggleTemplate(chosen) {
    const name = editDraft.item.trim();
    if (!chosen || !name) return;
    const removing = keptOnTemplate(chosen.id);
    setToTemplate({ state: "saving", id: chosen.id, removing });

    const patch = {
      item: name,
      category: (editDraft.category || "General").trim(),
      assignee: editDraft.assignee,
      quantity: editDraft.quantity.trim() || null,
      notes: editDraft.notes.trim() || null,
      pet_id: editDraft.petId || null,
    };
    const { error: editError } = await supabase
      .from("packing_items")
      .update(patch)
      .eq("id", editingId);
    if (editError) {
      setToTemplate({
        state: "error",
        id: chosen.id,
        message: "That did not save.",
      });
      return;
    }

    if (removing) {
      const { error } = await supabase
        .from("packing_template_items")
        .delete()
        .eq("template_id", chosen.id)
        .ilike("item", name)
        .eq("assignee", patch.assignee);
      if (error) {
        setToTemplate({
          state: "error",
          id: chosen.id,
          message: `That did not come off ${chosen.name}.`,
        });
        return;
      }
      // The labels on this form read from this copy, so it is kept in step with
      // what was just written rather than waiting for the page to be read again.
      setTemplateItems((rows) =>
        rows.filter(
          (r) =>
            !(
              r.template_id === chosen.id &&
              String(r.item || "").toLowerCase() === name.toLowerCase() &&
              r.assignee === patch.assignee
            ),
        ),
      );
      setToTemplate({
        state: "done",
        id: chosen.id,
        message: `Off ${chosen.name}. New trips will not start with it.`,
      });
      onChange();
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
      setTemplateItems((rows) => [
        ...rows,
        { template_id: chosen.id, item: name, assignee: patch.assignee },
      ]);
      setToTemplate({
        state: "done",
        id: chosen.id,
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
      // Which animal it is for travels with it onto the template, so a line
      // invented mid-trip keeps its meaning on every trip after this one.
      pet_id: patch.pet_id,
      quantity: patch.quantity,
      sort_order: 999,
      created_by: userId,
    });
    if (!error) {
      // Kept alongside the row that was written so the pills on this form, and
      // the line under the item, tell the truth without another read.
      setTemplateItems((rows) => [
        ...rows,
        { template_id: chosen.id, item: name, assignee: patch.assignee },
      ]);
    }
    setToTemplate(
      error
        ? {
            state: "error",
            id: chosen.id,
            message: `That did not save to ${chosen.name}.`,
          }
        : {
            state: "done",
            id: chosen.id,
            message: `Kept on ${chosen.name}. New trips will start with it.`,
          },
    );
    onChange();
  }

  // The animal a line is about, if any. Shown beside who packs it rather than
  // instead of it, because "the horse's feed" and "Mark is bringing it" are both
  // worth reading at a glance and neither one replaces the other.
  const petById = useMemo(
    () => new Map((pets || []).map((pet) => [pet.id, pet])),
    [pets],
  );
  const petFor = (item) => (item?.pet_id ? petById.get(item.pet_id) : null);

  async function add(e) {
    e.preventDefault();
    if (!newItem.trim()) return;
    await supabase.from("packing_items").insert({
      trip_id: tripId,
      item: newItem.trim(),
      category: (newCategory || "General").trim(),
      assignee: newAssignee,
      pet_id: newPetId || null,
      sort_order: 999,
    });
    setNewItem("");
    setNewPetId("");
    onChange();
  }

  // The list checked against the roster, every time it is drawn. A tap that took
  // somebody off the trip is supposed to take their things with it, but that is
  // one moment on one device — and every list made before that behavior existed
  // never got the message at all. So the question is asked here too, where it
  // cannot be missed, and answered by a button rather than silently: deleting
  // twenty-two lines because a page loaded would be the wrong kind of helpful.
  const stranded = useMemo(
    () =>
      going
        ? strandedGroups({
            tripItems: items,
            goingNames: going,
            familyNames: travelers,
          })
        : [],
    [going, items, travelers],
  );
  const strandedRemovable = stranded.reduce(
    (sum, group) => sum + group.remove.length,
    0,
  );

  async function tidy() {
    setTidying(true);
    setTidyNote("");
    const result = await tidyStranded({
      supabase,
      tripId,
      goingNames: going || [],
      familyNames: travelers,
    });
    setTidyNote(result.message || "");
    setTidying(false);
    if (result.removed) onChange?.();
  }

  const packed = items.filter((i) => i.is_packed).length;
  const pct = items.length ? Math.round((packed / items.length) * 100) : 0;

  return (
    <section>
      {/* Above the progress bar, because the point of a packing tip is to be read
          before the list is worked through rather than after.

          No button of its own. Asking for a look is one decision about the whole
          trip, and it lives on the Overview tab; three buttons that each start
          the same five-place walk, on three tabs, is three ways to spend the
          same minute and no way to tell which one you already pressed. What
          arrives here still arrives here. */}
      <ProTips
        tips={tips}
        today={today}
        tripId={tripId}
        scope="packing"
        everLooked={everLooked}
        canLook={false}
        heading="Before you pack"
        emptyFresh="Nothing here yet. A look on the Overview tab covers the packing list as well as the trip, and anything worth saying about what to take will land here."
        emptyLooked="Nothing worth flagging about what to take at the moment. Packing tips only appear when there is something specific to say about where you are going, when, or what you have told the app you like."
        readOnly={readOnly}
      />
      {stranded.length > 0 && (
        <div
          // Not .card: that class sets a white background later in the sheet than
          // the utilities, so a tinted card has to draw its own box.
          className="no-print mb-4 rounded-[0.875rem] border border-amber/35 bg-amber/10 p-4"
        >
          <p className="text-sm font-semibold text-ink">
            {strandedWords(stranded)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Their lines still count against the packed total. Taking them off
            sets them aside rather than deleting them — packed state and notes
            included — so everything returns if you add them to this trip again.
          </p>
          {strandedRemovable > 0 && !readOnly && (
            <button
              onClick={tidy}
              disabled={tidying}
              className="btn btn-primary mt-3"
            >
              {tidying
                ? "Taking them off…"
                : `Take ${strandedRemovable} ${strandedRemovable === 1 ? "item" : "items"} off the list`}
            </button>
          )}
          {tidyNote && (
            <p className="mt-2 text-xs font-semibold text-ink-soft">
              {tidyNote}
            </p>
          )}
        </div>
      )}
      {!stranded.length && tidyNote && (
        <p className="no-print mb-4 text-xs font-semibold text-ink-soft">
          {tidyNote}
        </p>
      )}
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
        {/* Filtering by person is a choice with one answer when the list is
            already one person's: a secondary traveler is shown only the lines
            assigned to them, so the pills would all do the same thing. Hide
            packed stays, because that one is about the list, not about who. */}
        {!readOnly && (
          <>
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
            {filterNames.map((p) => (
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
          </>
        )}
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

      {!readOnly && (
        <form
          onSubmit={add}
          className={`card no-print mb-5 grid gap-2 p-4 ${
            pets.length
              ? "sm:grid-cols-[2fr_1fr_auto_auto_auto]"
              : "sm:grid-cols-[2fr_1fr_auto_auto]"
          }`}
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
          {pets.length > 0 && (
            <select
              className="field"
              value={newPetId}
              onChange={(e) => setNewPetId(e.target.value)}
              aria-label="Which pet is this for"
              title="Is this item for one of the animals?"
            >
              <option value="">Not for a pet</option>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  For {pet.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-primary">Add</button>
        </form>
      )}

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
                          {/* One traveler, or Shared. A name belonging to two
                              people used to be offered back as an option here,
                              which is how "Steph & Veda" survived every edit it
                              was ever given: invisible under Steph, invisible
                              under Veda, and copied onto every future trip. */}
                          {people.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
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
                      {pets.length > 0 && (
                        <select
                          className="field"
                          value={editDraft.petId}
                          onChange={(e) =>
                            setEditDraft({
                              ...editDraft,
                              petId: e.target.value,
                            })
                          }
                          aria-label="Which pet is this for"
                        >
                          {/* Which animal it is for, kept apart from who packs
                              it. The two answers used to be crushed into one
                              field, which made the horse the owner of its own
                              hay and left nobody actually responsible for it. */}
                          <option value="">Not for a pet</option>
                          {pets.map((pet) => (
                            <option key={pet.id} value={pet.id}>
                              For {pet.name}
                            </option>
                          ))}
                        </select>
                      )}
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
                          <p
                            className="text-xs font-semibold text-ink-soft"
                            id="packing-keep-label"
                          >
                            Keep for future trips
                          </p>
                          <div
                            className="mt-1.5 flex flex-wrap gap-1.5"
                            role="group"
                            aria-labelledby="packing-keep-label"
                          >
                            {templates.map((t) => {
                              const on = keptOnTemplate(t.id);
                              const busy =
                                toTemplate?.state === "saving" &&
                                toTemplate?.id === t.id;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  aria-pressed={on}
                                  disabled={busy || !editDraft.item.trim()}
                                  onClick={() => toggleTemplate(t)}
                                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                                    on
                                      ? "border-teal bg-teal text-white"
                                      : "border-dashed border-[var(--line)] bg-white text-ink-soft hover:border-teal/50 hover:text-teal"
                                  }`}
                                >
                                  {/* The mark carries the state as well as the
                                      color, because a filled pill and an empty
                                      one are the same pill to anyone who does
                                      not see color. */}
                                  <span aria-hidden="true">
                                    {busy ? "\u2026" : on ? "\u2713" : "+"}
                                  </span>
                                  {t.name}
                                  {t.is_base ? " (base)" : ""}
                                </button>
                              );
                            })}
                          </div>
                          <p
                            className={`mt-1.5 text-xs ${
                              toTemplate?.state === "error"
                                ? "text-rose"
                                : "text-ink-soft"
                            }`}
                          >
                            {toTemplate?.message ||
                              `Saves your edits, then keeps ${
                                editDraft.assignee === "Shared"
                                  ? "this"
                                  : `${editDraft.assignee}\u2019s`
                              } item on the lists you pick. Press a pill again to take it off. Trips that already exist are left alone.`}
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
                        {petFor(item) && (
                          <span
                            className="chip border border-[var(--line)] bg-white text-ink-soft"
                            title={`For ${petFor(item).name}`}
                          >
                            <span
                              aria-hidden="true"
                              className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                              style={{
                                background: petFor(item).color || "var(--teal)",
                              }}
                            />
                            For {petFor(item).name}
                          </span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {item.notes}
                        </p>
                      )}
                      {keptLine(item) && (
                        <p className="mt-0.5 text-xs text-ink-faint">
                          {keptLine(item)}
                        </p>
                      )}
                    </div>
                    <div className="no-print flex shrink-0 items-center gap-2">
                      {!readOnly && (
                        <button
                          onClick={() => startEdit(item)}
                          className="text-xs font-bold uppercase tracking-wide text-teal transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                          aria-label={`Edit ${item.item}`}
                        >
                          Edit
                        </button>
                      )}
                      {!readOnly && (
                        <button
                          onClick={() => remove(item)}
                          className="text-xs font-semibold text-ink-soft/60 transition hover:text-rose sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                          aria-label={`Remove ${item.item}`}
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
            Nothing left in this view. Nice work.
          </p>
        )}
      </div>
    </section>
  );
}
