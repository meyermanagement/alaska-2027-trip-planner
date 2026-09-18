import { monthsIn } from "./parse";

/** Remove tracking URLs before any text budget; never send account links to AI. */
export function readableFareText(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/https?:\/\/[^\s<>]+/g, "")
    .replace(/mailto:[^\s<>]+/g, "")
    .replace(/\r/g, "");
}

/**
 * Exact "Departure Cities" tables: each heading owns its following price rows.
 * No ten-fare limit, no headline price, and no guessing which airport owns a fare.
 * Unrecognized formats fall back to the model, not a partial successful parse.
 */
export function newsletterFares(text, airports = []) {
  const clean = readableFareText(text);
  const section = clean.match(/(?:^|\n)\s*\*{0,2}Departure Cities\*{0,2}\s*\n([\s\S]*?)(?=\n\s*\*{0,2}How to Book\b|$)/i);
  if (!section || /\b(?:CAD|EUR|GBP|AUD)\b|[€£]/.test(section[1]))
    return { complete: false, fares: [] };
  const wanted = new Set(airports.map((a) => String(a.code).toUpperCase()));
  const availability = clean.match(/^.*Full availability:[^\n]+/im)?.[0]
    || clean.match(/^\s*Best:[^\n]+/im)?.[0] || "";
  const airline = clean.match(/^\s*Flying ([^\n(]+)/im)?.[1]?.trim();
  // Only the offer header describes the common cabin, not footer upsell ads.
  const header = clean.slice(0, section.index);
  const cabin = /\bbusiness(?: class)?\b/i.test(header) ? "business"
    : /\bpremium economy\b/i.test(header) ? "premium"
      : /\bfirst class\b/i.test(header) ? "first" : "economy";
  const fares = [];
  let origin = null;
  let routes = 0;
  let complete = true;
  for (const raw of section[1].split("\n")) {
    const line = raw.replace(/^[\s*•]+|[\s*]+$/g, "");
    if (!line || /^\(All fares round-trip,?\s*\*?nonstop\)$/i.test(line)) continue;
    const heading = line.match(/^[^$()]+\(([A-Z]{3})\)$/);
    if (heading) { origin = heading[1]; continue; }
    const fare = line.match(/^([^$()]+)\(([A-Z]{3})\)\s*[-–—]\s*\$([\d,]+(?:\.\d{2})?)$/);
    if (!origin || !fare) { complete = false; continue; }
    routes++;
    if (wanted.size && !wanted.has(origin)) continue;
    fares.push({
      origin, destination: fare[1].trim(), destination_code: fare[2],
      price: Number(fare[3].replace(/,/g, "")), cabin, airline,
      travel_months: monthsIn(availability),
      notes: availability.replace(/^[\s(*]+|[\s*)]+$/g, "")
        || "Check travel dates with the airline.",
    });
  }
  return { complete: complete && routes > 0, fares };
}

/** Focus fallback extraction on the household, keeping prose for date context. */
export function fareReadInput(text, airports = []) {
  const clean = readableFareText(text);
  const wanted = new Set(airports.map((a) => String(a.code).toUpperCase()));
  let keep = true;
  let inTable = false;
  return clean.split("\n").filter((line) => {
    if (/^\s*\*{0,2}Departure Cities/i.test(line)) inTable = true;
    if (/^\s*\*{0,2}How to Book/i.test(line)) { inTable = false; keep = true; }
    if (inTable && wanted.size) {
      const heading = line.replace(/^[\s*]+|[\s*]+$/g, "").match(/^[^$()]+\(([A-Z]{3})\)$/);
      if (heading) keep = wanted.has(heading[1]);
    }
    return keep;
  }).join("\n");
}
