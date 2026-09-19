// Curated, local-only artwork. Exact normalized aliases avoid confusing card
// variants (especially a co-branded card with its separate loyalty account).
// Artwork provenance lives in public/wallet-logos/SOURCES.md.
import catalogLogos from "./wallet-logo-catalog.json";

export const WALLET_LOGOS = [
  ...catalogLogos,
  { file: "sapphire-preferred", kind: "credit_card", aliases: ["Chase Sapphire Preferred", "Chase Sapphire Preferred Card", "Sapphire Preferred"] },
  { file: "sapphire-reserve", kind: "credit_card", aliases: ["Chase Sapphire Reserve", "Chase Sapphire Reserve Card", "Sapphire Reserve"] },
  { file: "ink-preferred", kind: "credit_card", aliases: ["Chase Ink Business Preferred", "Ink Business Preferred", "Ink Business Preferred Credit Card"] },
  { file: "amex-platinum", kind: "credit_card", aliases: ["American Express Platinum Card", "American Express Platinum", "Amex Platinum", "The Platinum Card from American Express"] },
  { file: "venture-x", kind: "credit_card", aliases: ["Capital One Venture X", "Capital One Venture X Rewards Credit Card", "Venture X"] },
  { file: "citi-executive", kind: "credit_card", aliases: ["Citi / AAdvantage Executive World Legend Mastercard", "Citi / AAdvantage Executive World Elite Mastercard", "Citi AAdvantage Executive", "Citi AAdvantage Executive Card"] },
  { file: "skymiles", kind: "airline", aliases: ["Delta SkyMiles", "Delta", "SkyMiles"] },
  { file: "aadvantage", kind: "airline", aliases: ["American AAdvantage", "American Airlines AAdvantage", "AAdvantage", "American Airlines"] },
  { file: "rapid-rewards", kind: "airline", aliases: ["Southwest Rapid Rewards", "Southwest Airlines", "Southwest"] },
  { file: "mileageplus", kind: "airline", dark: true, aliases: ["United MileagePlus", "MileagePlus", "United Airlines", "United"] },
  { file: "bonvoy", kind: "hotel", aliases: ["Marriott Bonvoy", "Marriott", "Bonvoy"] },
  { file: "ihg", kind: "hotel", aliases: ["IHG One Rewards", "IHG Rewards", "IHG Rewards Club", "IHG"] },
  { file: "hyatt", kind: "hotel", aliases: ["World of Hyatt", "Hyatt"] },
  { file: "omni", kind: "hotel", dark: true, aliases: ["Omni Hotels", "Omni Hotels & Resorts", "Omni Select Guest", "Select Guest", "Omni"] },
  { file: "avis", kind: "car", aliases: ["Avis Preferred", "Avis"] },
  { file: "hertz", kind: "car", aliases: ["Hertz Gold Plus Rewards", "Hertz Gold+", "Hertz", "Hertz Gold"] },
  { file: "sixt", kind: "car", aliases: ["SIXT ONE", "Sixt"] },
  { file: "castaway", kind: "cruise", aliases: ["Disney Cruise Line Castaway Club", "Disney Castaway Club", "Castaway Club", "Disney Cruise Line"] },
  { file: "mariner-society", kind: "cruise", aliases: ["Holland America Mariner Society", "Holland America Line Mariner Society", "Mariner Society", "Holland America", "Holland America Line"] },
];

function normalized(value) {
  return typeof value === "string" ? value.toLowerCase()
    .replace(/[®™©]/g, "").replace(/[^a-z0-9]+/g, " ").trim() : "";
}

const byName = new Map(WALLET_LOGOS.flatMap((entry) =>
  entry.aliases.map((name) => [`${entry.kind}:${normalized(name)}`, entry])));

export function walletLogo(program) {
  if (!program) return null;
  const match = byName.get(`${program.kind}:${normalized(program.brand)}`);
  return match ? { src: `/wallet-logos/${match.file}.webp`, dark: Boolean(match.dark) } : null;
}

export function walletInitials(program) {
  const words = String(program?.brand || "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase() || "?";
}
