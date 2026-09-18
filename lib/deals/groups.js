// Display grouping only: each route keeps its saved identity and verdict.
// Never infer a shared email from a sender name, date, or booking URL.
export function groupFareAlerts(deals = []) {
  const groups = new Map();
  deals.forEach((deal, index) => {
    const origin = String(deal.origin || "").trim().toUpperCase();
    const message = String(deal.message_id || "").trim();
    const key = JSON.stringify([
      message || `unlinked:${deal.id || index}`,
      origin || `unknown:${deal.id || index}`,
    ]);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        origin: origin || "Unknown departure airport",
        sourceName: deal.source_name || "Forwarded fare alert",
        createdAt: deal.created_at || null,
        deals: [],
      });
    }
    groups.get(key).deals.push(deal);
  });
  return Array.from(groups.values(), (group) => {
    const prices = group.deals
      .map((deal) => Number(deal.price))
      .filter((price) => Number.isFinite(price) && price > 0);
    const destinations = [...new Set(
      group.deals.map((deal) => String(deal.destination || "").trim())
        .filter(Boolean).map((name) => name.toLowerCase()),
    )];
    return {
      ...group,
      destinationCount: destinations.length,
      lowestPrice: prices.length ? Math.min(...prices) : null,
    };
  });
}
