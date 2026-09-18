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
  "Five promises that decide how the app is built. Not marketing lines. The first three are about you: the reason Aly answers the way she does, and the reason the app stays out of your inbox and off your data. The last two are about how the company behind it runs.";

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

// The second block on the pledge screen: what the company promises about itself,
// under what it promises the family reading the screen.
//
// It was two long paragraphs and nobody would have finished them. A promise that
// is not read is not a promise, so each one is now a short line saying what it is
// and then the terms of it, one per line, in the fewest words that still leave
// something to hold the company to. Everything a customer cannot check has been
// cut; every number that survived is one that can be audited.
//
// Two of these lines give something up on purpose. That the giving does not change
// what Aly recommends is stated because the opposite would be a paid placement
// wearing a better coat. That the app will not call travel good for the
// environment is stated because it is not, and a donation does not make it so.
export const PLEDGE_COMPANY_HEADING = "Responsible AI and conservation";

export const PLEDGE_COMPANY_PARTS = [
  {
    title: "How Aly uses AI",
    lead: "You stay in control of the AI, and of what it knows about you.",
    points: [
      "She says when she is unsure instead of guessing at you.",
      "Household, work, and group travel stay separate unless you tell her to cross between them.",
      "Changes to your plans are proposed for you to accept, never made quietly.",
      "You can correct what she knows, report an answer that was wrong, take a copy, or delete it.",
      "We measure the AI and the data the app uses, and cut what it does not need.",
    ],
  },
  {
    title: "A share goes to conservation",
    lead: "Travel depends on places worth protecting, so part of what the app earns goes to protecting them.",
    points: [
      "1% of net revenue: what we keep after refunds and chargebacks.",
      "Starting with the first full calendar year we collect paid revenue.",
      "Published every year: how much, who received it, and how they were chosen.",
      "The giving never changes what Aly recommends.",
      "We will not tell you that using the app, or traveling more, is good for the environment. It is not, and a donation does not make it so.",
    ],
  },
];

export const PLEDGE_THIRD_PARTY =
  "These promises apply to the app itself. Any third party the app has to call to answer a question \u2014 a map provider, a weather service, a model we use to draft an answer \u2014 is chosen on the same terms, and only what is needed to answer the question is sent.";
