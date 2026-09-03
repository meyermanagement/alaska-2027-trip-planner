"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CategoryPicker from "./CategoryPicker";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { assigneeColor } from "@/lib/format";
import { oneOrShared } from "@/lib/people";
import { matchesQuery } from "@/lib/packing/find";
import {
  strandedGroups,
  strandedWords,
  tidyStranded,
} from "@/lib/packing/roster";
import { LAST_MINUTE_LABEL, looksLastMinute } from "@/lib/packing/lastMinute";
import ProTips from "./ProTips";

/**
 * The one "category" that is not a category: adding a line under a heading the
 * list does not have yet. Every other add is a button on the card it belongs to.
 */
const NEW_CATEGORY = "\u0000new";

/**
 * One name, compared the way people mean it: trimmed and without regard to
 * case. "Shared", "shared" and " Shared" are one person on a list, and matching
 * them strictly is how an item that plainly is on a template gets treated as
 * though it were not.
 */
function keyPerson(v) {
  return String(v || "Shared")
    .trim()
    .toLowerCase();
}

function samePerson(a, b) {
  return keyPerson(a) === keyPerson(b);
}

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
  tripTemplateIds = [],
  templatesChosen = false,
  tips = [],
  today,
  everLooked = false,
  pets = [],
  readOnly = false,
}) {
  const supabase = useMemo(() => createClient(), []);
  // The lowest sort_order this screen has handed out under each heading, so two
  // quick adds do not collide. See topOfCategory.
  const handFloor = useRef(new Map());
  const [who, setWho] = useState("all");
  // Finding a line on a list of a hundred and eleven. Spelling is forgiven --
  // see lib/packing/find -- because the question you arrive with is usually
  // half-remembered, and a search that only answers to the exact wording is a
  // search you have to already know the answer to use.
  const [find, setFind] = useState("");
  // One category at a time, for the other way of looking: not "where is the
  // thing" but "what is under Toiletries".
  const [onlyCategory, setOnlyCategory] = useState("all");
  const [hidePacked, setHidePacked] = useState(false);
  // Shut, until somebody wants it. The strip explains where the list came from
  // and what changing a template does -- worth reading once, and then it is a
  // paragraph and a half of settled fact sitting above the list you actually
  // came to tick off. Which add-ons are on is the part still worth seeing at a
  // glance, so that stays on the closed row.
  const [builtOpen, setBuiltOpen] = useState(false);
  // Narrowing to the things that CAN go in a bag today.
  //
  // This pill used to be the other way round -- it gathered the Last minute rows,
  // and that turned out to be a filter nobody needed. The marked rows are the ones
  // that stay unticked by design, so on any evening before the last one, "show me
  // the last minute things" and "show me what is not packed" return almost the
  // same list, and Hide packed already answers that. Nothing is gained by asking
  // twice.
  //
  // Turned around it answers the question the run-up actually has. Packing a
  // suitcase two weeks out, the useful list is everything except the toothbrush,
  // the medication and the charger -- and with Hide packed ticked alongside, what
  // is left on screen is exactly the work that can be finished tonight. The rows
  // still keep the flag and still wear the chip where they sit, so the marked ones
  // have not gone anywhere; they are simply no longer what the filter is for.
  const [onlyAhead, setOnlyAhead] = useState(false);
  // Which category's Add button was pressed, if any. A trip's list is a stack of
  // category cards, and the form for a new line now opens inside the one it is
  // going into rather than standing permanently above all of them: the category
  // is already answered by where you pressed, and the form is not in the way on
  // every visit to a list you came to tick things off on. NEW_CATEGORY is the
  // one case that cannot be answered by a button on a card, because the card
  // does not exist yet.
  const [adding, setAdding] = useState(null);
  const [newItem, setNewItem] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newAssignee, setNewAssignee] = useState("Shared");
  // Which animal a new line is about, when there is an animal on this trip to
  // pick. Separate from who packs it on purpose: "the horse's feed" and "Mark is
  // bringing it" are two different facts, and the old shape could only hold one
  // of them by making the horse the owner of its own hay.
  const [newPetId, setNewPetId] = useState("");
  // Whether the thing being added can go in a bag early. The name is still read
  // for a guess, so "Veda's medication" arrives already knowing the answer, but
  // the guess is now visible and can be argued with before the row is written
  // instead of after. Two pieces of state, because "the user has not touched
  // this" and "the user unticked it" are different answers and collapsing them
  // makes the guess reappear the moment you type another word.
  const [newLastMinute, setNewLastMinute] = useState(false);
  const [newLastMinuteSet, setNewLastMinuteSet] = useState(false);
  const guessedLastMinute = looksLastMinute(newItem);
  const newIsLastMinute = newLastMinuteSet ? newLastMinute : guessedLastMinute;

  // Which standing lists this new item should join. Asked here because the
  // moment you think of a thing the family forgot is the moment you know whether
  // it was forgotten once or gets forgotten every time — and the old answer was
  // to add it, find it in the list, open the edit form, and press a pill.
  const [newTemplates, setNewTemplates] = useState(() => new Set());
  const [newNote, setNewNote] = useState("");
  // Which add-on lists this trip is built from. A trip is often several things
  // at once -- an Alaska cruise is an Alaska trip and a cruise -- and until this
  // could be said the app had to guess from the lines the list already carried,
  // which cannot work for a trip that has no lines yet.
  const [addOns, setAddOns] = useState(() => new Set(tripTemplateIds));
  // Named for what it means rather than what it is: an empty set of add-ons is a
  // real answer once somebody has given it, and different from nobody having
  // been asked -- which is the only thing standing between "no add-ons" and the
  // guess quietly putting them back.
  const [everChosen, setEverChosen] = useState(templatesChosen);
  const [savingAddOn, setSavingAddOn] = useState(null);
  const [addOnNote, setAddOnNote] = useState("");
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
  // What the row looked like when its edit form opened, kept so a save can tell
  // what actually changed. Only the fields a template also carries are worth
  // remembering here.
  const [editBefore, setEditBefore] = useState(null);
  // The question asked after a save that changed an item the templates also
  // hold: should the standing lists be changed too? Held as a whole little
  // problem -- what changed, on which lists, and what came of answering -- so
  // the card can be drawn away from the row, which by then has closed.
  const [askTemplate, setAskTemplate] = useState(null);
  // Where that question is drawn, so it can be brought to the reader. It sits
  // above the list, and the row being edited is routinely sixty items down: on
  // a phone the card appeared nearly two thousand pixels above the fold, which
  // is indistinguishable from the app never asking at all.
  const askRef = useRef(null);
  const [tidying, setTidying] = useState(false);
  const [tidyNote, setTidyNote] = useState("");
  const [editDraft, setEditDraft] = useState({
    item: "",
    category: "",
    assignee: "Shared",
    quantity: "",
    notes: "",
    petId: "",
    lastMinute: false,
  });

  // Only ever seen before the roster has loaded, or on an account with nobody on
  // it yet. It used to fall back to this family's own three names, which is fine
  // for this family and wrong for anybody else's -- a stranger's first packing
  // item would have offered to assign itself to Steph.
  const people = travelers.length ? travelers : ["Shared"];

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

  /**
   * The lists a question is about, named -- with the person spelled out on any
   * line the template keeps under somebody else, because "change Family base
   * too" means something different when the line there belongs to Shared and
   * the one you just edited belongs to Veda.
   */
  function listedAs(on, person) {
    return on
      .map((t) =>
        samePerson(t.assignee, person) ? t.name : `${t.name} (${t.assignee})`,
      )
      .join(" and ");
  }

  /** One short line naming the templates an item is already kept on. */
  function keptLine(item) {
    const on = keptFor(item.item);
    if (!on.length) return null;
    const said = on
      .slice(0, 2)
      .map((t) =>
        samePerson(t.assignee, item.assignee)
          ? t.name
          : `${t.name} (${t.assignee})`,
      );
    const rest = on.length - said.length;
    return `Kept on ${said.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`;
  }

  /** Is the thing being edited already on this template, for this person? */
  const keptOnTemplate = (templateId) =>
    keptFor(editDraft.item).some(
      (k) => k.id === templateId && samePerson(k.assignee, editDraft.assignee),
    );

  const categories = useMemo(() => {
    // The headings this trip actually uses, which is what the picker offers.
    // Read off the rows rather than from a fixed list, so a heading somebody
    // invented an hour ago is offered back to the next person instead of being
    // retyped slightly differently.
    const list = Array.from(
      new Set(
        items.map((i) => (i.category || "General").trim()).filter(Boolean),
      ),
    );
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
    if (onlyAhead && i.last_minute) return false;
    if (onlyCategory !== "all" && (i.category || "General") !== onlyCategory)
      return false;
    // The heading and the person are searched along with the name, so "toilet"
    // finds the bag as well as the heading it sits under, and "veda" gathers
    // her things without touching the pills.
    if (!matchesQuery(find, i.item, i.category, i.assignee, i.notes))
      return false;
    return true;
  });

  // Offered only when the filter would change what is on screen: a list with
  // nothing marked would hide nothing, and a list where everything is marked would
  // hide everything. Either way it is a pill that either does nothing or empties
  // the page, which is the same reason there is no pill here for somebody who is
  // not on this trip.
  const canSplitAhead = useMemo(
    () => items.some((i) => i.last_minute) && items.some((i) => !i.last_minute),
    [items],
  );

  const grouped = useMemo(() => {
    const map = new Map();
    visible.forEach((i) => {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category).push(i);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  /**
   * The sort_order a line just written should get, so that it lands at the top
   * of its heading rather than the bottom.
   *
   * Everything that a generated list wrote is numbered from 1 upwards, and the
   * list is read back ordered by that number, so a new line only has to be
   * smaller than the smallest one already there. The first line under a brand
   * new heading gets 0, the next gets -1, and so on downwards -- which reads
   * backwards until you remember that ascending order puts the smallest first.
   *
   * Why the top: a thing you remember while standing over an open suitcase is
   * the thing most likely to be forgotten, and 999 buried it under sixty rows
   * of things you had already thought of. It also meant every line added by
   * hand shared one number, so their order among themselves was whatever the
   * database felt like that day.
   */
  function topOfCategory(category) {
    const key = (category || "General").trim().toLowerCase();
    let smallest = 1;
    for (const row of items)
      if ((row.category || "General").trim().toLowerCase() === key)
        smallest = Math.min(smallest, row.sort_order ?? 0);
    // The form stays open after an add, on purpose -- remembering one forgotten
    // thing is how you remember the next two -- so two lines can be written
    // before the reread that would have told the second one about the first.
    // Remembering the last number handed out keeps them in the order they were
    // typed instead of leaving both on the same number for the database to
    // break however it likes.
    const last = handFloor.current.get(key);
    const next = Math.min(
      smallest - 1,
      last === undefined ? Infinity : last - 1,
    );
    handFloor.current.set(key, next);
    return next;
  }

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
    setAskTemplate(null);
    setEditBefore({
      item: item.item || "",
      category: item.category || "",
      assignee: oneOrShared(item.assignee, people),
      quantity: item.quantity || "",
      petId: item.pet_id || "",
    });
    setEditDraft({
      item: item.item || "",
      category: item.category || "",
      // Settled to one traveler or Shared as the form opens, so an older row
      // written before that rule cannot be saved back as it was.
      assignee: oneOrShared(item.assignee, people),
      quantity: item.quantity || "",
      notes: item.notes || "",
      petId: item.pet_id || "",
      lastMinute: !!item.last_minute,
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editDraft.item.trim()) return;
    const category = (editDraft.category || "General").trim();
    // Given a new heading, a line goes to the top of it, for the same reason a
    // new line does: you moved it just now, and it should be where you can see
    // that it moved. Left where it was, its number is left alone -- re-saving a
    // line without touching its heading should not reshuffle the card.
    const moved =
      category.toLowerCase() !==
      (editBefore?.category || "General").trim().toLowerCase();
    await supabase
      .from("packing_items")
      .update({
        item: editDraft.item.trim(),
        category,
        ...(moved ? { sort_order: topOfCategory(category) } : null),
        assignee: editDraft.assignee,
        quantity: editDraft.quantity.trim() || null,
        notes: editDraft.notes.trim() || null,
        pet_id: editDraft.petId || null,
        last_minute: !!editDraft.lastMinute,
      })
      .eq("id", editingId);
    setEditingId(null);
    askAboutTemplates(editBefore, {
      item: editDraft.item.trim(),
      category,
      assignee: editDraft.assignee,
      quantity: editDraft.quantity.trim(),
      petId: editDraft.petId || "",
    });
    setEditBefore(null);
    onChange();
  }

  /**
   * Having changed an item on this trip, ask whether the standing lists should
   * change with it.
   *
   * An item edited here has usually arrived from a template, and the correction
   * being made -- the right size, the better brand, the category it should have
   * been in all along -- is nearly always true of the next trip as well. Until
   * now the trip's copy quietly diverged and the template went on handing out
   * the old version forever.
   *
   * Asked rather than done, because the other half of the time the change is
   * about this trip alone: two of something for a longer stay, a category made
   * up for one itinerary. And asked only when there is something to ask about:
   * the item has to be on a template, and something a template carries has to
   * have actually changed. Renaming is included deliberately -- matching is by
   * name, so a rename is exactly the edit that would otherwise strand the trip's
   * copy from the line it came from.
   */
  function askAboutTemplates(before, after) {
    if (!before || readOnly) return;
    // The same line, under the same person, is the clearest case. Where the
    // template keeps it under somebody else -- the base list carries it as
    // Shared, this trip gave it to Veda -- it is still the same forgotten
    // jacket, and the change being made to it is still likely true next time.
    // So those count too, and the card says whose line it would change rather
    // than pretending the question is simpler than it is.
    const all = keptFor(before.item);
    const mine = all.filter((k) => samePerson(k.assignee, before.assignee));
    const on = mine.length ? mine : all;
    if (!on.length) return;
    const changed = [
      "item",
      "category",
      "assignee",
      "quantity",
      "petId",
    ].filter((field) => (before[field] || "") !== (after[field] || ""));
    if (!changed.length) return;
    setAskTemplate({ before, after, on, state: "asking", message: "" });
  }

  // Asked, and then actually put in front of somebody. Only on the way in --
  // once the question is on screen, answering it must not move the page again.
  useEffect(() => {
    if (!askTemplate || askTemplate.state !== "asking") return;
    const el = askRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const off = box.top < 8 || box.bottom > window.innerHeight - 8;
    if (off) el.scrollIntoView({ block: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askTemplate?.state, askTemplate?.after?.item]);

  /**
   * Say yes: write the same change onto every template that holds the item.
   *
   * Matched on the old name and the old person, which is how the item was found
   * in the first place, and written by id so a template holding two lines with
   * the same name cannot lose the wrong one. The local copy of the template
   * rows is patched alongside, so the "Kept on" line under the item tells the
   * truth without waiting for the page to be read again.
   */
  async function applyToTemplates() {
    if (!askTemplate || askTemplate.state === "saving") return;
    const { before, after, on } = askTemplate;
    setAskTemplate((a) => ({ ...a, state: "saving", message: "" }));
    const ids = on.map((t) => t.id);
    const { data: rows, error: readError } = await supabase
      .from("packing_template_items")
      .select("id, template_id, item, assignee")
      .in("template_id", ids);
    if (readError) {
      setAskTemplate((a) => ({
        ...a,
        state: "asking",
        message: `That did not save: ${readError.message}`,
      }));
      return;
    }
    // Exactly the lines the question named: this list, this person. Anything
    // else on the same template under a different person was never offered and
    // must not be swept up with it.
    const pairs = new Set(on.map((t) => `${t.id}::${keyPerson(t.assignee)}`));
    const isWanted = (row) =>
      String(row.item || "")
        .trim()
        .toLowerCase() === before.item.trim().toLowerCase() &&
      pairs.has(`${row.template_id}::${keyPerson(row.assignee)}`);
    const wanted = (rows || []).filter(isWanted);
    if (!wanted.length) {
      setAskTemplate((a) => ({
        ...a,
        state: "asking",
        message: "That line is no longer on the template.",
      }));
      return;
    }
    const { error } = await supabase
      .from("packing_template_items")
      .update({
        item: after.item,
        category: after.category,
        assignee: after.assignee,
        quantity: after.quantity || null,
        pet_id: after.petId || null,
      })
      .in(
        "id",
        wanted.map((row) => row.id),
      );
    if (error) {
      setAskTemplate((a) => ({
        ...a,
        state: "asking",
        message: `That did not save: ${error.message}`,
      }));
      return;
    }
    const touched = new Set(wanted.map((row) => row.template_id));
    setTemplateItems((current) =>
      current.map((row) =>
        touched.has(row.template_id) && isWanted(row)
          ? { ...row, item: after.item, assignee: after.assignee }
          : row,
      ),
    );
    setAskTemplate({
      ...askTemplate,
      state: "done",
      message: `Changed on ${listedAs(on, before.assignee)}. Trips that already exist keep the version they have.`,
    });
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
  /**
   * Say which add-on lists this trip is built from.
   *
   * Written as a replacement rather than an add or a remove, because that is
   * what it is: the row set is the answer, and taking one off is how a wrong
   * guess gets corrected. The stamp on the trip is what makes "none" mean none.
   */
  async function toggleAddOn(template) {
    if (readOnly || savingAddOn) return;
    const on = addOns.has(template.id);
    setSavingAddOn(template.id);
    setAddOnNote("");
    const { error } = on
      ? await supabase
          .from("trip_templates")
          .delete()
          .eq("trip_id", tripId)
          .eq("template_id", template.id)
      : await supabase
          .from("trip_templates")
          .insert({ trip_id: tripId, template_id: template.id });
    if (error) {
      setSavingAddOn(null);
      setAddOnNote(`That did not save: ${error.message}`);
      return;
    }
    const stamped = await supabase
      .from("trips")
      .update({ templates_chosen_at: new Date().toISOString() })
      .eq("id", tripId);
    setSavingAddOn(null);
    if (stamped.error) {
      setAddOnNote(`That did not save: ${stamped.error.message}`);
      return;
    }
    setAddOns((prev) => {
      const next = new Set(prev);
      if (on) next.delete(template.id);
      else next.add(template.id);
      return next;
    });
    setEverChosen(true);
    setAddOnNote(
      on
        ? `${template.name} no longer counts for this trip. Nothing was removed from the list below — this decides what a rebuilt list starts from and which template changes reach this trip.`
        : `${template.name} counts for this trip now. Nothing was added to the list below yet: rebuild the list, or push the templates from the Packing templates tab, to bring its items in.`,
    );
  }

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
        message: `Off ${chosen.name}. Trips you build from that template will not start with it.`,
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
            message: `Kept on ${chosen.name}. Trips you build from that template will start with it.`,
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

  /**
   * Open the form on one category, or on nothing in particular.
   *
   * Everything the last press left behind is cleared, because a note saying
   * "Added, and kept on Meyer Family Base" is about the item you just wrote and
   * not about the one you are about to write, and a template pill left pressed
   * would quietly keep the next line too.
   */
  function startAdd(category) {
    setAdding(category);
    setEditingId(null);
    setNewItem("");
    setNewCategory(category === NEW_CATEGORY ? "" : category);
    setNewPetId("");
    setNewTemplates(new Set());
    setNewLastMinute(false);
    setNewLastMinuteSet(false);
    setNewNote("");
  }

  async function add(e) {
    e.preventDefault();
    const name = newItem.trim();
    if (!name) return;
    setNewNote("");

    const category = (newCategory || "General").trim();
    const petId = newPetId || null;
    const { error } = await supabase.from("packing_items").insert({
      trip_id: tripId,
      item: name,
      category,
      assignee: newAssignee,
      pet_id: petId,
      // Still guessed from the name, but the guess is on screen above this
      // button, so what gets written is what the person saw and left alone.
      last_minute: newIsLastMinute,
      sort_order: topOfCategory(category),
    });
    if (error) {
      setNewNote("That did not save to this trip.");
      return;
    }

    // Then the standing lists, if any were picked. Done after the trip row so a
    // template failure never costs you the item you actually came here to add.
    const wanted = templates.filter((t) => newTemplates.has(t.id));
    const kept = [];
    const failed = [];
    for (const template of wanted) {
      // Already on that list for that person? Say so rather than adding a
      // second one — a template holding the same thing twice quietly puts it on
      // every future trip twice.
      const { data: already } = await supabase
        .from("packing_template_items")
        .select("id")
        .eq("template_id", template.id)
        .ilike("item", name)
        .eq("assignee", newAssignee)
        .limit(1);
      if (already && already.length) {
        kept.push(template.name);
        setTemplateItems((rows) => [
          ...rows,
          { template_id: template.id, item: name, assignee: newAssignee },
        ]);
        continue;
      }
      const { error: templateError } = await supabase
        .from("packing_template_items")
        .insert({
          template_id: template.id,
          item: name,
          category,
          assignee: newAssignee,
          // Which animal it is for travels with it, so a line invented mid-trip
          // keeps its meaning on every trip after this one.
          pet_id: petId,
          sort_order: 999,
          created_by: userId,
        });
      if (templateError) failed.push(template.name);
      else {
        kept.push(template.name);
        // Kept in step with what was just written so the line under the item,
        // and the pills in the edit form, tell the truth without another read.
        setTemplateItems((rows) => [
          ...rows,
          { template_id: template.id, item: name, assignee: newAssignee },
        ]);
      }
    }

    // Left open on purpose, on the same category: remembering one forgotten
    // thing is how you remember the next two.
    setNewItem("");
    setNewPetId("");
    setNewTemplates(new Set());
    setNewLastMinute(false);
    setNewLastMinuteSet(false);
    setNewNote(
      failed.length
        ? `Added to this trip. It did not save to ${failed.join(" or ")}.`
        : kept.length
          ? `Added, and kept on ${kept.join(" and ")}. Trips you build from ${kept.length > 1 ? "those templates" : "that template"} will start with it; trips you have already made do not change.`
          : "",
    );
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

  /**
   * One line of the list, drawn the same whether it is sitting in its category
   * or pulled out into the block above. Extracted for exactly that reason: the
   * two places have to agree about the tick, the badge, the edit form and the
   * remove button, and the only way to be sure of that is for there to be one
   * of them.
   */
  function itemRow(item) {
    return editingId === item.id ? (
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
            <CategoryPicker
              value={editDraft.category}
              options={categories}
              onChange={(category) => setEditDraft({ ...editDraft, category })}
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
          <label className="flex items-start gap-2 text-xs font-semibold text-ink-soft">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-teal"
              checked={!!editDraft.lastMinute}
              onChange={(e) =>
                setEditDraft({ ...editDraft, lastMinute: e.target.checked })
              }
            />
            <span>
              Cannot be packed ahead
              <span className="ml-1 font-normal text-ink-faint">
                {"\u2014"} stays out until the morning you leave
              </span>
            </span>
          </label>
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
                    toTemplate?.state === "saving" && toTemplate?.id === t.id;

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
                  toTemplate?.state === "error" ? "text-rose" : "text-ink-soft"
                }`}
              >
                {toTemplate?.message ||
                  `Tapping a template saves your changes and keeps ${
                    editDraft.assignee === "Shared"
                      ? "this item"
                      : `${editDraft.assignee}\u2019s copy`
                  } on it, so trips you build from that template start with it. Tap it again to take it off. Trips you have already made do not change.`}
              </p>
            </div>
          )}
        </form>
      </li>
    ) : (
      <li
        key={item.id}
        className="group flex items-start gap-3 border-b border-sand/80 px-4 py-2 pr-2.5 last:border-0"
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
            <span className={`text-sm ${item.is_packed ? "strike-done" : ""}`}>
              {item.item}
              {item.quantity ? (
                <span className="text-ink-soft"> ×{item.quantity}</span>
              ) : null}
            </span>
            <span className={`chip ${assigneeColor(item.assignee)}`}>
              {item.assignee}
            </span>
            {item.last_minute && (
              <span
                className="chip border border-amber/40 bg-amber/10 text-amber"
                title="Cannot be packed ahead"
              >
                {LAST_MINUTE_LABEL}
              </span>
            )}
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
            <p className="mt-0.5 text-xs text-ink-soft">{item.notes}</p>
          )}
          {keptLine(item) && (
            <p className="mt-0.5 text-xs text-ink-faint">{keptLine(item)}</p>
          )}
        </div>
        {/* Both of these were bare words with no padding: the cross was a
            12px glyph in a 12px box, which is a fine mouse target and a
            terrible thumb one. They are 36px squares now -- the icon still
            looks the same size, but the thing you press is three times
            wider -- with negative margin so the row does not get taller or
            wider to accommodate them. */}
        <div className="no-print flex shrink-0 items-center gap-0.5">
          {!readOnly && (
            <button
              onClick={() => startEdit(item)}
              className="flex h-9 items-center rounded-full px-2 text-xs font-bold uppercase tracking-wide text-teal transition hover:bg-teal-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
              aria-label={`Edit ${item.item}`}
            >
              Edit
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => remove(item)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft/60 transition hover:bg-rose/10 hover:text-rose focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
              aria-label={`Remove ${item.item}`}
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
          )}
        </div>
      </li>
    );
  }

  // The lists a trip can be built from on top of the base one. An animal's list
  // is not one of these: whether the dog is coming is decided by the roster, not
  // by what kind of trip this is.
  const addOnTemplates = (templates || []).filter(
    (t) => t && !t.is_base && !t.pet_id,
  );

  // What is on, said in words, for the shut strip. The base list is always in
  // and is named as such, so a trip with no add-ons still reads as built from
  // something rather than from nothing.
  const onNames = [
    "the base list",
    ...addOnTemplates.filter((t) => addOns.has(t.id)).map((t) => t.name),
  ].join(", ");

  const packed = items.filter((i) => i.is_packed).length;
  const pct = items.length ? Math.round((packed / items.length) * 100) : 0;

  // Written once because both wordings below need it, and a link whose text
  // drifted between the two would read as two different places.
  const templatesLink = (
    <Link
      href="/packing"
      className="font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
    >
      edit the packing templates
    </Link>
  );

  /**
   * The form for a new line, opened on one category.
   *
   * One function rather than one per place, because the trip's list and the
   * "somewhere new" card have to agree about every question it asks -- who packs
   * it, which animal it is for, whether it can be packed ahead, and which
   * standing lists should keep it -- and the only way to be sure of that is for
   * there to be one of them.
   */
  function addForm(category) {
    return (
      <form
        onSubmit={add}
        className="no-print space-y-3 border-b border-[var(--line)] bg-teal/5 px-4 py-3"
      >
        <div
          className={`grid gap-2 ${
            pets.length
              ? "sm:grid-cols-[2fr_1fr_auto_auto_auto]"
              : "sm:grid-cols-[2fr_1fr_auto_auto]"
          }`}
        >
          <input
            className="field"
            placeholder={
              category === NEW_CATEGORY
                ? "What is it?"
                : `Something else for ${category}`
            }
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            autoFocus
            required
          />
          {/* Always asked, and answered before you get here: pressing Add on
              the Toiletries card fills this in with Toiletries. It was hidden
              for a while on the reasoning that the press had already said it,
              which is true right up to the moment you notice the thing you are
              typing belongs somewhere else -- and then the only way to move it
              was to add it in the wrong place and edit it. */}
          <CategoryPicker
            value={newCategory}
            options={categories}
            onChange={setNewCategory}
            required
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
          <div className="flex gap-2">
            <button className="btn btn-primary">Add</button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAdding(null)}
            >
              Done
            </button>
          </div>
        </div>

        {/* The two questions that used to require adding the item, finding it
              again, and opening its edit form.

              Both are about the same thing from different directions: whether an
              item can wait in a bag, and whether it should be waiting on every
              trip. The moment you remember a thing the family forgot is the
              moment you know both answers, and it is the only moment you will
              reliably know them. */}
        <label className="flex items-start gap-2 text-xs font-semibold text-ink-soft">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-teal"
            checked={newIsLastMinute}
            onChange={(e) => {
              setNewLastMinute(e.target.checked);
              setNewLastMinuteSet(true);
            }}
          />
          <span>
            Cannot be packed ahead
            <span className="ml-1 font-normal text-ink-faint">
              {"\u2014"} stays out until the morning you leave
              {guessedLastMinute && !newLastMinuteSet
                ? ", ticked from what you typed"
                : ""}
            </span>
          </span>
        </label>

        {templates.length > 0 && (
          <div className="border-t border-sand pt-3">
            <p
              className="text-xs font-semibold text-ink-soft"
              id="packing-new-keep-label"
            >
              Also keep for future trips
            </p>
            <div
              className="mt-1.5 flex flex-wrap gap-1.5"
              role="group"
              aria-labelledby="packing-new-keep-label"
            >
              {templates.map((t) => {
                const on = newTemplates.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setNewTemplates((prev) => {
                        const next = new Set(prev);
                        if (next.has(t.id)) next.delete(t.id);
                        else next.add(t.id);
                        return next;
                      })
                    }
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      on
                        ? "border-teal bg-teal text-white"
                        : "border-dashed border-[var(--line)] bg-white text-ink-soft hover:border-teal/50 hover:text-teal"
                    }`}
                  >
                    {/* The mark carries the state as well as the color,
          because a filled pill and an empty one are the same
          pill to anyone who does not see color. */}
                    <span aria-hidden="true">{on ? "\u2713" : "+"}</span>
                    {t.name}
                    {t.is_base ? " (base)" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {newNote && (
          <p
            className={`text-xs ${
              newNote.includes("did not") ? "text-rose" : "text-ink-soft"
            }`}
            role="status"
          >
            {newNote}
          </p>
        )}
      </form>
    );
  }

  return (
    <section>
      {/* Above the progress bar, because the point of a packing tip is to be read
          before the list is worked through rather than after.

          No button of its own. Asking for a look is one decision about the whole
          trip, and it lives on the Tips tab; three buttons that each start
          the same five-place walk, on three tabs, is three ways to spend the
          same minute and no way to tell which one you already pressed. What
          arrives here still arrives here.

          And because there is no button, there is nothing to say when nothing
          was found: the section hides itself rather than heading a paragraph
          about its own emptiness. The two empty wordings this used to pass went
          with it. */}
      <ProTips
        tips={tips}
        today={today}
        tripId={tripId}
        scope="packing"
        everLooked={everLooked}
        canLook={false}
        heading="Before you pack"
        readOnly={readOnly}
      />
      {/* What this trip counts as, and where the list came from, in one strip.
 
          These were two things: a panel here with a heading and a paragraph of
          its own, and a separate sentence further down saying the list started
          from the templates and that editing them changes future trips. They are
          the same subject read at the same moment -- "where did these lines come
          from, and what happens if I change them" -- so they are one strip now,
          and a shorter one. The heading is gone because "Built from" beside the
          chips is the heading. */}
      {addOnTemplates.length > 0 ? (
        <div className="no-print mb-3 rounded-[0.875rem] border border-[var(--line)] bg-sand/40 px-3.5 py-2.5">
          {/* Closed, this is one line: what the list was built from, named, and
              a word to open it. Open, it is what it always was -- the add-ons to
              tap, and the two or three sentences about which trips a change
              reaches. */}
          <button
            type="button"
            onClick={() => setBuiltOpen((v) => !v)}
            aria-expanded={builtOpen}
            aria-controls="built-from-detail"
            className="flex w-full items-center gap-x-2.5 gap-y-1 text-left"
          >
            <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
              Built from
            </span>
            {!builtOpen && (
              <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                {onNames || "the base list"}
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs font-bold uppercase tracking-wide text-teal">
              {builtOpen ? "Hide" : readOnly ? "Show" : "Change"}
            </span>
          </button>
          {/* A word about what is on, when the strip is shut and something
              needs saying anyway: a guess nobody has confirmed, or the note
              from the tap that just saved. */}
          {!builtOpen && !everChosen && (
            <p className="mt-1 text-xs text-ink-soft">
              A guess, from the lines the trip already carries.
            </p>
          )}
          {!builtOpen && addOnNote && (
            <p className="mt-1 text-xs font-semibold text-ink-soft">
              {addOnNote}
            </p>
          )}
          <div
            id="built-from-detail"
            hidden={!builtOpen}
            className="mt-2.5 border-t border-[var(--line)] pt-2.5"
          >
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
              {addOnTemplates.map((t) => {
                const on = addOns.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleAddOn(t)}
                    disabled={readOnly || Boolean(savingAddOn)}
                    aria-pressed={on}
                    className={`chip border text-left ${
                      on
                        ? "border-teal/40 bg-teal/10 font-semibold text-teal"
                        : "border-[var(--line)] bg-white text-ink-soft"
                    } ${readOnly ? "cursor-default" : ""} ${
                      savingAddOn === t.id ? "opacity-60" : ""
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {t.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              Every trip starts from the base list; add-ons stack on top.
              Changes here stay on this trip — {templatesLink} to change what
              future trips start with.
            </p>
            {!everChosen && (
              <p className="mt-1.5 text-xs text-ink-soft">
                Nobody has said which apply, so this is a guess from the lines
                the trip already carries. Tap the ones that do — or tap one on
                and off again to record that none of them do.
              </p>
            )}
            {addOnNote && (
              <p className="mt-1.5 text-xs font-semibold text-ink-soft">
                {addOnNote}
              </p>
            )}
          </div>
        </div>
      ) : (
        // No add-ons exist to choose between, so there is nothing to lay out and
        // the sentence stands on its own rather than in a box of its own.
        <p className="no-print mb-3 text-xs leading-relaxed text-ink-soft">
          This list started from the family&rsquo;s packing templates. Changes
          here stay on this trip — {templatesLink} to change what future trips
          start with.
        </p>
      )}
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
      {/* Asked after the save, not before it: the change to this trip is never
          in doubt, and holding it hostage to a second question about future
          trips would be the wrong way round. The card sits here rather than on
          the row because the row has closed by the time there is anything to
          ask, and a question that appears where you are no longer looking is a
          question nobody answers. */}
      {askTemplate && (
        <div
          ref={askRef}
          className="no-print mb-4 rounded-2xl border border-amber/45 bg-amber/10 px-4 py-3"
        >
          {askTemplate.state === "done" ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink">{askTemplate.message}</p>
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-xs"
                onClick={() => setAskTemplate(null)}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink">
                {askTemplate.before.item === askTemplate.after.item
                  ? `You changed “${askTemplate.after.item}”, which is kept on ${listedAs(
                      askTemplate.on,
                      askTemplate.before.assignee,
                    )}.`
                  : `You renamed “${askTemplate.before.item}” to “${askTemplate.after.item}”. The old name is kept on ${listedAs(
                      askTemplate.on,
                      askTemplate.before.assignee,
                    )}.`}
              </p>
              <p className="mt-1 text-[0.8rem] leading-snug text-ink-soft">
                Change it on the template too, so trips you build from it start
                with this version? Either way, trips you have already made do
                not change.
              </p>
              {askTemplate.message && (
                <p className="mt-1.5 text-[0.8rem] font-semibold text-rose">
                  {askTemplate.message}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary px-3 py-1.5 text-xs disabled:opacity-70"
                  disabled={askTemplate.state === "saving"}
                  onClick={applyToTemplates}
                >
                  {askTemplate.state === "saving"
                    ? "Changing…"
                    : askTemplate.on.length > 1
                      ? "Change the templates too"
                      : `Change ${listedAs(
                          askTemplate.on,
                          askTemplate.before.assignee,
                        )} too`}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-1.5 text-xs"
                  disabled={askTemplate.state === "saving"}
                  onClick={() => setAskTemplate(null)}
                >
                  Just this trip
                </button>
              </div>
            </>
          )}
        </div>
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

      {/* Two ways of looking, above the pills that were already here. The box
          answers "is this already on the list", which on a hundred and eleven
          lines is the question the list is worst at; the category picker answers
          "what is under Toiletries", which used to mean scrolling past
          everything that was not. Both only appear once the list is long enough
          for either to be worth a row of screen -- a search box over eight
          items is furniture. */}
      {items.length >= 12 && (
        <div className="no-print mb-3 grid gap-2 sm:grid-cols-[1fr_13rem] sm:items-center">
          <div className="relative min-w-0">
            <input
              type="text"
              className="field pr-16"
              placeholder="Search this list"
              aria-label="Search this packing list"
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
        {canSplitAhead && (
          <button
            onClick={() => setOnlyAhead((on) => !on)}
            aria-pressed={onlyAhead}
            // Pressed in pale teal rather than solid. Not amber, because amber is
            // what the rows this pill hides are wearing and it would say the
            // opposite of what pressing it does -- and not the solid teal the
            // people wear either: on a phone this wraps onto the line under
            // Everyone, and two solid teal chips one above the other read as two
            // people chosen rather than a person and a toggle.
            title={`Hide the ${LAST_MINUTE_LABEL.toLowerCase()} things, which cannot go in a bag yet`}
            className={`chip border ${
              onlyAhead
                ? "border-teal bg-teal-soft text-teal"
                : "border-[var(--line)] bg-white text-ink-soft"
            }`}
          >
            Can pack ahead
          </button>
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

      <div className="space-y-4">
        {/* One list, in its categories, with the things that cannot go in a bag
            early wearing a Last minute chip where they sit.
 
            There used to be a second card pinned above this one, gathering those
            rows together once the trip was three days out. It was a copy of part
            of the list living beside the list, which is one more place to look and
            one more place for a tick to seem not to have happened. The chip on the
            row says the same thing in the place you are already reading, and the
            Can pack ahead pill above puts them out of the way on the evenings
            when they are not the work. */}
        {/* A search that finds nothing has to say so. Without this the list
            simply empties, which reads as though the trip lost its packing
            list rather than as though the word was wrong -- and there is
            nowhere obvious to press to get back. */}
        {!grouped.length && (find || onlyCategory !== "all" || onlyAhead) && (
          <div className="card px-4 py-6 text-center">
            <p className="text-sm font-semibold text-ink">
              {find
                ? `Nothing on this list looks like “${find}”.`
                : onlyCategory !== "all"
                  ? `Nothing under ${onlyCategory}.`
                  : "Nothing here can be packed ahead."}
            </p>
            <p className="mt-1 text-[0.8rem] text-ink-soft">
              {items.length} {items.length === 1 ? "item" : "items"} on the
              list, hidden by what is set above.
            </p>
            <button
              type="button"
              className="btn btn-ghost mt-3 px-3 py-1.5 text-xs"
              onClick={() => {
                setFind("");
                setOnlyCategory("all");
                setOnlyAhead(false);
              }}
            >
              Show everything again
            </button>
          </div>
        )}
        {grouped.map(([category, rows]) => (
          <div key={category} className="card overflow-hidden">
            <div className="flex items-center gap-x-3 border-b border-[var(--line)] bg-sand/60 px-4 py-2.5">
              <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                {category}
              </h3>
              {/* No packed-of-total count here any more. The bar at the top of
                  the tab already counts the whole list, and every row carries
                  its own tick, so a per-category tally was a third place saying
                  what two other places said -- and the one nobody packs by. */}
              {/* The same shape as Edit on a row, and the same shape as Add on
                  the packing templates: a small word on the header of the thing
                  it changes. Pressing it opens the form directly underneath,
                  where the new line is going to appear. */}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() =>
                    adding === category ? setAdding(null) : startAdd(category)
                  }
                  aria-expanded={adding === category}
                  className="no-print ml-auto text-xs font-bold uppercase tracking-wide text-teal"
                >
                  {adding === category ? "Close" : "+ Add"}
                </button>
              )}
            </div>
            {adding === category && addForm(category)}
            <ul>{rows.map((i) => itemRow(i))}</ul>
          </div>
        ))}
        {/* The older empty state, which means "everything here is packed".
            It steps aside when the list is empty because of a search: the card
            above already says why, and two cards saying different things about
            the same emptiness is worse than either. */}
        {grouped.length === 0 && !find && onlyCategory === "all" && (
          <p className="card p-6 text-center text-sm text-ink-soft">
            Nothing left in this view. Nice work.
          </p>
        )}

        {/* The one add that no category card can offer, because the card does
            not exist yet. Quiet and last, so it is available without being the
            first thing on a list you came to tick things off on. */}
        {!readOnly && !find && onlyCategory === "all" && (
          <div className="no-print card overflow-hidden border-dashed">
            {adding === NEW_CATEGORY ? (
              addForm(NEW_CATEGORY)
            ) : (
              <button
                type="button"
                onClick={() => startAdd(NEW_CATEGORY)}
                className="w-full px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-teal"
              >
                + Add under a new category
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
