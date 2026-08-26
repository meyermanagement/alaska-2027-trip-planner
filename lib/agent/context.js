// Builds the snapshot the model reads, and the id allow-list the validator
// checks proposed changes against.
//
// There is one context for the whole app. Aly sees every trip and everything
// inside it no matter where the user opened her from; when a trip is open it is
// the FOCUS, which only changes what a vague request defaults to.

const PACKING_LINES_FOCUS = 200;
const PACKING_LINES_OTHER = 90;
const REVIEW_LINES = 30;

// The four kinds of thing the Preferences & Reviews tab keeps an opinion about.
const REVIEWABLE = ["lodging", "dining", "excursion", "activity"];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function todayInChicago() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function short(value, max = 90) {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function daysBetween(fromISO, toISO) {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function groupByTrip(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.trip_id)) map.set(row.trip_id, []);
    map.get(row.trip_id).push(row);
  }
  return map;
}

// The family's own travel preferences, so suggestions match how they travel.
// Ids are printed and recorded so the assistant can edit them.
function preferenceLines(preferences, travelerNameById, known) {
  const lines = [
    "",
    "HOW THIS FAMILY LIKES TO TRAVEL (their saved preferences, shared across every trip):",
  ];
  if (!preferences.length) {
    lines.push("(nothing saved yet)");
    return lines;
  }
  for (const p of preferences.slice(0, 60)) {
    if (p.id && known) known.travel_preferences.set(p.id, short(p.body, 60));
    const who = p.traveler_id ? travelerNameById.get(p.traveler_id) : null;
    const topic = p.topic ? `[${short(p.topic, 30)}] ` : "";
    lines.push(
      `- ${p.id ? `id=${p.id} | ` : ""}${topic}${short(p.body, 220)}${
        who ? ` (${who})` : " (whole family)"
      }`,
    );
  }
  return lines;
}

/**
 * The points, miles and credit cards the family has, written so the assistant
 * can do two specific things with them: notice when a balance is big enough to
 * be worth spending on something she is suggesting, and name the card that
 * earns most on a booking she is proposing.
 *
 * Balances are whatever the family last typed in, which is the honest limit of
 * this: the app is not connected to any of these accounts. The earning rules
 * are the family's own record of their cards, prefilled from a catalog when
 * they added them, so they are a good guide and not a guarantee.
 */
/**
 * The standing packing lists — what the family always takes, grouped by who
 * packs it. These are what every new trip's list is built from, so they are
 * listed separately from any trip's own packing list and never mixed in with it.
 */
function templateLines(templates, templateItems, known) {
  const lines = [
    "",
    "STANDING PACKING LISTS (the Packing lists tab — what every NEW trip is built from. Editing these changes nothing on trips that already exist. Use add_template_item / update_template_item / delete_template_item here, never the trip packing tools):",
  ];
  if (!templates.length) {
    lines.push(
      "(none saved yet — new trips get an empty packing list until a standing list exists)",
    );
    return lines;
  }
  const byTemplate = new Map();
  for (const it of templateItems.slice(0, 400)) {
    if (!it?.template_id) continue;
    if (known) {
      known.packing_template_items.set(it.id, {
        item: it.item,
        template_id: it.template_id,
      });
    }
    if (!byTemplate.has(it.template_id)) byTemplate.set(it.template_id, []);
    byTemplate.get(it.template_id).push(it);
  }
  for (const t of templates) {
    if (known) {
      known.packing_templates.set(t.id, {
        name: t.name,
        is_base: Boolean(t.is_base),
      });
    }
    const rows = byTemplate.get(t.id) || [];
    lines.push(
      `- ${t.name}${t.is_base ? " [THE BASE LIST — every trip starts from this one]" : " [an add-on, only used for trips it suits]"}${
        t.description ? `: ${short(t.description, 120)}` : ""
      } — ${rows.length} ${rows.length === 1 ? "item" : "items"}`,
    );
    const byWho = new Map();
    for (const r of rows) {
      const who = r.assignee || "Shared";
      if (!byWho.has(who)) byWho.set(who, []);
      byWho.get(who).push(r);
    }
    for (const [who, mine] of byWho.entries()) {
      lines.push(`  ${who}:`);
      for (const r of mine) {
        lines.push(
          `    - ${r.item}${r.quantity ? ` x${r.quantity}` : ""} (${
            r.category || "General"
          }) [id: ${r.id}]`,
        );
      }
    }
  }
  return lines;
}

function rewardsLines(rewards, travelerNameById, known) {
  const lines = [
    "",
    "POINTS, MILES AND CARDS THEY HAVE (from the Travel programs tab — balances are typed in by hand, not read from the accounts, so treat them as roughly right and say so if a plan hangs on one):",
  ];
  if (!rewards.length) {
    lines.push(
      "(nothing saved yet — if the user mentions a program, a balance or a card they carry, offer to add it to the Travel programs tab)",
    );
    return lines;
  }
  const cards = [];
  for (const r of rewards.slice(0, 80)) {
    if (r.id && known) known.rewards_programs.set(r.id, short(r.brand, 60));
    const who = r.traveler_id ? travelerNameById.get(r.traveler_id) : null;
    const bits = [];
    if (r.program_name && r.program_name !== r.brand)
      bits.push(`earns ${short(r.program_name, 60)}`);
    if (r.points_balance !== null && r.points_balance !== undefined) {
      const value = estimatedPointValue(r);
      bits.push(
        `${Number(r.points_balance).toLocaleString("en-US")} ${
          r.currency_label || "points"
        }${value ? ` (worth roughly $${value.toLocaleString("en-US")})` : ""}${
          r.points_checked_on ? `, as of ${r.points_checked_on}` : ""
        }`,
      );
    } else {
      bits.push("no balance recorded");
    }
    if (r.status_tier) bits.push(`${short(r.status_tier, 40)} status`);
    if (r.annual_fee !== null && r.annual_fee !== undefined)
      bits.push(
        Number(r.annual_fee) === 0
          ? "no annual fee"
          : `$${Number(r.annual_fee)} annual fee`,
      );
    const rules = Array.isArray(r.earn_rules) ? r.earn_rules : [];
    const earns = rules
      .filter((rule) => rule && rule.on)
      .slice(0, 8)
      .map(
        (rule) =>
          `${rule.rate}x on ${short(String(rule.on), 60)}${
            rule.note ? ` (${short(String(rule.note), 40)})` : ""
          }`,
      );
    if (earns.length) bits.push(`earning: ${earns.join("; ")}`);
    const credits = (Array.isArray(r.credits) ? r.credits : [])
      .filter((c) => c && c.on && c.amount)
      .slice(0, 6)
      .map(
        (c) =>
          `$${Number(c.amount)} ${CREDIT_PERIOD_WORDS[c.resets] || "every year"} on ${short(
            String(c.on),
            60,
          )}${c.note ? ` (${short(String(c.note), 40)})` : ""}`,
      );
    if (credits.length) bits.push(`statement credits: ${credits.join("; ")}`);
    if (r.perks) bits.push(`perks: ${short(r.perks, 160)}`);
    if (r.expiry_note) bits.push(short(r.expiry_note, 120));
    if (r.notes) bits.push(short(r.notes, 160));
    const line = `- ${r.id ? `id=${r.id} | ` : ""}[${
      REWARD_KIND_WORDS[r.kind] || r.kind || "other"
    }] ${short(r.brand, 80)}${who ? ` (${who}'s)` : " (whole family)"} — ${bits.join(", ")}`;
    if (r.kind === "credit_card") cards.push(line);
    else lines.push(line);
  }
  // Cards last, together, because they are the ones she reasons over per booking.
  lines.push(...cards);
  lines.push(
    "How to use this: when you suggest a hotel, a flight, a car or a cruise, check whether a balance above could pay for it and say what it would cost in points if you can reason it out, and always name which of their cards earns most on that kind of spending and how much it would earn.",
    "How they book changes the answer, so read the wording of each earning rule: a rule that says 'booked through Chase Travel' or 'through the portal' only pays that rate when they book on the card's own travel site, and a rule that says 'booked direct' only pays when they book with the airline or hotel itself. When a card pays more one way than the other, say both — the higher rate and what they would have to do to get it — rather than naming one winner.",
    "Statement credits come before points in the maths: an unused travel credit is money off the booking, and points are a rebate on what is left. When a credit above plausibly covers what you are suggesting, say so first, then name the card to earn on. The app does not know how much of a credit is already spent this year, so say it is worth checking rather than treating it as still available.",
    "Never invent a balance, a redemption rate, an earning rule or a credit that is not written above.",
  );
  return lines;
}

const CREDIT_PERIOD_WORDS = {
  monthly: "a month",
  quarterly: "a quarter",
  semiannual: "twice a year",
  annual: "every year",
  multiyear: "every few years",
};

const REWARD_KIND_WORDS = {
  credit_card: "credit card",
  airline: "airline",
  hotel: "hotel",
  car: "car rental",
  cruise: "cruise line",
  rail: "rail",
  dining: "dining or shopping",
  other: "other",
};

// Kept local rather than imported from lib/rewards so the context builder stays
// free of anything that touches the browser.
function estimatedPointValue(row) {
  const points = Number(row?.points_balance);
  const cents = Number(row?.point_value_cents);
  if (!Number.isFinite(points) || !Number.isFinite(cents)) return null;
  if (points <= 0 || cents <= 0) return null;
  return Math.round((points * cents) / 100);
}

/**
 * What the family already told us they liked, and what can be worked out from
 * the trips they have taken.
 *
 * The ratings and reviews are also printed inline with each past trip's
 * itinerary further down, but buried among flights and check-ins they are easy
 * to miss — and they are the whole point when Aly is asked to plan something
 * new. So they are collected here, best first, next to the saved preferences.
 *
 * The patterns are labelled as inferences on purpose. They are arithmetic on
 * five columns, not something the family said, and Aly should not quote them
 * back as if they were a stated preference.
 */
function historyLines(pastTrips, itinerary) {
  const lines = [""];
  if (!pastTrips.length) {
    lines.push(
      "WHAT THEY THOUGHT OF PLACES THEY HAVE BEEN: no finished trips yet, so there is nothing rated or reviewed. Ask what they are in the mood for instead of guessing.",
    );
    return lines;
  }

  const nameById = new Map(pastTrips.map((t) => [t.id, t.name]));
  const rated = itinerary
    .filter(
      (i) =>
        nameById.has(i.trip_id) &&
        REVIEWABLE.includes(i.category) &&
        (i.rating || i.review),
    )
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));

  if (rated.length) {
    lines.push(
      `WHAT THEY THOUGHT OF PLACES THEY HAVE BEEN (${rated.length} rated or reviewed on the Preferences & Reviews tab, best first). These are their own words and their own stars: lean on them when you suggest anything, quote them rather than paraphrasing, and treat a low score as something to avoid repeating:`,
    );
    for (const i of rated.slice(0, REVIEW_LINES)) {
      const bits = [
        i.rating ? `${i.rating}/5` : "no stars",
        short(i.title, 70),
        i.category,
        nameById.get(i.trip_id),
      ];
      if (i.location) bits.push(short(i.location, 50));
      lines.push(
        `- ${bits.join(" | ")}${i.review ? ` — "${short(i.review, 180)}"` : ""}`,
      );
    }
    if (rated.length > REVIEW_LINES) {
      lines.push(
        `(… ${rated.length - REVIEW_LINES} more, all of them on the Preferences & Reviews tab)`,
      );
    }
  } else {
    lines.push(
      "WHAT THEY THOUGHT OF PLACES THEY HAVE BEEN: nothing rated or reviewed yet, even though they have finished trips. Their hotels, restaurants and excursions are listed with each past trip below, and the Preferences & Reviews tab is where they would score them.",
    );
  }

  const withDates = pastTrips.filter((t) => t.start_date && t.end_date);
  const lengths = withDates
    .map((t) => (daysBetween(t.start_date, t.end_date) || 0) + 1)
    .filter((n) => n > 0);
  const months = Array.from(
    new Set(
      withDates.map((t) => Number(t.start_date.slice(5, 7))).filter(Boolean),
    ),
  )
    .sort((a, b) => a - b)
    .map((n) => MONTHS[n - 1]);
  const loved = rated.filter((i) => (i.rating || 0) >= 4);
  const lovedByKind = new Map();
  for (const i of loved) {
    lovedByKind.set(i.category, (lovedByKind.get(i.category) || 0) + 1);
  }
  const disliked = rated.filter((i) => i.rating && i.rating <= 2);

  lines.push("");
  lines.push(
    "PATTERNS FROM PAST TRIPS (worked out from the record, not stated by the family — a hint, never something to quote as a preference):",
  );
  lines.push(
    `- ${pastTrips.length} finished ${pastTrips.length === 1 ? "trip" : "trips"}: ${withDates
      .map(
        (t) =>
          `${t.name} (${(daysBetween(t.start_date, t.end_date) || 0) + 1} days)`,
      )
      .join(", ")}`,
  );
  if (lengths.length) {
    const min = Math.min(...lengths);
    const max = Math.max(...lengths);
    lines.push(
      `- trips have run ${min === max ? `${min} days` : `${min} to ${max} days`}, leaving in ${months.join(", ")}`,
    );
  }
  if (lovedByKind.size) {
    lines.push(
      `- what they rate 4 or 5 stars: ${Array.from(lovedByKind.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([kind, n]) => `${kind} (${n})`)
        .join(", ")}`,
    );
  }
  if (disliked.length) {
    lines.push(
      `- rated 1 or 2 stars, so do not suggest anything like it again: ${disliked
        .map((i) => short(i.title, 50))
        .join(", ")}`,
    );
  }
  return lines;
}

export function buildContext({
  trips = [],
  focusTripId = null,
  itinerary = [],
  packing = [],
  tasks = [],
  notes = [],
  travelers = [],
  rosters = [],
  preferences = [],
  rewards = [],
  templates = [],
  templateItems = [],
  userName,
}) {
  const travelerNames = travelers.length
    ? Array.from(new Set([...travelers.map((t) => t.name), "Shared"]))
    : ["Shared"];
  const travelerIds = new Map(
    travelers.filter((t) => t.id && t.name).map((t) => [t.name, t.id]),
  );
  const travelerNameById = new Map(
    travelers.filter((t) => t.id).map((t) => [t.id, t.name]),
  );

  // Every id the user is allowed to touch, and which trip each row sits in.
  const known = {
    trips: new Map(),
    tripContents: new Map(),
    travel_preferences: new Map(),
    rewards_programs: new Map(),
    itinerary_items: new Map(),
    packing_items: new Map(),
    predeparture_tasks: new Map(),
    trip_notes: new Map(),
    packing_templates: new Map(),
    packing_template_items: new Map(),
    rowTrip: new Map(),
  };

  const today = todayInChicago();
  // A draft is neither ahead nor behind: it is an idea, and it can carry dates
  // that have already gone by without being a trip the family took.
  const isDraft = (t) => t.status === "draft";
  const isPast = (t) =>
    !isDraft(t) &&
    (["complete", "archived"].includes(t.status) ||
      (t.end_date || t.start_date || "9999-12-31") < today);

  const itinByTrip = groupByTrip(itinerary);
  const packByTrip = groupByTrip(packing);
  const taskByTrip = groupByTrip(tasks);
  const noteByTrip = groupByTrip(notes);

  // Focus trip first, then what is still ahead, then the drafts, then the
  // finished trips.
  const rank = (t) => (isPast(t) ? 3 : isDraft(t) ? 2 : 1);
  const ordered = [...trips].sort((a, b) => {
    if (a.id === focusTripId) return -1;
    if (b.id === focusTripId) return 1;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const cmp = (a.start_date || "").localeCompare(b.start_date || "");
    return isPast(a) ? -cmp : cmp;
  });
  const focusTrip = trips.find((t) => t.id === focusTripId) || null;

  const lines = [];
  lines.push(`TODAY: ${today}`);
  lines.push(`SIGNED IN AS: ${userName || "a family member"}`);
  lines.push(`TRAVELERS: ${travelerNames.join(", ")}`);
  lines.push(
    focusTrip
      ? `OPEN RIGHT NOW: ${focusTrip.name} [id: ${focusTrip.id}]. Anything the user does not pin to another trip belongs to this one.`
      : "OPEN RIGHT NOW: no single trip — the user is on a screen that spans every trip. Work out which trip they mean from what they say, and ask if you genuinely cannot tell.",
  );

  lines.push(...preferenceLines(preferences, travelerNameById, known));
  lines.push(...rewardsLines(rewards, travelerNameById, known));
  lines.push(...templateLines(templates, templateItems, known));
  lines.push(...historyLines(trips.filter(isPast), itinerary));

  const draftCount = trips.filter(isDraft).length;
  const upcomingCount = trips.filter((t) => !isPast(t) && !isDraft(t)).length;
  lines.push("");
  lines.push(
    trips.length
      ? `TRIPS (${trips.length} total: ${upcomingCount} still ahead, ${draftCount} ${
          draftCount === 1 ? "draft" : "drafts"
        }):`
      : "TRIPS: none yet — the family has no trips saved.",
  );

  for (const t of ordered) {
    known.trips.set(t.id, t.name);
    const itin = itinByTrip.get(t.id) || [];
    const pack = packByTrip.get(t.id) || [];
    const task = taskByTrip.get(t.id) || [];
    const note = noteByTrip.get(t.id) || [];

    known.tripContents.set(
      t.id,
      [
        `${itin.length} itinerary items`,
        `${pack.length} packing items`,
        `${task.length} tasks`,
        `${note.length} notes`,
      ].join(", "),
    );

    const countdown = t.start_date ? daysBetween(today, t.start_date) : null;
    // A draft's dates are a sketch, so dates in the past mean the sketch has
    // gone stale — not that the family took the trip.
    const when =
      countdown === null
        ? "dates not set"
        : countdown > 0
          ? `${countdown} days away`
          : countdown === 0
            ? "starts today"
            : isDraft(t)
              ? "the dates pencilled in have already gone by"
              : "already happened";

    lines.push(
      `- ${t.name} [id: ${t.id}] — ${t.destination || "destination TBD"}, ` +
        `${t.start_date || "?"} to ${t.end_date || "?"} (${when}), status ${
          t.status
        }${
          isDraft(t)
            ? " ← A DRAFT: an idea being worked out, sitting in Drafts on the Trips page, not on the family calendar"
            : ""
        }${t.id === focusTripId ? " ← OPEN" : ""}`,
    );
    if (t.summary) lines.push(`    summary: ${short(t.summary, 220)}`);
    const goingNames = travelers
      .filter((p) =>
        rosters.some((r) => r.trip_id === t.id && r.traveler_id === p.id),
      )
      .map((p) => p.name);
    lines.push(
      `    ${
        goingNames.length
          ? `on this trip: ${goingNames.join(", ")}`
          : "nobody added to this trip yet"
      }`,
    );
    lines.push(
      `    ${itin.length} itinerary items · packing ${
        pack.filter((p) => p.is_packed).length
      }/${pack.length} packed · tasks ${
        task.filter((k) => k.is_done).length
      }/${task.length} done · ${note.length} notes`,
    );
  }

  // Then the contents of every trip, so a change can be made from anywhere.
  for (const t of ordered) {
    const focused = t.id === focusTripId;
    const past = isPast(t);
    const itin = (itinByTrip.get(t.id) || [])
      .slice()
      .sort(
        (a, b) =>
          (a.item_date || "").localeCompare(b.item_date || "") ||
          (a.sort_order || 0) - (b.sort_order || 0),
      );
    const pack = packByTrip.get(t.id) || [];
    const task = taskByTrip.get(t.id) || [];
    const note = noteByTrip.get(t.id) || [];

    lines.push("");
    lines.push(
      `===== ${t.name.toUpperCase()} [trip id: ${t.id}]${
        focused
          ? " — THE TRIP THAT IS OPEN"
          : isDraft(t)
            ? " — a draft"
            : past
              ? " — already happened"
              : ""
      } =====`,
    );

    lines.push(`ITINERARY (${itin.length}):`);
    if (itin.length === 0) lines.push("(empty)");
    for (const i of itin) {
      known.itinerary_items.set(i.id, short(i.title, 60));
      known.rowTrip.set(i.id, t.id);
      const bits = [
        `id=${i.id}`,
        i.end_date && i.end_date > i.item_date
          ? `${i.item_date} to ${i.end_date}`
          : i.item_date || "no date",
        i.start_time ? i.start_time.slice(0, 5) : "all day",
        i.category,
        i.status,
        short(i.title, 90),
      ];
      if (i.location) bits.push(`at ${short(i.location, 60)}`);
      if (i.confirmation_number) bits.push(`conf ${i.confirmation_number}`);
      if (i.notes) bits.push(`notes: ${short(i.notes, 120)}`);
      if (i.rating) bits.push(`rated ${i.rating}/5`);
      if (i.review) bits.push(`review: ${short(i.review, 160)}`);
      lines.push(`- ${bits.join(" | ")}`);
    }

    const urgent = task.filter(
      (k) => !k.is_done && (k.priority || "").toLowerCase() === "high",
    ).length;
    lines.push(
      `TASKS (${task.length}, ${
        task.filter((k) => k.is_done).length
      } done${urgent ? `, ${urgent} high priority still open` : ""}):`,
    );
    if (task.length === 0) lines.push("(empty)");
    for (const k of task) {
      known.predeparture_tasks.set(k.id, short(k.title, 60));
      known.rowTrip.set(k.id, t.id);
      const urgency = (k.priority || "normal").toLowerCase();
      lines.push(
        `- id=${k.id} | ${k.is_done ? "done" : "open"} | ${k.assignee} | ${
          k.timing
        }${urgency !== "normal" ? ` | ${urgency} priority` : ""}${
          k.due_date ? ` | due ${k.due_date}` : ""
        } | ${short(k.title, 90)}`,
      );
    }

    const cap = focused ? PACKING_LINES_FOCUS : PACKING_LINES_OTHER;
    lines.push(
      `PACKING (${pack.length} items, ${
        pack.filter((p) => p.is_packed).length
      } packed):`,
    );
    if (pack.length === 0) lines.push("(empty)");
    for (const p of pack.slice(0, cap)) {
      known.packing_items.set(p.id, short(p.item, 60));
      known.rowTrip.set(p.id, t.id);
      lines.push(
        `- id=${p.id} | ${p.is_packed ? "packed" : "not packed"} | ${
          p.assignee
        } | ${p.category} | ${p.quantity ? `${p.quantity} × ` : ""}${short(
          p.item,
          70,
        )}`,
      );
    }
    if (pack.length > cap) {
      // Ids past the printed window still resolve, they just aren't listed.
      for (const p of pack.slice(cap)) {
        known.packing_items.set(p.id, short(p.item, 60));
        known.rowTrip.set(p.id, t.id);
      }
      lines.push(`(… ${pack.length - cap} more packing items not listed)`);
    }

    lines.push(`NOTES (${note.length}):`);
    if (note.length === 0) lines.push("(empty)");
    for (const n of note.slice(0, 25)) {
      known.trip_notes.set(n.id, short(n.title || n.body, 60));
      known.rowTrip.set(n.id, t.id);
      lines.push(
        `- id=${n.id} | ${n.title ? `${short(n.title, 60)}: ` : ""}${short(
          n.body,
          200,
        )}`,
      );
    }
  }

  return {
    text: lines.join("\n"),
    travelerNames,
    travelerIds,
    known,
    focusTripId: focusTrip ? focusTrip.id : null,
    focusTripName: focusTrip ? focusTrip.name : null,
  };
}

// The section of the trip the user is looking at when they open the assistant.
// Used to resolve requests that don't say which list they mean.
export const FOCUS_LABELS = {
  itinerary: "the Itinerary — the day-by-day schedule",
  packing: "the Packing list",
  tasks: "the Pre-departure tasks list",
  notes: "the Notes",
};

// What a vague question or a bare "add X" means inside each section.
const FOCUS_HINTS = {
  itinerary: {
    ask: '"What\'s left?" or "what do we still need?" means which itinerary items still need booking. "What are we doing?" means the schedule.',
    add: "a new itinerary item",
  },
  packing: {
    ask: '"What\'s left?" means what is still unpacked — summarize the unpacked packing items, not dining reservations. "What does Veda still need?" means her unpacked items.',
    add: "a new packing item",
  },
  tasks: {
    ask: '"What\'s left?" or "what\'s not done?" means which pre-departure tasks are still open.',
    add: "a new pre-departure task",
  },
  notes: {
    ask: '"What do we have?" means the saved notes.',
    add: "a new note",
  },
};

function focusSection(focus, tripName) {
  const label = FOCUS_LABELS[focus];
  const hint = FOCUS_HINTS[focus];
  if (!label || !hint || !tripName) return "";
  return `WHERE THE USER IS RIGHT NOW:
They have ${tripName} open and are looking at ${label}. Resolve anything vague against THAT section of THAT trip rather than the whole app:
- Questions: ${hint.ask} Answer about this section only, and do not switch to another section unless they name it.
- Additions: a bare "add X" means ${hint.add} on ${tripName}, unless X is plainly something else.
- References like "that one" or "the first one" mean an item in this section.
An explicit request still wins over this default — "add breakfast at 8 on the 21st" is an itinerary item no matter which section is open, and a request that names another trip goes to that trip.

`;
}

/** The one focus that is not a section of a trip: starting a trip from nothing. */
export const NEW_TRIP_FOCUS = "new_trip";

/** Opened from the Travel programs tab, which spans every trip and belongs to none. */
export const REWARDS_FOCUS = "rewards";

/** Opened from the Packing lists tab: the standing lists, not one trip's list. */
export const TEMPLATES_FOCUS = "templates";

export function isKnownFocus(focus) {
  return (
    Boolean(FOCUS_LABELS[focus]) ||
    focus === NEW_TRIP_FOCUS ||
    focus === REWARDS_FOCUS ||
    focus === TEMPLATES_FOCUS
  );
}

// On the Packing lists tab the subject is the standing list every future trip
// starts from, not the list of any trip in particular. Getting this wrong is
// worse than usual: an item meant for the standing list, added to one trip, goes
// unnoticed until the next trip turns up without it.
function templatesFocusSection(focus) {
  if (focus !== TEMPLATES_FOCUS) return "";
  return `WHERE THE USER IS RIGHT NOW:
They are on the Packing lists tab, editing the family's standing packing lists — the ones every new trip is built from — arranged by who packs what. Resolve anything vague against that:
- A bare "add X" means add X to a standing list with add_template_item, NOT to any trip's packing list. If they name a person, it is theirs; if they do not, decide from the item itself and say which list you put it on.
- "Take X off" or "we don't need X any more" means remove it from the standing list, so it stops appearing on future trips.
- "Move X to Steph" means change who packs it on the standing list.
- "What does Veda take?" means her items on the standing list, not what she has packed for a trip.
- Which list matters: the base list is what EVERY trip starts from, and the others are add-ons for a kind of trip. Cold-weather or beach-specific gear belongs on the matching add-on, not the base. Say which one you chose.
- Changing a standing list does not touch trips that already exist. If they want an existing trip updated too, add it to that trip as well and say you did both.
An explicit request still wins over this default — "add sunscreen to the Curaçao list" names a trip, so it goes there.

`;
}

// On the Travel programs tab a bare number is almost always a balance, and a bare brand
// name is almost always a program they want added to the list.
function rewardsFocusSection(focus) {
  if (focus !== REWARDS_FOCUS) return "";
  return `WHERE THE USER IS RIGHT NOW:
They are on the Travel programs tab, looking at the points, miles and credit cards listed below. Resolve anything vague against that:
- A bare number, or "I have 40k with them", is a points balance for one of those programs. Update it rather than asking what it is for.
- A bare brand or card name means add that program. Work out yourself whether it is an airline, a hotel, a cruise line, a car rental club or a credit card, and for a card fill in what it earns and where its points go.
- "What is that worth?" or "what could we do with these?" is about those balances. Answer from what is saved, name a trip a balance could go towards when one fits, and be honest that what a point is worth depends on what they redeem it for.
- "Which card?" means which of their own cards earns most on the spending they just described. Name every booking route that changes the answer, and mention any statement credit that would cover part of it.
An explicit request still wins over this default — a packing item is a packing item even when it is asked for from here.

`;
}

// Pressed "Create with Aly" on the Trips page, so the message below is an idea
// for a trip that does not exist yet rather than a question about one that does.
function newTripSection(focus) {
  if (focus !== NEW_TRIP_FOCUS) return "";
  return `WHAT THE USER IS DOING RIGHT NOW:
They pressed "Create with Aly" on the Trips page. The message below is the idea they typed for a brand-new trip that does not exist yet. So:
- Always write words as well as cards. A reply with nothing but a confirmation card in it is a bad reply.
- If something is missing that changes the whole shape of the trip — roughly when, roughly how long, or who is going — ask at most two short questions and make no tool calls yet. Anything smaller than that, decide yourself and say what you assumed.
- If they have not said where they want to go, that is the question to ask. Name two or three real destinations that fit what this family likes, one line each on why, and wait for them to pick. Do not create a trip to "somewhere warm" or a destination of "TBD".
- Otherwise draft the whole thing in one reply: call create_trip with status "draft", a name in the same style as their other trips, the destination, dates if they have given you enough to fix them, a one-line summary, and copy_base_packing true, which is what makes the app build the packing list — so leave the packing to it and add no packing items yourself. Then, in the SAME reply, call add_itinerary_item for each day of the trip and add_task for anything that has to be booked or sorted early, passing the new trip's exact name on every one.
- Nothing in a draft is booked, so give every itinerary item status "needs_booking" unless the user says a piece of it is already done, and never invent a confirmation number, a flight number or a price.
- Build it out of what the app already knows they like: their saved preferences, their own star ratings and reviews of places they have been, and the patterns from past trips. Say out loud which one drove a choice — "you gave that five stars, so I kept a night for it" — and say plainly when you are guessing instead.
- Use real, named places where you are confident they exist. Where you are not, write a plain placeholder like "Dinner somewhere in the old town" rather than inventing a restaurant.
- Keep the written reply to a couple of sentences about the shape of the trip. The cards carry the detail.

`;
}

// Aly holds many conversations rather than one endless thread, so she is told
// what the others were about and given the lines from them that look related to
// what was just asked. That is what lets someone start a fresh conversation and
// still ask "what did we decide about the flights?".
const MAX_LISTED = 12;
const MAX_RECALL_CHARS = 260;

function shortDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function oneLine(text, cap = MAX_RECALL_CHARS) {
  const clean = String(text || "")
    .replace(/\[\[|\]\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > cap ? `${clean.slice(0, cap)}…` : clean;
}

export function conversationsSection({ others = [], recall = [] } = {}) {
  if (!others.length && !recall.length) return "";
  const lines = [];
  if (others.length) {
    lines.push(
      "OTHER CONVERSATIONS THIS PERSON HAS HAD WITH YOU:",
      "Each one is separate, newest first. The conversation you are in now is not listed.",
    );
    for (const c of others.slice(0, MAX_LISTED)) {
      const parts = [`"${oneLine(c.title || "Untitled", 80)}"`];
      if (c.tripName) parts.push(`about ${c.tripName}`);
      if (c.updatedAt) parts.push(`last used ${shortDate(c.updatedAt)}`);
      parts.push(`${c.messageCount} message${c.messageCount === 1 ? "" : "s"}`);
      lines.push(`- ${parts.join(" · ")}`);
    }
    lines.push("");
  }
  if (recall.length) {
    lines.push(
      "LINES FROM THOSE CONVERSATIONS THAT LOOK RELATED TO WHAT WAS JUST ASKED:",
    );
    for (const hit of recall) {
      const who = hit.role === "assistant" ? "you said" : "they said";
      const when = shortDate(hit.createdAt);
      lines.push(
        `- in "${oneLine(hit.title || "a conversation", 80)}", ${who}${
          when ? ` on ${when}` : ""
        }: "${oneLine(hit.snippet)}"`,
      );
    }
    lines.push(
      "These were found by matching words, so some may be beside the point — use the ones that are actually relevant and ignore the rest. Say which conversation something came from when you lean on it. If they are asking about something you cannot find here, say you cannot find it rather than guessing at what was decided.",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildSystemPrompt(contextText, focus, focusTripName, extras) {
  const placeNote = focusTripName
    ? `The user opened you from inside ${focusTripName}, so that trip is the default for anything they do not pin elsewhere. You can still see and change every other trip.`
    : "The user opened you from a screen that spans every trip, so nothing is the default. You can see and change every trip.";

  return `You are Aly, the Meyer family's travel assistant, built into Alyeska, their private trip planner app. Mark, his wife Steph, and their daughter Veda all use it. Be warm, concise, and practical.

${placeNote}

WHAT YOU CAN CHANGE, FROM ANYWHERE IN THE APP:
- Trips themselves: create one, change its name, destination, dates, status or summary, and delete one.
- Anything inside any trip: itinerary items, packing items, pre-departure tasks and notes. Say which trip when you add something and the user has not made it obvious, using the trip's exact name from the context.
- Replacing a whole list, not editing it. When the user says to replace the packing list, or pastes a new list to use instead of the old one, call clear_packing_list once for that trip and then add_packing_item for each item on the new list. Never clear a list by calling delete_packing_item for every row; that is slow enough to fail. delete_packing_item is for taking out one or two named things.
- A new trip and everything that goes in it, in one reply. When the user says "make a trip for Italy" and pastes an old itinerary or packing list with it, call create_trip and then the add_ calls for its contents in the same reply, passing the new trip's exact name as the trip on each one. Do not ask them to create the trip first and paste again.
- The family's travel preferences — how they like to travel, on every trip. Lean on them whenever you suggest anything and say plainly when a suggestion goes against one. When the user tells you something durable ("we always want a late checkout", "Veda will not eat seafood"), save it. A one-off decision about a single trip is not a preference: that belongs on the itinerary, in a task or in a note.
- Whether a trip is a draft or a real plan. A draft is an idea the family is still working out: it lives in the Drafts section of the Trips page, it is not on their calendar, and it is never the next trip. Create one with status "draft" whenever you are planning something they have not decided on yet. Use "planning" for a trip they have committed to, and "booked" once they tell you it is paid for. A draft becomes a real trip when someone presses "Move to Upcoming trips" on it, so point them at that button rather than changing the status yourself unless they ask you to.
- The travel programs on the Travel programs tab: airline miles, hotel and cruise points, car rental clubs and their credit cards. Add one when the user mentions belonging to something or carrying a card, update a balance when they tell you a new one, and remove one they have closed. When you add a credit card, fill in what it earns — one rule per line, the multiplier and what it applies to — and where its points go, so the app can work out which card to put a booking on. Only write earning rules you are confident about, say where they came from, and tell them to check it against their own account.
- The family's ratings and reviews of places they have already been — hotels, excursions, activities and restaurants. Set a 1–5 star rating, a written note, or both. Only review something that has actually happened, and never write a review in your own words: use what the user actually said.

Every change you propose is shown to the user on a confirmation card that they must press to save, and a deletion card is clearly marked. So propose confidently and do not ask "are you sure" in text.

WHAT YOU CANNOT CHANGE:
- Who is on each trip. The roster is listed with each trip below; use it as written and never assume the whole family is going. Tell the user to tap the names in the trip header, or the trip chips on the People tab.
- The People tab: passports, licenses, Known Traveler and Global Entry numbers. Point the user there if they ask.

RULES:
- If the user asks for several changes in one message, emit a SEPARATE tool call for EVERY change. Never stop after the first one. Adding an itinerary item and adding a task are two separate calls.
- Never invent confirmation numbers, flight numbers, prices, addresses, dates, or times that the user did not provide and that are not in the context.
- If a request is genuinely ambiguous about what, who, when, or which trip, ask one short clarifying question and make no tool calls.
- Relative dates are fine to compute from TODAY and the trip's dates. "A week before the trip" means seven days before that trip's start date.
- Use the exact id from the context for every update, completion and deletion. Never make up an id. If you cannot find a matching row, say so instead of guessing.
- For updates, include only the fields that actually change.
- Packing and task assignees must be one of the listed travelers, or "Shared" for family items.
- Every task carries a priority: high, normal or low. Normal is what a task is unless somebody says otherwise, and it is deliberately quiet — the Tasks tab only badges the high and low ones. Set a priority only when the user is explicit about urgency ("this one is urgent", "that can wait"), and never sprinkle high priority across a batch of tasks on your own. When they ask what matters most, read it off the priorities and the due dates rather than guessing.
- A trip's first and last day normally follow its itinerary, so moving a flight or a check-out can move the trip's dates on its own. Say so when it is relevant. The "Edit trip" button in the trip header has a switch for pinning dates by hand.
- Anything on an itinerary marked "needs booking" has a "Make this a task" button on its card, which puts a matching "Book …" task on the Tasks tab and links the two. When several things need booking at once there is a bar at the top of the Itinerary offering to make all of them. Point people at that instead of asking them to retype tasks by hand.
- The Itinerary tab shows one day at a time: a strip of day tiles across the top, then that day's plans underneath. People move between days by tapping a tile, swiping, or using the arrows, and adding an item from a day fills in that date.
- Trips marked "already happened", or whose status is complete or archived, are finished. Talk about them in the past tense, treat them as the record the family keeps, and do not suggest planning work for them unless the user asks. Do not count them as the next trip. The "Preferences & Reviews" tab is built from their hotels, excursions, activities and restaurants, and it is also where the family's standing travel preferences live — point people there for either. The Travel programs tab is where the points, miles and cards live, and it is the place to send someone who wants to add a program or correct a balance by hand.
- Aly keeps separate conversations rather than one endless thread, and the person picks one from a list when they open you. What you are shown in full is the conversation you are in. Any others are listed further down, along with the lines from them that look related to what was just asked, and you can refer to them by name — "we worked that out in the Curacao flights conversation". Something agreed elsewhere counts, but a receipt is still the only proof a change was actually saved.
- The conversation you are shown is the saved record of this thread, kept in the app itself, so lean on it: earlier turns tell you who "her" is and which trip "the same one" means. Lines like "Saved 2 changes." or "Nothing was saved." are receipts written after the user pressed the card, and they are the truth about what actually happened. When someone asks whether something went through, answer from the receipt in plain words instead of proposing the change over again — only propose it again if they ask you to.
- When you suggest or plan anything, start from what the app already knows: the saved preferences, the family's own stars and reviews of places they have been, and the patterns from past trips. Name the reason when it drives a choice. A 1- or 2-star review is a signal to avoid that kind of thing. The patterns are worked out from the record rather than stated by the family, so never quote one back as something they said.
- Answer questions from the context below rather than general knowledge, and say plainly when something is not saved yet.
- When a question does not name a trip and no trip is open, answer across all of them, newest plans first.
- Keep replies short. A sentence or two, or a tight list. No preamble.

${newTripSection(focus)}${rewardsFocusSection(focus)}${templatesFocusSection(focus)}${focusSection(focus, focusTripName)}${conversationsSection(extras)}THE FAMILY'S TRIPS:
${contextText}`;
}
