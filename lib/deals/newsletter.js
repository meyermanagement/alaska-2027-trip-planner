import { monthsIn } from "./parse";
import { aaAwardFares } from "./award";
import { destinationAwardFares } from "./destination-awards";

/** Remove tracking URLs before any text budget; never send account links to AI. */
export function readableFareText(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/https?:\/\/[^\s<>]+/g, "")
    .replace(/mailto:[^\s<>]+/g, "")
    .replace(/\r/g, "")
    // Some providers concatenate an emphasized heading with its first route.
    .replace(/(\([A-Z]{3}\))\*+(?=[A-Za-z])/g, "$1\n")
    // Forwarding providers can double Markdown emphasis to ****Heading****.
    .replace(/^[ \t]*\*+|\*+[ \t]*$/gm, "");
}

function tableContext(clean) {
  const header = clean.split(/Departure Cities/i)[0];
  // Destination lists precede Flying/Booking Options. Never infer direction
  // from whether an airport happens to be one of this household's airports.
  const offer = header.split(/^\s*Flying\b|^\s*Booking Options\b|^\s*Book with\b/im)[0];
  const destinations = new Set(
    [...offer.matchAll(/\(([A-Z]{3}(?:,\s*[A-Z]{3})*)\)/g)]
      .flatMap(match => match[1].split(/,\s*/)),
  );
  return { destinations, originHeadings: /\bdestinations below\b/i.test(offer) };
}

/**
 * Exact "Departure Cities" tables: each heading owns its following price rows.
 * No ten-fare limit, no headline price, and no guessing which airport owns a fare.
 * Unrecognized formats fall back to the model, not a partial successful parse.
 */
export function newsletterFares(text, airports = []) {
  const clean = readableFareText(text);
  const awards = aaAwardFares(clean, airports);
  if (awards.complete) {
    // Route availability remains separate from booking-program prices.
    awards.fares = awards.fares.map((fare) => {
      const line = clean.replace(/\*/g, "").match(new RegExp(`${fare.origin}-${fare.destination_code}:\\s*([^\\n]+)`, "i"))?.[1];
      return { ...fare, travel_months: monthsIn(line || ""), notes: line || null };
    });
    return awards;
  }
  const context = tableContext(clean);
  const destinationAwards = destinationAwardFares(clean, airports, context.destinations);
  if (destinationAwards.recognized) return destinationAwards;
  const section = clean.match(/(?:^|\n)\s*\*{0,2}Departure Cities\*{0,2}\s*\n([\s\S]*?)(?=\n\s*\*{0,2}How to Book\b|$)/i);
  if (!section || /\b(?:CAD|EUR|GBP|AUD)\b|[€£]/.test(section[1]))
    return { complete: false, fares: [] };
  const wanted = new Set(airports.map((a) => String(a.code).toUpperCase()));
  const availability = clean.match(/^.*Full availability:[^\n]+/im)?.[0]
    || clean.match(/^\s*Best:[^\n]+/im)?.[0] || "";
  const airline = clean.match(/^\s*Flying ([^\n(]+)/im)?.[1]?.trim();
  // Only the offer header describes the common cabin, not footer upsell ads.
  const header = clean.slice(0, section.index);
  const cabin = /\bbusiness(?: class)?\b|\bbiz class\b/i.test(header) ? "business"
    : /\bpremium economy\b/i.test(header) ? "premium"
      : /\bfirst class\b/i.test(header) ? "first" : "economy";
  const fares = [];
  const basisText = clean.match(/\ball fares (?:are )?(?:round[\s-]*trip|one[\s-]*way)\b/i)?.[0] || "";
  let group = null;
  let routes = 0;
  let complete = true;
  for (const raw of section[1].split("\n")) {
    const line = raw.replace(/^[\s*•]+|[\s*]+$/g, "");
    if (!line || /^\(All fares (?:round-trip|one-way),?\s*\*?nonstop\)$/i.test(line)) continue;
    const heading = line.match(/^([^$()]+)\(([A-Z]{3})\)$/);
    if (heading) {
      group = { name: heading[1].trim(), code: heading[2],
        destination: context.destinations.has(heading[2]) };
      if (!group.destination && !context.originHeadings) complete = false;
      continue;
    }
    const fare = line.match(/^([^$()]+)\(([A-Z]{3})\)\s*[-–—]\s*\$([\d,]+(?:\.\d{2})?)$/);
    if (!group || !fare) { complete = false; continue; }
    routes++;
    if (!group.destination && !context.originHeadings) continue;
    const origin = group.destination ? fare[2] : group.code;
    if (wanted.size && !wanted.has(origin)) continue;
    fares.push({
      origin, destination: group.destination ? group.name : fare[1].trim(),
      destination_code: group.destination ? group.code : fare[2],
      price: Number(fare[3].replace(/,/g, "")), cabin, airline,
      price_basis_text: basisText,
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
  const context = tableContext(clean);
  // Unknown and destination-headed layouts must reach the fallback intact.
  // Prune only a positively identified origin-headed matrix.
  if (!context.originHeadings || context.destinations.size) return clean;
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
