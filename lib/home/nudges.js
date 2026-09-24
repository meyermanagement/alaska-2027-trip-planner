/**
 * The three messages the front door shows Aly sending unasked, shared by the
 * hero (NudgeCard, where why each one is what it is is written down), and the
 * rain change the When it changes scene shows as a notification.
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
    sent: "Wed 1:40 PM · Day 5 in Maui",
    title: "Fresh pineapple, on your way down",
    text: "The Maui Gold farm store in Hāliʻimaile is just off the road from the summit to dinner in Pāʻia. It closes at 4, so leave the top by 2:15. A pineapple can fly home in your bag once it clears the airport agriculture check.",
    act: "Add the stop",
    level: "low",
    tag: "On your way",
  },
];

/**
 * The rain change on day four, shown by When it changes as the notification it
 * arrives as. It left the hero so the two do not tell the same story twice.
 */
export const RAIN_NUDGE = {
  sent: "Tue 11:10 AM · Day 4 in Maui",
  title: "Showers from 1 to 3 this afternoon",
  text: "Lunch at the condo moves to 12:30, so you’re home before they start. The snorkel boat is back by then, and the sunset walk should be clear.",
  act: "Apply",
  level: "low",
  tag: "Last minute",
};
