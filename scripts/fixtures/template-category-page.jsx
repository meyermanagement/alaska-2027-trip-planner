import Templates from "@/app/packing/Templates";
const items = [
  ["Shirts", "Clothes", "Mark"], ["Fleece", "Clothes", "Steph"],
  ["Jacket", "Clothes", "Veda"], ["Toothbrush", "Toiletries", "Mark"],
  ["Sunscreen", "Toiletries", "Shared"], ["Phone charger", "Electronics", "Steph"],
  ["Binoculars", "Day pack", "Shared"], ["Water bottle", "Day pack", "Veda"],
  ["Snacks", "Day pack", "Shared"], ["Passport", "Documents", "Mark"],
  ["Travel insurance", "Documents", "Shared"], ["Spare glasses", "", "Old name"],
].map(([item, category, assignee], i) => ({
  id: `item-${i}`, template_id: "base", item, category, assignee,
  quantity: i === 0 ? "4" : null, last_minute: i === 3, sort_order: i,
}));
export default function Fixture() {
  return <main className="mx-auto max-w-3xl px-4 py-8">
    <h1 className="mb-4 font-display text-2xl">Packing template</h1>
    <Templates travelers={["Mark", "Steph", "Veda", "New traveler"]}
      templates={[{ id: "base", name: "Every trip", is_base: true }]} items={items} />
  </main>;
}
