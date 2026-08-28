import { oneOrShared } from "../people";

// Turning somebody else's packing list into the contents of a packing template.
//
// Kept apart from the route that writes it so the rules can be tested on their
// own, because the failure this guards against is quiet: ninety items copied
// with one silently dropped, or the same shirt listed twice, is not something
// anyone notices until a trip is packed from it.

// High enough for a full family list, low enough that a bad copy cannot bury the
// screen it lands on.
export const MAX_COPIED_ITEMS = 200;

/**
 * @param source rows with category, item, assignee, quantity
 * @param templateId the list they are being copied onto
 * @param categories optional names to keep; everything else is left behind
 * @param limit how many to take at most
 * @param excludeItems item names the destination should not restate
 * @param travelerNames the family's travelers, so a name that belongs to nobody
 *        lands on "Shared" rather than being carried forward as written
 * @returns { items, skipped } — skipped counts what excludeItems accounted for
 */
export function copiedTemplateItems(
  source,
  {
    templateId,
    categories,
    limit = MAX_COPIED_ITEMS,
    excludeItems,
    travelerNames = [],
  } = {},
) {
  const wanted =
    Array.isArray(categories) && categories.length
      ? new Set(categories.map((c) => String(c).trim().toLowerCase()))
      : null;

  // Add-on lists are layered on top of the base list when a trip is built, so
  // anything the base already covers must not be restated here. Copying a whole
  // trip list into an add-on otherwise duplicates the base, and every future
  // trip is built with both copies.
  //
  // Matched on the item name alone, deliberately, not name and person: the base
  // saying "Shared" already means the family packs it, so listing it again for
  // one person is the same duplicate wearing a different label.
  const excluded =
    excludeItems instanceof Set
      ? excludeItems
      : new Set(
          (Array.isArray(excludeItems) ? excludeItems : [])
            .map((n) =>
              String(n || "")
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean),
        );

  const seen = new Set();
  const items = [];
  let skipped = 0;
  for (const row of Array.isArray(source) ? source : []) {
    const item = String(row?.item || "").trim();
    if (!item) continue;

    // The column is NOT NULL with this default, so an untidy source row still
    // lands somewhere findable rather than failing the whole copy.
    const category = String(row?.category || "").trim() || "General";
    if (wanted && !wanted.has(category.toLowerCase())) continue;

    if (excluded.has(item.toLowerCase())) {
      skipped += 1;
      continue;
    }

    // Settled against the travelers rather than copied as written: a stray name on
    // a base list would otherwise reach every trip the family ever takes.
    const assignee = oneOrShared(row?.assignee, travelerNames);

    // A trip's list can hold the same thing twice — two people adding it, or a
    // generated list overlapping one typed by hand. A packing template should not
    // inherit that, or every future trip starts with the duplicate.
    const key = `${item.toLowerCase()}|${assignee.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      template_id: templateId,
      category,
      item,
      assignee,
      quantity: row?.quantity || null,
      sort_order: items.length,
    });
    if (items.length >= limit) break;
  }
  return { items, skipped };
}
