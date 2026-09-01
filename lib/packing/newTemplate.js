/**
 * Asking Aly for a packing template that does not exist yet.
 *
 * Every sentence built here is a message the user is about to send, not a write:
 * nothing in this file touches the database. Aly reads the sentence, calls
 * create_template, and shows the list for approval like any other change.
 *
 * Two things had to be carried by the wording rather than by a form.
 *
 * The first is the word "packing template" itself. create_template is not in the
 * Templates screen's tool set -- rename_template took its place, because the set
 * has a ceiling -- so it is reached by a rescue that matches the words. A seed
 * that said "start a new list for horse shows" and nothing else would be sent to
 * a model that cannot create one. Every sentence below says "packing template"
 * outright for that reason, and the tests pin it.
 *
 * The second is the difference between the first list and the fifth. The first
 * one a family has becomes the base: every trip is built from it, so it wants
 * the toothbrushes and the phone chargers. Every list after it is an add-on, and
 * an add-on that repeats the base list is worse than no add-on, because those
 * rows then arrive on the trip twice. So the same button says a different thing
 * depending on whether there is a base list already.
 */

const DASH = "\u2014";

/** The base list, when a family has none, is the one thing worth naming for them. */
export const FIRST_NAME = "Base packing list";

/**
 * What somebody types into the "what goes on it" box, shown as examples. Written
 * at full length on purpose: a one-word example produces a one-word answer, and
 * a one-word answer gives Aly nothing to build a list out of.
 */
export const TEMPLATE_EXAMPLES = [
  "Clothes for a week, toiletries, chargers, passports, the medicine bag.",
  "Everything specific to a horse show: boots, breeches, show shirts, the grooming kit, hay nets and buckets.",
  "The things a cruise needs that nothing else does: door magnets, magnetic hooks, lanyards, a small nightlight.",
];

/** A trip is only worth copying if something was actually packed for it. */
export function packedTrips(trips = []) {
  return (trips || [])
    .filter((t) => t && t.id && t.name && Number(t.itemCount) > 0)
    .slice()
    .sort((a, b) =>
      String(b.start_date || "").localeCompare(a.start_date || ""),
    );
}

/** "111 things packed" -- the number is what tells you which trip to pick. */
export function sourceLine(trip) {
  const n = Number(trip?.itemCount) || 0;
  return `${n} thing${n === 1 ? "" : "s"} packed`;
}

/** A sensible name to offer for a list copied off a trip: "Europe 2026 list". */
export function suggestName(trip, first = false) {
  if (first) return FIRST_NAME;
  const name = String(trip?.name || "").trim();
  return name ? `${name} list` : "";
}

function tidy(text, max = 1200) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanName(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * The sentence that says which kind of list this is, and therefore what may go
 * on it. This is the line that keeps an add-on from being a second copy of the
 * base list.
 */
function scopeLine(first) {
  return first
    ? "This is the base list every trip will be built from, so it should hold the things we take whatever we are doing."
    : `This is an add-on for that kind of trip, so put only the things that are specific to it ${DASH} leave off the everyday clothes and toiletries that are already on the base list.`;
}

// Said on every one of them. Categories are how the trip screen groups a list,
// whose it is decides whose suitcase it lands in, and being shown the list before
// it is saved is the difference between a suggestion and a fait accompli.
const HOW = `Group them into categories, say who each one is for or mark it as shared, and show me the list before you save it.`;

/**
 * "Start a packing template called X, holding Y." Returns "" when there is
 * nothing to send, so a button can be disabled on the same rule the sentence is
 * built by.
 */
export function templateRequest({ name, about, first = false } = {}) {
  const called = cleanName(name);
  const holds = tidy(about);
  if (!called && !holds) return "";
  const opening = called
    ? `Start a new packing template called \u201C${called}\u201D.`
    : `Start a new packing template.`;
  const what = holds
    ? ` What goes on it: ${holds}`
    : ` Ask me what should go on it.`;
  const named = called ? "" : " Suggest a name for it as well.";
  return `${opening}${what}${named} ${scopeLine(first)} ${HOW}`;
}

/**
 * The same thing, built from a trip the family has already packed for. The copy
 * itself is create_template's job: it reads the trip's own rows, and it drops
 * anything the base list already covers, so an add-on made this way is only ever
 * the extras. The sentence says so, because otherwise the item count that comes
 * back looks like a bug.
 */
export function fromTripRequest({ trip, name, first = false } = {}) {
  const from = String(trip?.name || "").trim();
  if (!from) return "";
  const called = cleanName(name) || suggestName(trip, first);
  if (!called) return "";
  const note = first
    ? `This is the base list every trip will be built from, so take all of it.`
    : `Anything already on the base list will be left off, so what lands on this one is only the extras ${DASH} that is what I want.`;
  return `Start a new packing template called \u201C${called}\u201D from what we packed for ${from}. ${note} Tell me how many items came across, and what you left off.`;
}

/**
 * What the "Create packing template" button puts in the message box, on a screen
 * that already has lists. It is not sent: the two things only they know are left
 * blank on their own lines, and the instructions underneath are already right, so
 * what they have to do is fill in two gaps rather than compose a brief.
 */
export function blankRequest({ hasBase = true } = {}) {
  const scope = hasBase
    ? `Only the things that are specific to that kind of trip ${DASH} the everyday clothes and toiletries are already on the base list.`
    : `We have no base list yet, so this one holds the things we take whatever we are doing.`;
  return [
    "Start a new packing template.",
    "",
    "Call it: ",
    "What goes on it: ",
    "",
    `${scope} ${HOW}`,
  ].join("\n");
}

/**
 * "Propose items automatically" -- asking Aly what is missing from a list that
 * already exists.
 *
 * The sentence has to do three things the button cannot. It has to say which
 * list, by its exact name, because Aly is looking at all of them. It has to say
 * not to repeat what is already there -- she is given every item on every list,
 * so this is a thing she can check rather than guess at. And it has to ask for
 * one call per item, because that is what puts each suggestion on its own line
 * with its own tick, which is the whole point: a proposal you can take two
 * thirds of.
 */
export function proposeRequest({
  name,
  description,
  isBase = false,
  count = 0,
} = {}) {
  const list = cleanName(name);
  if (!list) return "";
  const what = tidy(description, 200);
  const kind = isBase
    ? `It is the base list, so it is about the things we take whatever we are doing, not any one kind of trip.`
    : `It is an add-on for a particular kind of trip, so only things specific to that ${DASH} nothing that belongs on the base list.`;
  const has = count
    ? `It already has ${count} item${count === 1 ? "" : "s"} on it; do not suggest anything that is already there, or a different name for something that is.`
    : `It is empty, so start it off properly.`;
  return [
    `Look at the packing template called \u201C${list}\u201D and propose the items it is missing.`,
    what ? `What it is for: ${what}` : "",
    kind,
    has,
    `Add each one as its own change so I can take some and leave others. Say who each is for or mark it as shared, put it in a category, and give a quantity where the number matters.`,
  ]
    .filter(Boolean)
    .join(" ");
}
