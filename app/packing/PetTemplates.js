"use client";

// Each pet's packing list, on its own panel.
//
// A pet's list is not an add-on the family chooses between the way "Disney
// Parks" and "Caribbean Beach" are. It applies whenever that animal is coming
// and it applies to nothing else, so it does not belong in the same row of
// chips. It also does not want the person-by-person grouping the family lists
// use: every line on it belongs to the same animal, and running the pet's name
// through that grouping got it flagged as somebody who is not on the People
// list.
//
// So: one card per pet, its own lines, edited in place. Deliberately plainer
// than the family templates screen, because there is only ever one animal per
// panel — but who packs each line is still a real question, and it is asked.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TripsUsing from "@/components/TripsUsing";
import { speciesLabel } from "@/lib/pets/pets";
import { assigneeColor } from "@/lib/format";

const EMPTY = { item: "", category: "Pets", quantity: "", assignee: "Shared" };

export default function PetTemplates({
  pets = [],
  templates = [],
  items = [],
  people = [],
  // { [petId]: [{ id, name, start_date, href, draft }] } -- the upcoming trips
  // each animal is actually on. Keyed by the animal rather than by its list,
  // because that is the rule: an animal's list applies whenever the animal comes,
  // so a trip it is not on is a trip the list does not reach however the list is
  // built.
  tripsByPet = {},
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  // Who can be handed a pet's line. An animal is never on this list: it carries
  // nothing, and the whole point of keeping the pet on the line separately is
  // that a person or Shared stays answerable for the feed and the paperwork.
  const owners = useMemo(
    () => (people.length ? [...people, "Shared"] : ["Shared"]),
    [people],
  );
  const [rows, setRows] = useState(items);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [addingFor, setAddingFor] = useState(null);
  const [addDraft, setAddDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Only pets that actually have a list. One is made the moment a pet is added,
  // so a pet with none is either older than this feature or hit an error, and in
  // both cases saying so is better than pretending the panel is empty by choice.
  const panels = useMemo(() => {
    const byPet = new Map(templates.map((t) => [t.pet_id, t]));
    return pets.map((pet) => {
      const tpl = byPet.get(pet.id) || null;
      const mine = tpl
        ? rows
            .filter((r) => r.template_id === tpl.id)
            .sort(
              (a, b) =>
                (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
                String(a.item).localeCompare(String(b.item)),
            )
        : [];
      return { pet, template: tpl, items: mine };
    });
  }, [pets, templates, rows]);

  if (!pets.length) return null;

  async function run(work) {
    setBusy(true);
    setError("");
    const message = await work();
    setBusy(false);
    if (message) {
      setError(message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function submitAdd(e, panel) {
    e.preventDefault();
    const item = addDraft.item.trim();
    if (!item || !panel.template) return;
    const ok = await run(async () => {
      const { data, error: err } = await supabase
        .from("packing_template_items")
        .insert({
          template_id: panel.template.id,
          item,
          category: addDraft.category.trim() || "Pets",
          // Always the animal's own name: that is what lets its lines be set
          // aside and brought back when it comes off a trip and back on.
          assignee: addDraft.assignee || "Shared",
          pet_id: panel.pet.id,
          quantity: addDraft.quantity.trim() || null,
          sort_order: panel.items.length,
        })
        .select(
          "id, template_id, category, item, assignee, quantity, sort_order, pet_id",
        )
        .maybeSingle();
      if (err) return err.message;
      if (data) setRows((prev) => [...prev, data]);
      return "";
    });
    if (ok) {
      setAddDraft(EMPTY);
      setAddingFor(null);
    }
  }

  async function submitEdit(e, row) {
    e.preventDefault();
    const item = draft.item.trim();
    if (!item) return;
    const patch = {
      item,
      category: draft.category.trim() || "Pets",
      quantity: draft.quantity.trim() || null,
      assignee: draft.assignee || "Shared",
    };
    const ok = await run(async () => {
      const { error: err } = await supabase
        .from("packing_template_items")
        .update(patch)
        .eq("id", row.id);
      if (err) return err.message;
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)),
      );
      return "";
    });
    if (ok) setEditingId(null);
  }

  async function remove(row) {
    await run(async () => {
      const { error: err } = await supabase
        .from("packing_template_items")
        .delete()
        .eq("id", row.id);
      if (err) return err.message;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      return "";
    });
  }

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="font-display text-2xl font-semibold">Pets</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          One list per animal, because a cat&rsquo;s things and a
          Labrador&rsquo;s things overlap by about two lines. These are not
          add-ons you pick between: a pet&rsquo;s list goes onto a trip whenever
          that pet is coming, and its lines are set aside when it is not. Which
          trips a pet is on is set on the trip itself.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {panels.map(({ pet, template, items: mine }) => (
          <div key={pet.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--line)] bg-sand/60 px-4 py-2.5">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: pet.color || "var(--teal)" }}
              />
              <span className="font-semibold">{pet.name}</span>
              <span className="text-xs text-ink-soft">
                {speciesLabel(pet.species)}
              </span>
              <span className="text-xs font-semibold text-ink-soft">
                {mine.length} {mine.length === 1 ? "item" : "items"}
              </span>
              {template && (
                <button
                  onClick={() => {
                    setAddingFor(addingFor === pet.id ? null : pet.id);
                    setAddDraft(EMPTY);
                    setEditingId(null);
                  }}
                  className="no-print ml-auto text-xs font-bold uppercase tracking-wide text-teal"
                >
                  + Add
                </button>
              )}
            </div>

            {template && (
              <div className="px-4 pt-3">
                <TripsUsing
                  className=""
                  trips={tripsByPet[pet.id]}
                  empty={`${pet.name} is not on any upcoming trip, so this list is not reaching one. Put ${pet.name} on a trip and the list follows.`}
                />
              </div>
            )}

            {!template ? (
              <p className="px-4 py-3.5 text-sm text-ink-soft">
                {pet.name} has no list yet. One is made the first time{" "}
                {pet.name} is put on a trip, or you can ask Aly to start it.
              </p>
            ) : (
              <>
                {mine.length === 0 && addingFor !== pet.id && (
                  <p className="px-4 py-3.5 text-sm text-ink-soft">
                    This list is empty, so nothing is added for {pet.name} when{" "}
                    {pet.name} comes along. Food, bowls, a leash, waste bags and
                    the rabies certificate are the ones families forget.
                  </p>
                )}
                <ul className="divide-y divide-[var(--line)]">
                  {mine.map((row) =>
                    editingId === row.id ? (
                      <li key={row.id} className="px-4 py-3">
                        <form
                          onSubmit={(e) => submitEdit(e, row)}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <label className="flex-1 basis-48 text-xs font-semibold text-ink-soft">
                            Item
                            <input
                              autoFocus
                              className="input mt-1"
                              value={draft.item}
                              onChange={(e) =>
                                setDraft({ ...draft, item: e.target.value })
                              }
                            />
                          </label>
                          <label className="basis-32 text-xs font-semibold text-ink-soft">
                            Category
                            <input
                              className="input mt-1"
                              value={draft.category}
                              onChange={(e) =>
                                setDraft({ ...draft, category: e.target.value })
                              }
                            />
                          </label>
                          <label className="basis-32 text-xs font-semibold text-ink-soft">
                            Who packs it
                            <select
                              className="input mt-1"
                              value={draft.assignee}
                              onChange={(e) =>
                                setDraft({ ...draft, assignee: e.target.value })
                              }
                            >
                              {owners.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="basis-24 text-xs font-semibold text-ink-soft">
                            How many
                            <input
                              className="input mt-1"
                              value={draft.quantity}
                              onChange={(e) =>
                                setDraft({ ...draft, quantity: e.target.value })
                              }
                            />
                          </label>
                          <button
                            type="submit"
                            disabled={busy}
                            className="btn btn-primary"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="btn btn-ghost"
                          >
                            Cancel
                          </button>
                        </form>
                      </li>
                    ) : (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                      >
                        <span>{row.item}</span>
                        {row.quantity && row.quantity !== "1" && (
                          <span className="text-xs text-ink-soft">
                            &times;{row.quantity}
                          </span>
                        )}
                        <span className={`chip ${assigneeColor(row.assignee)}`}>
                          {row.assignee}
                        </span>
                        {row.category && row.category !== "Pets" && (
                          <span className="text-xs text-ink-faint">
                            {row.category}
                          </span>
                        )}
                        <span className="no-print ml-auto flex gap-3">
                          <button
                            onClick={() => {
                              setEditingId(row.id);
                              setAddingFor(null);
                              setDraft({
                                item: row.item || "",
                                category: row.category || "Pets",
                                quantity: row.quantity || "",
                                assignee: row.assignee || "Shared",
                              });
                            }}
                            className="text-xs font-bold uppercase tracking-wide text-teal"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => remove(row)}
                            disabled={busy}
                            className="text-xs font-bold uppercase tracking-wide text-ink-soft"
                          >
                            Remove
                          </button>
                        </span>
                      </li>
                    ),
                  )}
                </ul>

                {addingFor === pet.id && (
                  <form
                    onSubmit={(e) =>
                      submitAdd(e, { pet, template, items: mine })
                    }
                    className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] bg-sand/40 px-4 py-3"
                  >
                    <label className="flex-1 basis-48 text-xs font-semibold text-ink-soft">
                      Item
                      <input
                        autoFocus
                        className="input mt-1"
                        placeholder={`Something ${pet.name} needs`}
                        value={addDraft.item}
                        onChange={(e) =>
                          setAddDraft({ ...addDraft, item: e.target.value })
                        }
                      />
                    </label>
                    <label className="basis-32 text-xs font-semibold text-ink-soft">
                      Category
                      <input
                        className="input mt-1"
                        value={addDraft.category}
                        onChange={(e) =>
                          setAddDraft({ ...addDraft, category: e.target.value })
                        }
                      />
                    </label>
                    <label className="basis-32 text-xs font-semibold text-ink-soft">
                      Who packs it
                      <select
                        className="input mt-1"
                        value={addDraft.assignee}
                        onChange={(e) =>
                          setAddDraft({ ...addDraft, assignee: e.target.value })
                        }
                      >
                        {owners.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="basis-24 text-xs font-semibold text-ink-soft">
                      How many
                      <input
                        className="input mt-1"
                        placeholder="1"
                        value={addDraft.quantity}
                        onChange={(e) =>
                          setAddDraft({ ...addDraft, quantity: e.target.value })
                        }
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={busy || !addDraft.item.trim()}
                      className="btn btn-primary"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingFor(null)}
                      className="btn btn-ghost"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
