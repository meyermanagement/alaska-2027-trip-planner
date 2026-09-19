import { matchesQuery } from "@/lib/packing/find";

export function templateGroups(items, { who = "all", category = "all", find = "" } = {}) {
  const grouped = new Map();
  for (const item of items) {
    const name = item.category || "General";
    if (who !== "all" && (item.assignee || "Shared") !== who) continue;
    if (category !== "all" && name !== category) continue;
    if (!matchesQuery(find, item.item, name, item.assignee)) continue;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(item);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
}
