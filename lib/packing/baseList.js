// Shared by the real packing screen and its review harness.
export const PACKING_ESSENTIALS = [
  ["Underwear", "Clothing"], ["Socks", "Clothing"], ["Sleepwear", "Clothing"],
  ["Toothbrush", "Toiletries"], ["Toothpaste", "Toiletries"], ["Deodorant", "Toiletries"],
  ["Phone charger", "Electronics"], ["Charging cable", "Electronics"],
].map(([item, category]) => ({ item, category }));

const normal = value => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
export const baseItemKey = row => JSON.stringify([
  normal(row.item), normal(row.assignee || "Shared"), row.pet_id || null,
]);
export function rememberCandidates(items, baseItems) {
  const known = new Set(baseItems.map(baseItemKey));
  return items.filter(row => {
    const key = baseItemKey(row);
    if (row.stashed_at || !row.item?.trim() || known.has(key)) return false;
    known.add(key);
    return true;
  });
}

export async function packingBaseRequest(tripId, action = "state", items = []) {
  const response = await fetch("/api/packing/base", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tripId, action, items }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not save your base list. Try again.");
  return result;
}
