// How old everyone will be, on the days that matter.
//
// A birthday is on file for some of the family, and until now it did nothing but
// print itself on the Family tab. That is a waste of the one fact that rules
// whole categories of suggestion in or out: an adults-only resort is not a
// judgement call when a twelve-year-old is coming, a 10+ excursion is not
// bookable for a nine-year-old, and a rental car costs more until the driver is
// twenty-five.
//
// The important part is which day the age is measured on. Nobody is planning for
// today — they are planning for a trip in eighteen months, and a child who is
// twelve now is a teenager on the plane. So every function here takes the date it
// should count to, and the callers pass the trip's start date rather than the
// clock.
//
// Pure. Dates in, numbers and sentences out, no clock and no network.

const iso = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : "";

/**
 * Whole years old on a given day, counting the way a booking form counts: the
 * birthday itself is the day the number changes.
 *
 * @returns {number|null} null when either date is missing or unreadable, or when
 *   the birthday is after the day asked about.
 */
export function ageOn(dob, onDate) {
  const born = iso(dob);
  const day = iso(onDate);
  if (!born || !day) return null;
  const [by, bm, bd] = born.split("-").map(Number);
  const [y, m, d] = day.split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age < 0 ? null : age;
}

/**
 * The band a number of years lands in, in the words travel uses rather than the
 * words a census uses. These are the lines that actually appear on a price list
 * or a waiver: a lap infant, a park ticket, an age minimum on an excursion, a
 * teen club, an adult, a senior rate.
 */
export function ageBand(age) {
  if (typeof age !== "number" || Number.isNaN(age)) return null;
  if (age < 2) return "infant";
  if (age < 6) return "young child";
  if (age < 10) return "child";
  if (age < 13) return "tween";
  if (age < 18) return "teen";
  if (age < 65) return "adult";
  return "senior";
}

/** Everyone who is a person, with how old they will be on that day. */
export function agesOn(travelers = [], onDate) {
  return (travelers || [])
    .filter((t) => t && t.is_person !== false && t.name)
    .map((t) => {
      const age = ageOn(t.date_of_birth, onDate);
      return {
        id: t.id || null,
        name: t.name,
        age,
        band: ageBand(age),
      };
    });
}

/** The names whose birthday nobody has recorded, so a screen can ask for it. */
export function withoutBirthday(travelers = []) {
  return (travelers || [])
    .filter(
      (t) => t && t.is_person !== false && t.name && !iso(t.date_of_birth),
    )
    .map((t) => t.name);
}

/** Anyone under eighteen on the day asked about, by name. */
export function minorsOn(travelers = [], onDate) {
  return agesOn(travelers, onDate)
    .filter((row) => typeof row.age === "number" && row.age < 18)
    .map((row) => row.name);
}

/** The youngest known age on that day, or null when no birthday is on file. */
export function youngestOn(travelers = [], onDate) {
  const ages = agesOn(travelers, onDate)
    .map((row) => row.age)
    .filter((age) => typeof age === "number");
  return ages.length ? Math.min(...ages) : null;
}

/** The oldest known age, for senior rates. */
export function oldestOn(travelers = [], onDate) {
  const ages = agesOn(travelers, onDate)
    .map((row) => row.age)
    .filter((age) => typeof age === "number");
  return ages.length ? Math.max(...ages) : null;
}

function niceList(values) {
  const list = (values || []).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * The line a model should read before it suggests anywhere to stay or anything to
 * do: who is coming, how old each of them will be by then, and — said out loud,
 * because a missing fact quietly becomes a guess — whose birthday is not on file.
 */
export function ageLines(travelers = [], onDate) {
  const rows = agesOn(travelers, onDate);
  if (!rows.length) return [];
  const known = rows.filter((row) => typeof row.age === "number");
  const lines = [];
  if (known.length) {
    lines.push(
      `AGES ON THE FIRST DAY OF THIS TRIP: ${known
        .map((row) => `${row.name} ${row.age} (${row.band})`)
        .join("; ")}.`,
    );
    const minors = known.filter((row) => row.age < 18).map((row) => row.name);
    if (minors.length) {
      lines.push(
        `${niceList(minors)} ${minors.length === 1 ? "is" : "are"} under 18 on this trip, so anything adults-only is ruled out, and anything with an age minimum has to be checked against the youngest person going rather than against the family.`,
      );
    } else {
      lines.push(
        "Everyone going is an adult, so adults-only places are open to them.",
      );
    }
  }
  const missing = withoutBirthday(travelers);
  if (missing.length) {
    lines.push(
      `No birthday on file for ${niceList(missing)}. Do not guess at an age — ask, or leave age out of it.`,
    );
  }
  return lines;
}

/**
 * The day someone has a birthday inside a date range, or null.
 *
 * Both ends are included, because a birthday on the last morning is still a
 * birthday on the trip.
 */
export function birthdayDuring(dob, startDate, endDate) {
  const born = iso(dob);
  const start = iso(startDate);
  const end = iso(endDate) || start;
  if (!born || !start) return null;
  const [, bm, bd] = born.split("-").map(Number);
  const startYear = Number(start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));
  for (let year = startYear; year <= endYear; year++) {
    const day = `${year}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
    if (day >= start && day <= end) return day;
  }
  return null;
}

/**
 * The ages that change what something costs or who is allowed on it. Curated
 * rather than complete: each of these is a line somebody has actually run into at
 * a ticket window, and the reason is written the way it would be said out loud.
 */
export const MILESTONES = [
  {
    age: 2,
    what: "stops being a lap infant",
    why: "an airline seat and a fare of their own, and a cot rather than a travel bassinet",
    fare: true,
  },
  {
    age: 3,
    what: "starts needing a park ticket",
    why: "Disney and most parks are free under 3 and charged from the third birthday",
    fare: true,
  },
  {
    age: 10,
    what: "reaches the usual age minimum on excursions",
    why: "most zip lines, rafting trips and junior dive courses start at 10, and Disney charges an adult ticket from 10",
    fare: true,
  },
  {
    age: 13,
    what: "moves out of the kids' club",
    why: "cruise lines and resorts move 13-year-olds to the teen club, and airlines stop selling a child fare",
    fare: true,
  },
  {
    age: 16,
    what: "can do the 16+ things",
    why: "some excursions, jet skis and ropes courses set their minimum at 16",
    fare: false,
  },
  {
    age: 18,
    what: "counts as an adult on every booking",
    why: "signs their own waivers, shares a room as an adult, and no longer needs an accompanying grown-up",
    fare: true,
  },
  {
    age: 21,
    what: "reaches the US drinking age",
    why: "changes what a resort's all-inclusive band is worth to them, and cruise lines card at 21",
    fare: false,
  },
  {
    age: 25,
    what: "clears the young-driver surcharge",
    why: "most rental companies drop the under-25 fee at 25",
    fare: false,
  },
  {
    age: 65,
    what: "qualifies for senior rates",
    why: "parks, trains, museums and some tours price 65+ lower",
    fare: false,
  },
];

/**
 * The milestones somebody crosses between two days — normally between today and
 * the first day of a trip, which is exactly the window in which a booking is
 * made on the wrong age.
 *
 * Returns them in the order they happen, each with the day it happens on.
 */
export function milestonesBetween(dob, fromDate, toDate) {
  const born = iso(dob);
  const from = iso(fromDate);
  const to = iso(toDate);
  if (!born || !from || !to || to < from) return [];
  const [by, bm, bd] = born.split("-").map(Number);
  const out = [];
  for (const milestone of MILESTONES) {
    const on = `${by + milestone.age}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
    if (on > from && on <= to) out.push({ ...milestone, on });
  }
  return out.sort((a, b) => a.on.localeCompare(b.on));
}

/**
 * One short clause per person for the Family tab: "12" beside a birthday, so the
 * number nobody wants to work out in their head is already there.
 */
export function ageToday(dob, todayISO) {
  const age = ageOn(dob, todayISO);
  return typeof age === "number" ? age : null;
}
