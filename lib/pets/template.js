// Each pet's own packing template.
//
// The first version of this generated a pet's lines fresh every time it was put
// on a trip, which meant the family could not change them. Delete "Collapsible
// bowls" because you keep a set in the car, and it came back the next time the
// dog was added to a trip. A template fixes that: the lines are a real list the
// family owns, sitting on the Templates screen beside the base list and the
// destination add-ons, editable by hand or by Aly with the tools she already
// has. Putting a pet on a trip applies its template; taking it off sets those
// lines aside.
//
// One template per pet, because a cat's things and a Labrador's things overlap
// by about two lines and a single shared "Pets" list would be wrong for both.

import { packingItemsFor } from "./pets";

// Who a pet's lines belong to until somebody claims them. Never the pet: the
// point of keeping the animal in `pet_id` is that a person or Shared stays
// answerable for actually putting the feed in the trailer.
export const DEFAULT_OWNER = "Shared";

/** What a pet's template is called. The apostrophe is the typographic one. */
export function petTemplateName(pet) {
  const name = String(pet?.name || "").trim();
  if (!name) return "A pet\u2019s things";
  return `${name}\u2019s things`;
}

function petTemplateDescription(pet) {
  const name = String(pet?.name || "").trim() || "this pet";
  return `What ${name} needs on a trip. Added to a packing list whenever ${name} is coming, and set aside when ${name} is not. Edit it here and every future trip follows.`;
}

/**
 * The template belonging to one pet, made if it does not exist yet.
 *
 * Seeded from the pet's own record the first time, and never re-seeded after
 * that: once the family owns the list, the app does not get to put lines back.
 * An existing template with no items is left empty on purpose, because an empty
 * list is a decision somebody made.
 */
export async function ensurePetTemplate({ supabase, familyId, pet }) {
  const petId = pet?.id;
  if (!supabase || !petId)
    return { templateId: null, items: [], created: false };

  const { data: found, error: findError } = await supabase
    .from("packing_templates")
    .select("id")
    .eq("pet_id", petId)
    .maybeSingle();
  if (findError)
    return { templateId: null, items: [], error: findError.message };

  if (found?.id) {
    const { data: items, error } = await supabase
      .from("packing_template_items")
      .select("category, item, assignee, quantity, sort_order")
      .eq("template_id", found.id)
      .order("sort_order", { ascending: true });
    if (error) return { templateId: found.id, items: [], error: error.message };
    return { templateId: found.id, items: items || [], created: false };
  }

  if (!familyId) return { templateId: null, items: [], created: false };

  // The name has to be free: templates are unique per family by name, and a
  // second Bella would otherwise fail to get a list at all.
  const made = await createWithFreeName({ supabase, familyId, pet });
  if (made.error) return { templateId: null, items: [], error: made.error };

  const seed = packingItemsFor(pet).map((row, index) => ({
    template_id: made.id,
    category: row.category,
    item: row.item,
    // Who packs it, not who it is for. An animal carries nothing, so a pet's
    // lines start as the family's shared responsibility and somebody can claim
    // them by hand. `pet_id` is what says the line is about this pet.
    assignee: DEFAULT_OWNER,
    pet_id: pet.id,
    quantity: "1",
    sort_order: index,
  }));
  if (seed.length) {
    const { error } = await supabase
      .from("packing_template_items")
      .insert(seed);
    // A template with no lines is still better than no template: the family can
    // fill it in, and the next sync will find it rather than trying to make a
    // second one.
    if (error)
      return {
        templateId: made.id,
        items: [],
        created: true,
        error: error.message,
      };
  }
  return {
    templateId: made.id,
    items: seed.map(({ category, item, assignee, quantity, sort_order }) => ({
      category,
      item,
      assignee,
      quantity,
      sort_order,
    })),
    created: true,
  };
}

async function createWithFreeName({ supabase, familyId, pet }) {
  const base = petTemplateName(pet);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const name = attempt === 0 ? base : `${base} (${attempt + 1})`;
    const { data, error } = await supabase
      .from("packing_templates")
      .insert({
        family_id: familyId,
        name,
        description: petTemplateDescription(pet),
        is_base: false,
        pet_id: pet.id,
      })
      .select("id")
      .maybeSingle();
    if (data?.id) return { id: data.id };
    // 23505 is a unique violation. On the name, try the next one; on pet_id it
    // means another request made the template first, so use that one.
    if (error?.code !== "23505") return { error: error?.message || "unknown" };
    const { data: mine } = await supabase
      .from("packing_templates")
      .select("id")
      .eq("pet_id", pet.id)
      .maybeSingle();
    if (mine?.id) return { id: mine.id };
  }
  return { error: `Could not find a free name for ${base}.` };
}

/**
 * Keep a pet's template name in step with the pet's name.
 *
 * Renaming Biscuit to Bisky and leaving a template called "Biscuit's things" on
 * the Templates screen is the kind of small wrongness that makes a family stop
 * trusting the rest. The description is left alone if somebody has rewritten it.
 */
export async function renamePetTemplate({ supabase, pet, previousName }) {
  const petId = pet?.id;
  const next = String(pet?.name || "").trim();
  if (!supabase || !petId || !next) return { renamed: false };
  if (String(previousName || "").trim() === next) return { renamed: false };

  const { data: tpl } = await supabase
    .from("packing_templates")
    .select("id, name, description")
    .eq("pet_id", petId)
    .maybeSingle();
  if (!tpl?.id) return { renamed: false };

  const wasAuto =
    !previousName ||
    tpl.name === petTemplateName({ name: previousName }) ||
    /^(.+)\u2019s things( \(\d+\))?$/.test(tpl.name);
  if (!wasAuto) return { renamed: false };

  const patch = { name: petTemplateName(pet) };
  if (
    !tpl.description ||
    tpl.description === petTemplateDescription({ name: previousName })
  )
    patch.description = petTemplateDescription(pet);

  const { error } = await supabase
    .from("packing_templates")
    .update(patch)
    .eq("id", tpl.id);
  if (error) return { renamed: false, error: error.message };
  return { renamed: true, name: patch.name };
}
