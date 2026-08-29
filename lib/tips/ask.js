// Aly asking to go and look, rather than answering off the top of her head.
//
// find_tips is the odd one out among her tools. Everything else she can do is
// either a change to propose or an answer to speak, and both of those fit inside
// one reply. Researching does not: a grounded look eats most of the sixty seconds
// the chat route is allowed, and walking a whole trip takes several looks. Doing
// it inside the turn would mean the request that finally times out is the one
// that was going to be useful.
//
// So the call is turned into an instruction. The route hands the screen a small
// object saying what to look at, the screen drives the same loop the "Look for
// tips" button drives, and the tips land where tips live rather than being
// recited into the transcript and lost. It is the one place where Aly's answer is
// a thing that happens after she stops talking.
//
// Pure: calls in, instruction out. No database, no model, no clock.

// "wallet" is the odd one: it needs no trip, and it is really two looks -- the
// programs they hold, then the welcome offers on cards they do not. Both are
// family-wide, so it is the one scope that works from any screen.
const SCOPES = new Set(["trip", "packing", "item", "wallet"]);

/** The rest of a name, once punctuation and case stop mattering. */
function loose(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Which itinerary item she meant, by the name she used.
 *
 * The model sees shortened titles in its context, so an exact match is the lucky
 * case rather than the normal one. Falls back to a containment match either way
 * round, and refuses to choose when two items match equally well — a look at the
 * wrong booking is worse than a look at the whole trip.
 *
 * @param {string} said        the title the model used
 * @param {Map} items          known.itinerary_items: id → title
 * @param {Map} rowTrip        known.rowTrip: id → trip id
 * @param {string} tripId      the trip in focus
 * @returns {string|null}
 */
export function itemIdFor(said, items, rowTrip, tripId) {
  const needle = loose(said);
  if (needle.length < 3 || !items) return null;

  const pool = [];
  for (const [id, title] of items) {
    if (tripId && rowTrip && rowTrip.get(id) && rowTrip.get(id) !== tripId) {
      continue;
    }
    pool.push({ id, title: loose(title) });
  }

  const exact = pool.filter((row) => row.title === needle);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null;

  const near = pool.filter(
    (row) =>
      (row.title.length >= 3 && needle.includes(row.title)) ||
      row.title.includes(needle),
  );
  return near.length === 1 ? near[0].id : null;
}

/**
 * One find_tips call, turned into something the screen can carry out.
 *
 * @param {object} call        {name, args}
 * @param {object} where       {tripId, tripName, known}
 * @returns {{look: object|null, problem: string|null}}
 */
export function lookFrom(call, { tripId = null, tripName = "", known = {} }) {
  const args = call?.args && typeof call.args === "object" ? call.args : {};

  // The Wallet belongs to the family rather than to a trip, so it is answerable
  // from anywhere and is settled before the question of which trip is open.
  if (args.scope === "wallet") {
    return {
      look: {
        tripId: null,
        tripName: "",
        scope: "wallet",
        itemId: null,
        item: null,
        asked: null,
      },
      problem: null,
    };
  }

  // Researching needs somewhere to research. On the home screen or the trips
  // list there is no trip in focus, and rather than guessing at one she says so.
  if (!tripId) {
    return {
      look: null,
      problem: "Open the trip you want me to look at and ask me again there.",
    };
  }

  const scope = SCOPES.has(args.scope) ? args.scope : "trip";
  let itemId = null;
  if (scope === "item") {
    itemId = itemIdFor(args.item, known.itinerary_items, known.rowTrip, tripId);
    // Named something not on this trip, or something ambiguous. The whole trip
    // is the safe reading, and it covers the bookings anyway.
    if (!itemId) {
      return {
        look: {
          tripId,
          tripName,
          scope: "trip",
          itemId: null,
          item: null,
          asked: String(args.item || "").slice(0, 90),
        },
        problem: null,
      };
    }
  }

  return {
    look: {
      tripId,
      tripName,
      scope,
      itemId,
      item: itemId ? known.itinerary_items?.get(itemId) || null : null,
      asked: null,
    },
    problem: null,
  };
}

/**
 * Pull the find_tips call out of a reply, leaving the changes behind.
 *
 * Only the first survives. A model that calls it three times has decided to
 * spend three minutes of somebody's afternoon on the same question.
 */
export function splitTipCalls(calls) {
  const rest = [];
  let asked = null;
  for (const call of Array.isArray(calls) ? calls : []) {
    if (call?.name === "find_tips") {
      if (!asked) asked = call;
      continue;
    }
    rest.push(call);
  }
  return { calls: rest, asked };
}

/** What she says while the looking is about to start. */
export function lookLine(look) {
  if (!look) return "";
  const where =
    look.scope === "wallet"
      ? "your Wallet — what you already hold, and what is on offer on cards you do not"
      : look.scope === "packing"
        ? "what you are taking"
        : look.scope === "item" && look.item
          ? look.item
          : look.tripName || "this trip";
  const asked = look.asked
    ? ` I could not find “${look.asked}” on this trip, so I am looking at the whole thing instead.`
    : "";
  return `Let me go and look into ${where}. This takes up to a minute.${asked}`;
}

/** What the screen says when the looking is over. */
export function foundLine(found, look = null) {
  if (found === 1) return "One thing worth knowing. It is on the screen now.";
  if (found > 1) return `${found} things worth knowing, now on the screen.`;
  const where =
    look?.scope === "packing"
      ? "the packing list"
      : look?.scope === "wallet"
        ? "your programs and today's card offers"
        : "this";
  return `I read up on ${where} and found nothing worth interrupting you about, which is a real answer rather than a failure.`;
}

/** The steps one instruction turns into, in the order they should run. */
export function stepsFor(look, itinerary = [], today = "") {
  if (!look) return [];
  if (look.scope === "item") {
    return [{ scope: "item", itemId: look.itemId }];
  }
  if (look.scope === "packing") return [{ scope: "packing", itemId: null }];
  // Two questions, asked separately: what to do about what they hold, and what is
  // worth opening that they do not. One request each, because a grounded look-up
  // is measured in tens of seconds.
  if (look.scope === "wallet")
    return [
      { scope: "wallet", itemId: null },
      { scope: "offers", itemId: null },
    ];

  // A trip-level look is worth walking, the same way the button walks it: the
  // trip, then the packing list, then the next few dated bookings. Nobody is
  // going to ask about thirty itinerary cards one at a time.
  const steps = [
    { scope: "trip", itemId: null },
    { scope: "packing", itemId: null },
  ];
  const upcoming = (itinerary || [])
    .filter(
      (row) => row?.id && row?.item_date && (!today || row.item_date >= today),
    )
    .sort((a, b) => String(a.item_date).localeCompare(String(b.item_date)))
    .slice(0, 3);
  for (const row of upcoming) steps.push({ scope: "item", itemId: row.id });
  return steps;
}
