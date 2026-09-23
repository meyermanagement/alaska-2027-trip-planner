import { consolidateAwardRoutes, validateAwardPricing } from "./award";
import { monthsIn } from "./parse";

// Explicit program tables with destination headings and departure-price rows.
// Unknown sections fall back; they must never inherit the preceding program.
export function destinationAwardFares(text, airports, destinations) {
  const clean = text.replace(/\*/g, "");
  const section = clean.match(/Departure Cities\s*\n([\s\S]*?)(?:\n\s*How to Book\b|$)/i);
  const unrecognized = { recognized: false, complete: false, fares: [] };
  if (!section || !/^\s*via (?:BA Avios|JAL miles)\b/im.test(section[1])) return unrecognized;
  if (!destinations.size) return unrecognized;
  const header = clean.slice(0, section.index);
  const programs = [
    { section: /^via BA Avios(?: \(off-peak\))?$/i, name: "British Airways", booking: "British Airways Avios", unit: "avios" },
    { section: /^via JAL miles$/i, name: "Japan Airlines Mileage Bank", booking: "Japan Airlines Mileage Bank", unit: "miles" },
  ];
  const wanted = new Set(airports.map(a => a.code.toUpperCase()));
  const airline = header.match(/^\s*Flying ([^\n(]+)/im)?.[1]?.trim();
  const cabin = /\bbiz class\b|\bbusiness(?: class)?\b/i.test(header) ? "business"
    : /\bfirst class\b/i.test(header) ? "first"
      : /\bpremium economy\b/i.test(header) ? "premium" : null;
  if (!cabin || !/\bAll fares one-way\b/i.test(section[1])) return unrecognized;
  let program = null, destination = null, routes = 0, complete = true;
  const fares = [];
  for (const raw of section[1].split("\n")) {
    const line = raw.trim();
    if (!line || /^\(All fares one-way,?\s*nonstop\)$/i.test(line) ||
        /^Pricing via BA Avios or JAL miles$/i.test(line)) continue;
    if (/^via\b/i.test(line)) {
      program = programs.find(p => p.section.test(line)) || null;
      destination = null;
      if (!program) complete = false;
      continue;
    }
    const heading = line.match(/^([^()]+)\(([A-Z]{3})\)$/);
    if (heading) {
      destination = destinations.has(heading[2]) ? { name: heading[1].trim(), code: heading[2] } : null;
      if (!destination) complete = false;
      continue;
    }
    const row = line.match(/^([^()]+)\(([A-Z]{3})\)\s*[-–—]\s*(\d[\d,.]*k?)$/i);
    if (!row || !program || !destination) { complete = false; continue; }
    routes++;
    if (wanted.size && !wanted.has(row[2])) continue;
    const start = header.toLowerCase().indexOf(`book with ${program.booking.toLowerCase()}`);
    if (start < 0) { complete = false; continue; }
    const following = header.slice(start);
    const end = following.slice(10).search(/\n\s*Book with\b/i);
    const quote = (end < 0 ? following : following.slice(0, end + 10)).trim();
    const points = Number(row[3].replace(/,/g, "").replace(/k$/i, "")) * (/k$/i.test(row[3]) ? 1000 : 1);
    const award = validateAwardPricing({ options: [{
      program: program.name, points_min: points, points_max: points,
      points_unit: program.unit, points_basis: "one_way",
      // Minimums/ranges cannot be asserted as this route's exact fees.
      cash_amount: null, cash_currency: null, cash_basis: "unspecified",
      pricing_text: quote, route_text: line,
    }] }, text);
    if (!award) { complete = false; continue; }
    fares.push({
      origin: row[2], destination: destination.name, destination_code: destination.code,
      cabin, airline, award_pricing: award, travel_months: [],
      deadline_said: header.match(/^.*We think this will last[^\n]*/im)?.[0]?.trim(),
      notes: "Availability and fees vary by route, dates and booking program. See the original pricing details; confirm before transferring points.",
    });
  }
  // Do not let partial exact routes suppress unrecognized booking options in
  // the model result. Either this whole known format is exact, or fall back.
  return { recognized: true, complete: complete && routes > 0,
    fares: complete ? consolidateAwardRoutes(fares) : [] };
}

// One destination in the header, then "Prices via <program> <unit>" and origin
// rows priced in thousands: "Chicago (ORD) - 28k". Thrifty Traveler's
// single-program award sends use it (Iberia to Madrid, September 2026). Any line
// this does not recognize sends the whole email back to the model reader.
export function programAwardFares(text, airports, destinations) {
  const clean = text.replace(/\*/g, "");
  const unrecognized = { recognized: false, complete: false, fares: [] };
  const section = clean.match(/Departure Cities\s*\n([\s\S]*?)(?:\n\s*How to Book\b|$)/i);
  if (!section || destinations.size !== 1) return unrecognized;
  const via = [...section[1].matchAll(/^\s*Prices via (.+?) (Avios|miles|points)\s*$/gim)];
  if (via.length !== 1) return unrecognized;
  const basisLine = section[1].match(/^\s*\(All fares (round[\s-]*trip|one[\s-]*way),?\s*nonstop\)\s*$/im);
  if (!basisLine) return unrecognized;
  const header = clean.slice(0, section.index);
  const [code] = destinations;
  const place = header.match(new RegExp(`^\\s*([A-Za-z][A-Za-z .'-]+?)\\s*\\(${code}\\)\\s*$`, "m"));
  if (!place) return unrecognized;
  const program = via[0][1].trim();
  const unit = via[0][2].toLowerCase();
  const start = header.toLowerCase().indexOf(`book with ${program.toLowerCase()}`);
  if (start < 0) return unrecognized;
  const following = header.slice(start);
  const end = following.slice(10).search(/\n\s*Book with\b/i);
  const quote = (end < 0 ? following : following.slice(0, end + 10)).trim();
  const basis = /^one/i.test(basisLine[1]) ? "one_way" : "round_trip";
  const cabin = /\bbiz class\b|\bbusiness(?: class)?\b/i.test(header) ? "business"
    : /\bfirst class\b/i.test(header) ? "first"
      : /\bpremium economy\b/i.test(header) ? "premium" : "economy";
  const airline = header.match(/^\s*Flying ([^\n(]+)/im)?.[1]?.trim();
  const availability = header.match(/^.*Full availability:[^\n]+/im)?.[0]
    || header.match(/^\s*Best:[^\n]+/im)?.[0] || "";
  const fees = clean.match(/^\s*Taxes & fees are[^\n]+/im)?.[0]?.trim();
  const wanted = new Set(airports.map(a => String(a.code).toUpperCase()));
  let routes = 0, complete = true;
  const fares = [];
  for (const raw of section[1].split("\n")) {
    const line = raw.trim();
    if (!line || line === basisLine[0].trim() || line === via[0][0].trim()) continue;
    const row = line.match(/^([^()]+)\(([A-Z]{3})\)\s*[-–—]\s*(\d[\d,.]*k)$/i);
    if (!row) { complete = false; continue; }
    routes++;
    if (wanted.size && !wanted.has(row[2])) continue;
    const points = Math.round(Number(row[3].replace(/,/g, "").replace(/k$/i, "")) * 1000);
    const award = validateAwardPricing({ options: [{
      program, points_min: points, points_max: points,
      points_unit: unit, points_basis: basis,
      // "~$220" is an estimate, not this route's exact fee.
      cash_amount: null, cash_currency: null, cash_basis: "unspecified",
      pricing_text: quote, route_text: line, fees_text: fees,
    }] }, text);
    if (!award) { complete = false; continue; }
    fares.push({
      origin: row[2], destination: place[1].trim(), destination_code: code,
      cabin, airline, award_pricing: award, travel_months: monthsIn(availability),
      deadline_said: header.match(/^.*We think this will last[^\n]*/im)?.[0]?.trim(),
      notes: [availability.replace(/^[\s(]+|[\s)]+$/g, ""), fees].filter(Boolean).join(" · ")
        || "Confirm availability and fees before transferring points.",
    });
  }
  return { recognized: true, complete: complete && routes > 0,
    fares: complete ? consolidateAwardRoutes(fares) : [] };
}
