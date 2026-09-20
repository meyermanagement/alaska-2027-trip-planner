import { dayPackOnDay } from "@/lib/childView/days";

export default function ChildDayPack({ trip, day }) {
  if (!day || day === "Unscheduled") return null;
  const items = dayPackOnDay(trip, day);
  return <section className="card p-5" aria-labelledby="child-day-pack-heading">
    <h3 id="child-day-pack-heading" className="text-lg font-semibold">Your day pack</h3>
    {!items.length ? <p className="mt-2 text-sm text-ink-soft">No day-pack items assigned to you for this day.</p> :
      <ul className="mt-3 space-y-3">{items.map(item => <li key={item.id} className="flex items-start justify-between gap-3">
        <div className="min-w-0 break-words">
          <span className="font-medium">{item.item}</span>
          {!item.item_date && <span className="mt-1 block text-xs text-ink-soft">Every day</span>}
        </div>
        <span className={`shrink-0 text-xs ${item.is_packed ? "text-teal" : "text-ink-soft"}`}>
          {item.is_packed ? "Ready to carry" : "To bring"}
        </span>
      </li>)}</ul>}
  </section>;
}
