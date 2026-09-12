// The three promises that decide how the app is built, and under them the two
// commitments the company makes about itself.
//
// They live here rather than inside the page that used to hold them, because
// they are now read in two places: the Our Pledge page in the More menu, and a
// panel on Meet Aly that a family opens before they have agreed to anything. A
// promise worded one way on the first screen and another way on the page it
// links to is not a promise, so there is one copy of the words and both surfaces
// render it.
//
// The double hyphens these paragraphs used to carry rendered as two literal
// hyphens on the page, which reads as a typo in the middle of a promise. Where an
// aside is genuinely needed it is an em dash character now; everywhere else a
// colon or a comma does the job.

export const PLEDGE_INTRO =
  "Three promises that decide how the app is built. Not marketing lines. They are the reason Aly answers the way she does, and the reason the app stays out of your inbox and off your data.";

export const PLEDGE_PROMISES = [
  {
    title: "No bias",
    body: "Aly does not have preferred hotels, preferred airlines, or preferred anything. When she suggests a place to stay, a restaurant to try, or a route to take, she is choosing on what fits the family in front of her: your preferences, your past reviews, your travelers' ages and pace. Not what a supplier paid her to say. She will disagree with a popular pick when it is wrong for you, and she will point you at an unknown one when it is right.",
  },
  {
    title: "No selling your information",
    body: "Nothing about your family, your travelers, your trips, your preferences, or your inbox is sold, licensed, shared with a data broker, or handed to an advertiser. Ever. What we store is what the app needs to work for you, kept where you can see it and change it, and used only to answer the questions you ask. Delete your account and it goes.",
  },
  {
    title: "No ads, no paid placements",
    body: "No banner ads, no sponsored suggestions, no highlighted results in exchange for a fee, no partner tiles that look like recommendations. The app makes its money the same way a family does, from the people using it, so it does not have to make it any other way. If a supplier gets mentioned, it is because Aly thinks it is the right answer for the family asking.",
  },
];

// The second block on the pledge screen. It sits under the three promises and is
// deliberately quieter than them: the promises are about the family reading the
// screen, and these are about how the company behind the app runs, which matters
// less to them and should not be allowed to crowd out the part that does.
//
// Every number here is one somebody could hold the company to, which is the only
// reason it is worth printing. "Net revenue" is defined on the screen rather than
// in a policy nobody opens, the start is a date rather than a someday, and the
// last two sentences give up the two claims a travel app is most tempted to make:
// that its giving has no effect on what it recommends is stated because the
// opposite would be a paid placement wearing a better coat, and that traveling is
// not made neutral by a donation is stated because it is true and every competitor
// implies otherwise.
export const PLEDGE_COMPANY_HEADING = "Responsible AI and conservation";

export const PLEDGE_COMPANY_INTRO =
  "The three promises above are about you. These two are about how the company behind the app runs.";

export const PLEDGE_COMPANY_PARAGRAPHS = [
  "Aly uses AI with you in control. She says when she is unsure instead of guessing at you, she keeps your household, your work travel, and any group you travel with separate unless you tell her to cross between them, and she proposes changes to your plans for you to accept rather than making them behind your back. You can correct what she knows, report an answer that was wrong, take a copy of what is yours, and delete it. We measure the AI and the data the app uses and cut whatever it does not need.",
  "Travel depends on places worth protecting, so a share of what the app earns goes to protecting them. Alyeska donates 1% of net revenue \u2014 what we keep after refunds and chargebacks \u2014 to vetted conservation organizations, starting with the first full calendar year we collect paid revenue, and publishes each year how much was given, who received it, and how they were chosen. That giving never changes what Aly recommends: no destination, hotel, or operator is ranked higher because of it. And we will not tell you that using this app, or traveling more, is neutral or good for the environment. It is not, and a donation does not make it so.",
];

export const PLEDGE_THIRD_PARTY =
  "These promises apply to the app itself. Any third party the app has to call to answer a question \u2014 a map provider, a weather service, a model we use to draft an answer \u2014 is chosen on the same terms, and only what is needed to answer the question is sent.";
