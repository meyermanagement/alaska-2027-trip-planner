// Calendar periods, not rolling 30/365-day windows. Date-only values must not
// move to the previous day when the browser or server has a different timezone.
export function historyDay(value, timeZone = "America/Chicago") {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function historyPeriod(value, today) {
  const day = historyDay(value);
  const current = historyDay(today);
  if (!current) throw new Error("History needs a valid current day.");
  if (!day) return { key: "unknown", label: "Date unknown", rank: 9999, day: "" };
  const year = Number(day.slice(0, 4)), month = Number(day.slice(5, 7));
  const thisYear = Number(current.slice(0, 4)), thisMonth = Number(current.slice(5, 7));
  const monthsAgo = (thisYear - year) * 12 + thisMonth - month;
  if (day > current) return { key: "future", label: "Upcoming", rank: -1, day };
  if (monthsAgo === 0) return { key: `month-${year}-${month}`, label: "This month", rank: 0, day };
  if (monthsAgo === 1) return { key: `month-${year}-${month}`, label: "Last month", rank: 1, day };
  if (year === thisYear) return { key: `year-${year}`, label: "Earlier this year", rank: 2, day };
  const yearsAgo = thisYear - year;
  return { key: `year-${year}`, label: yearsAgo === 1 ? "Last year" : `${yearsAgo} years ago`, rank: yearsAgo + 2, day };
}

export function groupHistory(items, getDate, today) {
  const groups = new Map();
  for (const item of items) {
    const period = historyPeriod(getDate(item), today);
    if (!groups.has(period.key)) groups.set(period.key, { ...period, items: [] });
    groups.get(period.key).items.push({ item, day: period.day });
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank).map(group => ({
    ...group, items: group.items.sort((a, b) => b.day.localeCompare(a.day)).map(row => row.item),
  }));
}

export function newestHistoryDate(values) {
  return values.map(value => historyDay(value)).filter(Boolean).sort().at(-1) || null;
}
