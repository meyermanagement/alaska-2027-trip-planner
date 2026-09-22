import { awardProgramNames } from "./award";

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
        // When the email arrived, which is what a household means by "received".
        // Falls back to the save time for rows saved before the message date was
        // carried through, so an older fare still says something true.
        receivedAt: deal.email_received_at || deal.created_at || null,
        deals: [],
      });
    }
    groups.get(key).deals.push(deal);
  });
  return Array.from(groups.values(), (group) => {
    const prices = group.deals
      .filter((deal) => !deal.award_pricing)
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
      awardCount: group.deals.filter((deal) => deal.award_pricing).length,
      // Named rather than counted: a shut row saying "5 award fares" hides the
      // programs the household would have to hold points in.
      awardPrograms: awardProgramNames(
        group.deals.flatMap((deal) => deal.award_pricing?.options || []),
      ),
    };
  });
}

/**
 * The same fares, gathered by the email that carried them.
 *
 * One alert routinely quotes several departure airports, and grouped by airport
 * alone those became sibling cards with nothing saying they were one message --
 * so "clear whole email" appeared to reach fares the card never showed. Here the
 * email is the card and each airport is a chip inside it.
 *
 * Display grouping only, on the same rule as groupFareAlerts: a shared email is
 * never inferred from a sender name, a date, or a booking URL. A fare with no
 * message identity stands alone.
 */
export function groupFareEmails(deals = []) {
  const emails = new Map();
  deals.forEach((deal, index) => {
    const message = String(deal.message_id || "").trim();
    const key = message || `unlinked:${deal.id || index}`;
    if (!emails.has(key)) emails.set(key, { key, deals: [] });
    emails.get(key).deals.push(deal);
  });
  return Array.from(emails.values(), (email) => {
    const airports = groupFareAlerts(email.deals);
    const prices = email.deals
      .filter((deal) => !deal.award_pricing)
      .map((deal) => Number(deal.price))
      .filter((price) => Number.isFinite(price) && price > 0);
    const awardDeals = email.deals.filter((deal) => deal.award_pricing);
    return {
      key: email.key,
      messageId: String(email.deals[0]?.message_id || "").trim() || null,
      sourceName: airports[0].sourceName,
      receivedAt: airports[0].receivedAt,
      createdAt: airports[0].createdAt,
      airports,
      // Airport order, so the rows under a chip and the count on it agree.
      deals: airports.flatMap((airport) => airport.deals),
      fareCount: email.deals.length,
      lowestPrice: prices.length ? Math.min(...prices) : null,
      awardCount: awardDeals.length,
      awardPrograms: awardProgramNames(
        awardDeals.flatMap((deal) => deal.award_pricing?.options || []),
      ),
    };
  });
}
