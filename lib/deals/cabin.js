import { farePriceLabel } from "./award";

/** Human-readable cabin names, including the economy cabin previously hidden. */
export function fareCabinLabel(deal) {
  const cabin = String(deal?.cabin || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  return {
    economy: "Economy",
    premium: "Premium economy",
    "premium economy": "Premium economy",
    business: "Business class",
    "business class": "Business class",
    first: "First class",
    "first class": "First class",
  }[cabin] || "Cabin not stated";
}

export function fareOfferLabel(deal) {
  return `${farePriceLabel(deal)} · ${fareCabinLabel(deal)}`;
}

/** A group can contain different cabins; never label all rows as its cheapest. */
export function fareGroupCabinLabel(deals) {
  const labels = [...new Set(deals.map(fareCabinLabel))];
  return labels.length === 1 ? labels[0] : labels.length ? "Mixed cabins" : "Cabin not stated";
}
