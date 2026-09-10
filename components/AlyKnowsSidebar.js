"use client";

import { useMemo } from "react";

/**
 * The live "what Aly knows" sidebar that runs alongside the welcome form.
 *
 * The family form is a container of facts. Facts on their own are boring.
 * What makes them electric is when the family sees the app immediately
 * showing them what it now knows because of a field they just typed.
 * This sidebar reads the form's state directly -- family name, home,
 * people, pets -- and writes one small line for each fact as it lands.
 *
 * Deliberately not a validator. It never scolds an empty field, never
 * asks the family to fix anything, never blocks the button below. It
 * only speaks when there is something specific to say -- otherwise the
 * empty row is quiet -- because a sidebar full of "no name yet" for
 * every blank field reads as a checklist. This one reads as an
 * assistant taking notes.
 *
 * The sentences are deliberately about what CHANGES for Aly, not what
 * the family typed. "Central Time -- morning emails at 7 AM your local"
 * is better than "You are in Chicago" because the family already knows
 * they are in Chicago; what they do not know is what that means for how
 * Aly behaves.
 */

const AIRPORTS_BY_STATE = {
  // A small local table for the most common home states so the sidebar
  // can name real nearby airports without a lookup. Anything else falls
  // back to a shorter line that names the timezone alone. The point is
  // demonstrating the loop closing on a familiar field -- a Chicago
  // primary sees O'Hare and Midway named -- not building an airport
  // database on the client.
  IL: ["O'Hare (ORD)", "Midway (MDW)"],
  NY: ["JFK", "LaGuardia", "Newark (EWR)"],
  CA: ["LAX", "San Francisco (SFO)", "San Diego (SAN)"],
  TX: ["Dallas / Fort Worth (DFW)", "Austin (AUS)", "Houston (IAH)"],
  FL: ["Miami (MIA)", "Orlando (MCO)", "Fort Lauderdale (FLL)"],
  MA: ["Boston Logan (BOS)"],
  WA: ["Seattle (SEA)"],
  CO: ["Denver (DEN)"],
  GA: ["Atlanta (ATL)"],
  AZ: ["Phoenix (PHX)"],
  MO: ["St Louis (STL)", "Kansas City (MCI)"],
  MN: ["Minneapolis / St Paul (MSP)"],
  PA: ["Philadelphia (PHL)", "Pittsburgh (PIT)"],
  OR: ["Portland (PDX)"],
  NC: ["Charlotte (CLT)", "Raleigh (RDU)"],
  MI: ["Detroit (DTW)"],
  OH: ["Cleveland (CLE)", "Columbus (CMH)"],
  DC: ["Reagan (DCA)", "Dulles (IAD)"],
};

function detectStateFromAddress(address) {
  const clean = String(address || "").trim();
  if (!clean) return null;
  // Two-letter state code preceded by a comma or space, near the end of
  // the string. Common shapes we get from the address picker are
  // "123 Main St, Chicago, IL 60601, USA" and "Webster Groves, MO, USA",
  // both of which match this rule. The state has to be one of the ones
  // we know or the answer is null.
  const match = clean.match(/\b([A-Z]{2})\b(?=[^A-Z]*(?:USA|United States|$))/);
  const code = match?.[1] || null;
  if (code && AIRPORTS_BY_STATE[code]) return code;
  return null;
}

function timezoneFromState(state) {
  if (!state) return null;
  const map = {
    IL: "Central Time",
    NY: "Eastern Time",
    CA: "Pacific Time",
    TX: "Central Time",
    FL: "Eastern Time",
    MA: "Eastern Time",
    WA: "Pacific Time",
    CO: "Mountain Time",
    GA: "Eastern Time",
    AZ: "Mountain Standard (no DST)",
    MO: "Central Time",
    MN: "Central Time",
    PA: "Eastern Time",
    OR: "Pacific Time",
    NC: "Eastern Time",
    MI: "Eastern Time",
    OH: "Eastern Time",
    DC: "Eastern Time",
  };
  return map[state] || null;
}

function morningEmailPhrase(state) {
  const tz = timezoneFromState(state);
  if (!tz) return null;
  return `Morning reminders will land at 7 AM ${tz}.`;
}

function ageOnDate(dob, when) {
  if (!dob) return null;
  const born = new Date(`${dob}T12:00:00Z`);
  const on = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(born.getTime()) || Number.isNaN(on.getTime())) return null;
  let age = on.getUTCFullYear() - born.getUTCFullYear();
  const bm = born.getUTCMonth();
  const om = on.getUTCMonth();
  if (om < bm || (om === bm && on.getUTCDate() < born.getUTCDate())) age -= 1;
  if (age < 0 || age > 130) return null;
  return age;
}

function ageBandNote(age) {
  if (age == null) return null;
  if (age < 2) {
    return "Under two on most trips -- I will flag lap-infant rules on any flight you plan.";
  }
  if (age < 10) {
    return `I will keep afternoons open and avoid dinner reservations after 7 PM by default.`;
  }
  if (age < 13) {
    return `I can offer kid-focused choices and adult ones side by side.`;
  }
  if (age < 18) {
    return `A teenager on the trip -- I will suggest slots with room to disagree with the plan.`;
  }
  if (age >= 65) {
    return `I will surface walking distances and elevator access on hotels and attractions.`;
  }
  return null;
}

function personLine(name, dob) {
  const cleanName = (name || "").trim();
  if (!cleanName) return null;
  const age = ageOnDate(dob, new Date());
  if (age == null) return `${cleanName} is on the traveler list.`;
  const band = ageBandNote(age);
  const opener = `${cleanName} will be ${age} on your next trip.`;
  return band ? `${opener} ${band}` : opener;
}

function petLine(name, species) {
  const cleanName = (name || "").trim();
  if (!cleanName) return null;
  const sp = String(species || "pet").toLowerCase();
  const article = /^[aeiou]/.test(sp) ? "an" : "a";
  return `${cleanName} is ${article} ${sp}. For a trip ${cleanName} is not on, I will remind you about boarding two weeks out.`;
}

function familyNameLine(name) {
  const cleanName = (name || "").trim();
  if (!cleanName) return null;
  return `I will call you the ${cleanName.replace(/\s+Family$/i, "")} family in email and on the morning reminder.`;
}

export default function AlyKnowsSidebar({
  familyName,
  address,
  located,
  people,
  pets,
}) {
  const facts = useMemo(() => {
    const rows = [];
    const nameLine = familyNameLine(familyName);
    if (nameLine) rows.push({ key: "family", text: nameLine });

    if (address && address.trim().length > 0) {
      const state =
        detectStateFromAddress(address) ||
        detectStateFromAddress(located?.address || "");
      const airports = state ? AIRPORTS_BY_STATE[state] : null;
      if (airports && airports.length > 0) {
        rows.push({
          key: "airports",
          text: `Nearest airports: ${airports.join(", ")}. I will price flights from those first.`,
        });
      } else {
        rows.push({
          key: "home",
          text: "Home saved. I will use it to work out drive time and airport options for every trip.",
        });
      }
      const timezone = morningEmailPhrase(state);
      if (timezone) rows.push({ key: "tz", text: timezone });
    }

    (people || []).forEach((p, i) => {
      const line = personLine(p?.name, p?.dob);
      if (line) rows.push({ key: `person-${i}`, text: line });
    });

    (pets || []).forEach((p, i) => {
      const line = petLine(p?.name, p?.species);
      if (line) rows.push({ key: `pet-${i}`, text: line });
    });

    return rows;
  }, [familyName, address, located, people, pets]);

  return (
    <aside className="rounded-2xl border border-sand-deep bg-sand-soft/60 p-4 lg:sticky lg:top-4">
      <p className="section-label text-ink-soft">What I know so far</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Every field you type appears here as something I am already doing with
        it. Nothing here needs a save -- these are my notes as you go.
      </p>
      <div className="mt-3 space-y-2">
        {facts.length === 0 ? (
          <p className="text-sm italic text-ink-faint">
            As soon as you type a name or a home, I will start taking notes
            here.
          </p>
        ) : (
          facts.map((f) => (
            <p
              key={f.key}
              className="rounded-lg border border-sand-deep bg-white p-3 text-sm leading-relaxed text-ink"
            >
              {f.text}
            </p>
          ))
        )}
      </div>
    </aside>
  );
}
