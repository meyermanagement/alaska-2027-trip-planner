// The topic each interview slot files preferences under.
//
// A base answer and every promoted why chip for that answer share the same
// topic, so a Preferences page reader sees "the money whys" grouped with "the
// money answer" rather than scattered.
//
// The chosen topic strings are the vocabulary already used by rows Mark added
// himself on Preferences (Transportation, Food, Accommodations, Excursions,
// Daily Pace, Who we are) so promoted whys land in the same buckets as
// hand-written preferences. money is the exception: its base answer might be
// Accommodations, Food, Excursions, or Transportation depending on where the
// household spends, so those whys get their own topic that names the question
// itself.
//
// Kept as a separate module (not on the question object) so the migration and
// the writer both point at the same source of truth without pulling the whole
// interview module into a SQL context.
export const SLOT_TOPIC = {
  pace: "Daily Pace",
  day_shape: "Daily Pace",
  doing_or_seeing: "Excursions",
  staying: "Accommodations",
  getting_around: "Transportation",
  food: "Food",
  crowds: "Excursions",
  money: "Where money goes",
};

/** The topic a slot's rows file under, or null when the slot has no mapping. */
export function topicForSlot(slot) {
  return SLOT_TOPIC[slot] || null;
}
