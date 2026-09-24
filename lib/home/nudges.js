/**
 * The three messages the front door shows Aly sending unasked, shared by the
 * hero (NudgeCard, where why each one is what it is is written down) and the
 * When it changes scene, which shows the third as the notification it arrives
 * as. One copy, so the two can never tell the same morning differently.
 */
export const NUDGES = [
  {
    sent: "Jan 8 · 65 days before Maui",
    title: "Dani’s license expires before the trip",
    text: "It expires March 2, twelve days before the flight and the rental car pickup. Renew by mid\u2011February.",
    act: "Add reminder",
    level: "high",
    tag: "Needed to travel",
  },
  {
    sent: "Feb 3 · 39 days before Maui",
    title: "Waiʻānapanapa needs a reservation",
    text: "Your Road to Hāna day is Monday, March 16. The black sand beach admits visitors only with a timed reservation, and none are sold on the day. Reservations for March 16 open February 14 at midnight Hawaii time.",
    act: "Remind me Feb 14",
    level: "medium",
    tag: "Book Feb 14",
  },
  {
    sent: "Tue 11:10 AM · Day 4 in Maui",
    title: "Showers from 1 to 3 this afternoon",
    text: "Lunch at the condo moves to 12:30, so you’re home before they start. The snorkel boat is back by then, and the sunset walk should be clear.",
    act: "Apply",
    level: "low",
    tag: "Last minute",
  },
];

/** The rain change on day four, the one that arrives while you are there. */
export const RAIN_NUDGE = NUDGES[2];
