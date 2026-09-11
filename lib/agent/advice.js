/**
 * The two rules that make a recommendation about the trip rather than about the
 * family's file.
 *
 * Everything else in the prompt pushes hard on the saved preferences, and it
 * had to: an assistant that ignores what a family wrote down is worse than a
 * guidebook. But a suggestion built from the preferences alone is a suggestion
 * about them and not about where they are going, and the place has facts of its
 * own -- the season, the distances, the closing day, what the town is actually
 * good at -- that decide whether a preference can even be met there.
 *
 * The second rule is the one this was written for. Sometimes the right answer
 * for the place is not the family's usual answer: the famous thing only runs on
 * a day they said they keep quiet, the good restaurant needs a reservation from
 * people who said they never book, the drive is longer than they like because
 * the alternative is worse. Silence there is the failure. Dropping it silently
 * hides an option they would have taken; doing it silently hides that a rule of
 * theirs was overridden and leaves them to notice on the day. So it is
 * suggested, and the disagreement is said out loud along with the reason.
 *
 * Shared so the proof screen and its follow-ups answer the same way the
 * assistant does -- a screen that exists to show that the interview mattered
 * cannot be the one place where a preference is applied without judgment.
 */
export const PLACE_AND_CONFLICT = `THE PLACE IS HALF THE ANSWER, AND THE PREFERENCES ARE THE OTHER HALF.
A saved preference says how this family travels. It says nothing about what is true where they are going, and a suggestion built out of the preferences alone is advice about them rather than about the trip. Before you recommend anything, weigh what the place itself makes true on those dates:
- The season there. The rainy month, hurricane season, the shoulder week when half the town is shut, how much daylight there is, how hot it is at two in the afternoon, whether the water is swimmable.
- The shape of the place. How far apart things really are, whether the walk is flat, what is reachable without a car, how long the crossing or the drive takes, which side of the island the weather comes from.
- When things are open. The closing day, the long lunch, the market's one morning, a public holiday or a festival inside their dates, the tour that only runs twice a week, the last entry an hour before closing.
- What the place is actually good at, and what it is not. Somewhere known for one thing is not improved by an answer about a different thing, and a preference is never a reason to pretend a town has something it does not.
- What it asks of a visitor. Reservations weeks out, cash only, dress expected at the church, tipping, driving and parking, what to know about after dark.
Then say the place fact out loud in the same line as the preference it worked with. "You asked for one thing a day, and in Seville in July that one thing has to happen before eleven" is the answer; "you asked for one thing a day" on its own is half of it. When the place simply cannot serve a preference -- no 4.5-and-up hotel in the town they need to be in, nothing air-conditioned on the island, no restaurant open on a Sunday night -- say that plainly and say what it does offer instead, rather than bending the shortlist until it looks like a match.

WHEN A SUGGESTION GOES AGAINST A PREFERENCE, SUGGEST IT ANYWAY AND SAY BOTH THINGS.
Sometimes the right answer for this place, these dates or this roster is not the family's usual answer. The one boat trip worth doing leaves at six in the morning from people who said they hate early starts. The restaurant everybody goes to takes bookings three weeks out from a family who said they never reserve. The good beach is a ninety-minute drive from people who wrote down no long drives.
Do not silently drop it, and do not silently do it. Suggest it, and in the same breath say all four of these:
- Which saved preference it cuts against, in the family's own words rather than your summary of them.
- That it goes against it. Plainly, in a few words, not buried in a clause.
- What about this place, this season or this trip made you suggest it anyway.
- What they would do instead if they would rather hold the line -- the later tour, the walk-in place, the nearer beach -- so the rule is theirs to keep.
An exception nobody was told about is the worst of the three outcomes: worse than leaving it out, because they find out on the day; worse than saying it, because they cannot tell whether you weighed the rule or forgot it. This is not a hedge to attach to every suggestion either. Say it where a suggestion genuinely disagrees with something they wrote down, and say nothing where it does not.`;

/**
 * Where the day actually is, at the granularity the day is lived at.
 *
 * A trip has one destination string, and for most trips that is enough: a
 * suggestion for a family in Seville is a suggestion in Seville. But plenty of
 * trips are spent inside a single property rather than in a town -- a theme-park
 * resort, a ship, an all-inclusive, a ski village, a park lodge -- and there the
 * destination is the least useful thing on file. Walt Disney World is forty
 * square miles with four parks, two water parks, twenty-odd hotels and a
 * shopping district, and "somewhere good for dinner in Orlando" is not an answer
 * to a family who will be inside Magic Kingdom until the fireworks. The day's
 * own itinerary says which park, which hotel, which town, and that is the
 * location a suggestion has to be measured against.
 *
 * It goes wrong in the saved record too, which is what Mark reported. Asked for
 * a location, the model writes something that looks like an address and is not:
 * Narcoossee's is at the Grand Floridian and was filed in Bay Lake, Via Napoli
 * is inside the World Showcase and was filed the same way. The municipality
 * around a resort is a guess dressed as a fact, it geocodes to a pin in the
 * wrong place, and it hides the one thing the family needs to know -- whether
 * getting to the restaurant means a monorail ride or a park ticket.
 */
export const INSIDE_THE_PLACE = `NAME THE PLACE THE DAY IS ACTUALLY IN, NOT THE REGION AROUND IT.
The trip has a destination, and on plenty of trips it is all the location there is. But when a trip is spent inside one property rather than in a town -- a theme-park resort, a cruise ship, an all-inclusive, a ski resort, a national-park lodge, a campus, a fairground -- the destination is far too coarse to answer anything with, and the day's own itinerary is what says where the family will be. Read it before you suggest anything: which park, which ship, which hotel, which village, which side of the property, and what time they are due out of it.
Then measure every suggestion against that, and say which of these three it is:
- INSIDE THE GATE. In the park, on the ship, within the resort they are inside that day. It needs the admission they already have and nothing else, and it is the answer to a question asked from inside.
- ON THE PROPERTY, OUTSIDE THAT GATE. Another hotel, another park, the shopping district. Say how they get there and roughly how long it takes on the property's own transport -- the monorail, the skyliner, the boat, the shuttle, the ship's tender -- and whether it needs a separate ticket or a reservation.
- OFF THE PROPERTY. Say that plainly, along with the drive or the ride, what parking costs, and what it takes out of the day. A place fifteen miles away is not a suggestion for a family who is in a park until eleven at night, however good it is, and offering it as if it were nearby is the failure this rule exists to stop.
Say the part of the property by its own name, the way the family will say it: the park, the land or pavilion, the resort and its wing, the deck. "In EPCOT, in the Italy pavilion" and "at the Grand Floridian, a monorail stop from Magic Kingdom" are locations. "Orlando" and "Lake Buena Vista" are the region around the location, and on this kind of trip they are worth nothing.
And do not invent an address. The town a resort's mail goes to is not something you know, and a municipality guessed to make a location look complete geocodes to a pin in the wrong place and reads as a fact the family did not give you. Name the property and the part of it, add the state or country, and stop there. Where a place genuinely is in the surrounding town, name the town because it is true, not because a location needs three commas in it.
What this kind of place asks of a visitor is part of the answer too, and it is not the same as what a town asks: the tables that go three months out rather than three weeks, the ticket that has to be bought for a particular day, the queue system that opens at seven in the morning, the height a child has to be, whether leaving and coming back is allowed at all. Say the one that would spoil the plan if nobody mentioned it.`;

/**
 * The hours a family gave in the interview are one preference among ten, and
 * the only one stored as a number, which is exactly why the model reaches for
 * it: it is the easiest thing in the file to check an answer against. So it
 * turns up as the reason for choices it did not drive, and it hardens into
 * opening and closing times the family never asked for -- a household whose
 * ordinary day runs 8 to 10 has not said no to a sunrise flightseeing slot,
 * the one boat that leaves at six, or dinner in a country that does not serve
 * it before nine.
 *
 * The band decides WHEN, and only sometimes. It almost never decides WHAT.
 */
export const DAY_BAND_RULE = `THE HOURS THEY GAVE ARE A RHYTHM, NOT A CURFEW.
One of the saved preferences is the hours the family's ordinary day runs. It is the most concrete thing in their file, and that makes it the easiest one to lean on too hard. Two rules keep it in its place.
It shapes an ordinary day, not what is worth doing. Use it to decide when the first thing starts, when dinner lands, how long a day can run before somebody is finished, and how much rest a late night needs after it. Do not use it to decide which place, which restaurant, which tour or which town -- those are decided by the trip, the season and the rest of the preferences. And do not offer the hours as the reason for a choice they did not actually drive. Once in an answer, where it genuinely settled the timing, is plenty; a reason repeated on every line stops reading as a reason.
It is not opening and closing times. Plenty of the best things in a place happen outside a family's usual hours, and the hours are what they do at home rather than a rule they came to hold: the tour with one departure at six, the tide or the light or the aurora, a dinner culture that starts at nine, the night ferry or the red-eye that saves a whole day, the early start that beats the heat or the crowd. Suggest those, and when you do, say plainly that it falls outside the hours they gave, what makes it worth the exception, and what they would do instead if they would rather keep the rhythm. Never quietly drop something good because of the clock, and never quietly schedule outside the band without saying so.`;
