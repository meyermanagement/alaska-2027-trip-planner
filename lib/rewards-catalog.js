// A starting point for adding a rewards program, so nobody has to type out
// what their own credit card earns from memory.
//
// Every rate, fee, tier and statement credit below was read off the issuer's or
// program's own page in August 2026, and the cents-per-point figures come from
// The Points
// Guy's August 2026 monthly valuations. All of it is a default: the moment a row
// is saved it belongs to the family and they can correct it, which matters,
// because issuers change these constantly and a valuation is somebody's opinion
// rather than a price. The screen says so, and Aly is told to say so too.
//
// Sources are kept on each entry rather than in a comment, so the app can point
// at where a number came from.
//
// Cards that advertise cash back are recorded with the same shape as the rest: a
// 5% rate is written as 5, because that is what the family reads on the card's
// own page. Where those rewards are really Ultimate Rewards points, the point
// value says so and the perks line explains that the higher value only arrives
// if the points are moved to a card that can transfer them.
//
// The credits listed are the recurring ones a traveller would actually weigh at
// booking time — travel, hotel, airline, dining, car rental and trusted-traveller
// fee credits. Short-lived promotions and non-travel perks are deliberately left
// out: a card benefits page can carry a dozen of them and they would bury the
// two that change where a hotel gets charged.

export const CATALOG_AS_OF = "August 2026";

export const VALUATION_SOURCE = {
  label: "The Points Guy, August 2026 valuations",
  url: "https://thepointsguy.com/loyalty-programs/monthly-valuations/",
};

const CARDS = [
  {
    kind: "credit_card",
    brand: "Chase Sapphire Preferred",
    program_name: "Chase Ultimate Rewards",
    currency_label: "points",
    annual_fee: 95,
    point_value_cents: 2.05,
    earn_rules: [
      { rate: 5, on: "travel booked through Chase Travel" },
      { rate: 3, on: "dining" },
      { rate: 3, on: "online groceries", note: "not warehouse clubs" },
      { rate: 3, on: "select streaming" },
      { rate: 2, on: "all other travel" },
      { rate: 1, on: "everything else" },
    ],
    credits: [
      {
        amount: 100,
        on: "hotel stays booked through Chase Travel",
        resets: "annual",
      },
      {
        amount: 120,
        on: "Global Entry, TSA PreCheck or NEXUS application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source:
      "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
  },
  {
    kind: "credit_card",
    brand: "Chase Sapphire Reserve",
    program_name: "Chase Ultimate Rewards",
    currency_label: "points",
    annual_fee: 795,
    point_value_cents: 2.05,
    earn_rules: [
      { rate: 8, on: "travel booked through Chase Travel" },
      { rate: 4, on: "flights booked direct with the airline" },
      { rate: 4, on: "hotels booked direct" },
      { rate: 3, on: "dining worldwide" },
      { rate: 1, on: "everything else" },
    ],
    credits: [
      {
        amount: 300,
        on: "travel purchases",
        resets: "annual",
        note: "that spending earns no points",
      },
      {
        amount: 250,
        on: "prepaid hotels through The Edit by Chase Travel",
        resets: "semiannual",
        note: "two-night minimum",
      },
      {
        amount: 150,
        on: "restaurants in the Sapphire Exclusive Tables program",
        resets: "semiannual",
        note: "participating restaurants",
      },
      {
        amount: 120,
        on: "Global Entry, TSA PreCheck or NEXUS application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source:
      "https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve",
  },
  {
    kind: "credit_card",
    brand: "Chase Freedom Unlimited",
    program_name: "Chase Ultimate Rewards",
    currency_label: "points",
    annual_fee: 0,
    point_value_cents: 2.05,
    earn_rules: [
      { rate: 5, on: "travel booked through Chase Travel" },
      { rate: 3, on: "dining, including takeout" },
      { rate: 3, on: "drugstores" },
      { rate: 1.5, on: "everything else" },
    ],
    expiry_note: "Rewards do not expire while the account is open.",
    source:
      "https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited",
  },
  {
    kind: "credit_card",
    brand: "American Express Gold Card",
    program_name: "Amex Membership Rewards",
    currency_label: "points",
    annual_fee: 325,
    point_value_cents: 2,
    earn_rules: [
      { rate: 5, on: "prepaid hotels booked through Amex Travel" },
      { rate: 4, on: "restaurants worldwide", note: "first $50,000 a year" },
      { rate: 4, on: "U.S. supermarkets", note: "first $25,000 a year" },
      { rate: 3, on: "flights booked direct or through Amex Travel" },
      { rate: 1, on: "everything else" },
    ],
    credits: [
      {
        amount: 50,
        on: "Resy restaurants in the US",
        resets: "semiannual",
        note: "enrollment required",
      },
      {
        amount: 10,
        on: "Uber Cash for US rides and orders",
        resets: "monthly",
        note: "card added to Uber",
      },
      {
        amount: 100,
        on: "charges at The Hotel Collection hotels",
        resets: "annual",
        note: "two-night minimum via Amex Travel",
      },
    ],
    source: "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
  },
  {
    kind: "credit_card",
    brand: "American Express Platinum Card",
    program_name: "Amex Membership Rewards",
    currency_label: "points",
    annual_fee: 895,
    point_value_cents: 2,
    earn_rules: [
      {
        rate: 5,
        on: "flights booked direct or through Amex Travel",
        note: "first $500,000 a year",
      },
      { rate: 5, on: "prepaid hotels booked through Amex Travel" },
      { rate: 1, on: "everything else" },
    ],
    credits: [
      {
        amount: 300,
        on: "prepaid Fine Hotels + Resorts and The Hotel Collection stays",
        resets: "semiannual",
        note: "booked through Amex Travel",
      },
      {
        amount: 200,
        on: "incidental fees on one chosen airline",
        resets: "annual",
        note: "airline must be pre-selected",
      },
      {
        amount: 100,
        on: "Resy restaurants in the US",
        resets: "quarterly",
        note: "enrollment required",
      },
      {
        amount: 15,
        on: "Uber Cash for US rides and orders",
        resets: "monthly",
        note: "extra $20 in December",
      },
      {
        amount: 219,
        on: "CLEAR Plus membership",
        resets: "annual",
        note: "auto-renewing membership",
      },
      {
        amount: 120,
        on: "Global Entry application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source: "https://www.americanexpress.com/us/credit-cards/card/platinum/",
  },
  {
    kind: "credit_card",
    brand: "Capital One Venture X",
    program_name: "Capital One miles",
    currency_label: "miles",
    annual_fee: 395,
    point_value_cents: 1.85,
    earn_rules: [
      { rate: 10, on: "hotels and rental cars through Capital One Travel" },
      {
        rate: 5,
        on: "flights and vacation rentals through Capital One Travel",
      },
      { rate: 2, on: "everything else" },
    ],
    credits: [
      {
        amount: 300,
        on: "travel booked through Capital One Travel",
        resets: "annual",
        note: "applied at portal checkout",
      },
      {
        amount: 120,
        on: "Global Entry or TSA PreCheck application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
      {
        amount: 100,
        on: "charges during a Premier Collection hotel stay",
        resets: "annual",
        note: "per stay, booked through Capital One Travel",
      },
    ],
    source: "https://www.capitalone.com/credit-cards/venture-x/",
  },
  {
    kind: "credit_card",
    brand: "Capital One Venture Rewards",
    program_name: "Capital One miles",
    currency_label: "miles",
    annual_fee: 95,
    point_value_cents: 1.85,
    earn_rules: [
      {
        rate: 5,
        on: "hotels, vacation rentals and cars through Capital One Travel",
      },
      { rate: 2, on: "everything else" },
    ],
    credits: [
      {
        amount: 120,
        on: "Global Entry or TSA PreCheck application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
      {
        amount: 50,
        on: "charges during a Lifestyle Collection hotel stay",
        resets: "annual",
        note: "per stay, booked through Capital One Travel",
      },
    ],
    source: "https://www.capitalone.com/credit-cards/venture/",
  },
  {
    kind: "credit_card",
    brand: "Citi Strata Premier",
    program_name: "Citi ThankYou Points",
    currency_label: "points",
    annual_fee: 95,
    point_value_cents: 1.9,
    earn_rules: [
      { rate: 10, on: "hotels, cars and attractions on CitiTravel.com" },
      { rate: 3, on: "air travel and other hotels" },
      { rate: 3, on: "restaurants" },
      { rate: 3, on: "supermarkets" },
      { rate: 3, on: "gas and EV charging" },
      { rate: 1, on: "everything else" },
    ],
    credits: [
      {
        amount: 100,
        on: "one hotel stay of $500 or more",
        resets: "annual",
        note: "booked through Citi Travel",
      },
    ],
    source: "https://www.citi.com/credit-cards/citi-strata-premier-credit-card",
  },
  {
    kind: "credit_card",
    brand: "Delta SkyMiles Gold American Express",
    program_name: "Delta SkyMiles",
    currency_label: "miles",
    annual_fee: 150,
    point_value_cents: 1.2,
    earn_rules: [
      { rate: 2, on: "Delta purchases" },
      { rate: 2, on: "restaurants worldwide" },
      { rate: 2, on: "U.S. supermarkets" },
      { rate: 1, on: "everything else" },
    ],
    perks: "Annual fee waived the first year.",
    credits: [
      {
        amount: 100,
        on: "prepaid hotels and rentals through Delta Stays",
        resets: "annual",
      },
    ],
    source:
      "https://www.americanexpress.com/us/credit-cards/card/delta-skymiles-gold-american-express-card/",
  },
  {
    kind: "credit_card",
    brand: "Delta SkyMiles Reserve American Express",
    program_name: "Delta SkyMiles",
    currency_label: "miles",
    annual_fee: 650,
    point_value_cents: 1.2,
    earn_rules: [
      { rate: 3, on: "Delta purchases, including Delta Vacations" },
      { rate: 1, on: "everything else" },
    ],
    credits: [
      {
        amount: 200,
        on: "prepaid hotels and rentals through Delta Stays",
        resets: "annual",
      },
      {
        amount: 20,
        on: "Resy restaurants in the US",
        resets: "monthly",
        note: "enrollment required",
      },
      {
        amount: 10,
        on: "rideshare with select providers",
        resets: "monthly",
        note: "enrollment required",
      },
      {
        amount: 120,
        on: "Global Entry application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source:
      "https://www.americanexpress.com/us/credit-cards/card/delta-skymiles-reserve-american-express-card/",
  },
  {
    kind: "credit_card",
    brand: "United Explorer Card",
    program_name: "United MileagePlus",
    currency_label: "miles",
    annual_fee: 150,
    point_value_cents: 1.25,
    earn_rules: [
      { rate: 3, on: "United flights and other United purchases" },
      { rate: 2, on: "hotel stays booked with the hotel" },
      { rate: 2, on: "dining, including delivery" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "Annual fee waived the first year. United flights earn 9x in total once the MileagePlus member miles are counted.",
    credits: [
      {
        amount: 100,
        on: "prepaid hotel stays booked through United Hotels",
        resets: "annual",
        note: "$50 on each of the first two stays",
      },
      {
        amount: 100,
        on: "flights booked direct with JSX",
        resets: "annual",
      },
      {
        amount: 50,
        on: "Avis or Budget car rentals",
        resets: "annual",
        note: "booked through cars.united.com",
      },
      {
        amount: 120,
        on: "Global Entry, TSA PreCheck or NEXUS application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source:
      "https://creditcards.chase.com/travel-credit-cards/united/united-explorer",
  },
  {
    kind: "credit_card",
    brand: "United Gateway Card",
    program_name: "United MileagePlus",
    currency_label: "miles",
    annual_fee: 0,
    point_value_cents: 1.25,
    earn_rules: [
      { rate: 2, on: "United flights and other United purchases" },
      { rate: 2, on: "gas stations" },
      { rate: 2, on: "local transit and commuting" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "United flights earn 5x in total once the MileagePlus member miles are counted. 25% back on food, drink and Wi-Fi on board United flights.",
    source:
      "https://creditcards.chase.com/travel-credit-cards/united/united-gateway",
  },
  {
    kind: "credit_card",
    brand: "United Quest Card",
    program_name: "United MileagePlus",
    currency_label: "miles",
    annual_fee: 350,
    point_value_cents: 1.25,
    earn_rules: [
      { rate: 5, on: "hotels prepaid through Renowned Hotels and Resorts" },
      { rate: 4, on: "United flights and other United purchases" },
      {
        rate: 2,
        on: "all other travel, including airfare, hotels, car rentals and cruises",
      },
      { rate: 2, on: "dining, including delivery" },
      { rate: 2, on: "select streaming" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "United flights earn 10x in total once the MileagePlus member miles are counted. A 10,000-mile award flight discount each year, 1,000 bonus PQP a year and 1 PQP per $20 spent up to 18,000. 25% back on food, drink and Wi-Fi on board United flights.",
    credits: [
      {
        amount: 200,
        on: "United travel, as TravelBank cash",
        resets: "annual",
        note: "on each account anniversary",
      },
      {
        amount: 150,
        on: "hotel stays prepaid through Renowned Hotels and Resorts",
        resets: "annual",
      },
      {
        amount: 150,
        on: "flights booked direct with JSX",
        resets: "annual",
      },
      {
        amount: 80,
        on: "Avis or Budget car rentals",
        resets: "annual",
        note: "$40 on each of the first two rentals booked through cars.united.com",
      },
      {
        amount: 100,
        on: "rideshare with select providers",
        resets: "annual",
        note: "up to $8 a month, $12 in December; enrollment required",
      },
      {
        amount: 120,
        on: "Global Entry, TSA PreCheck or NEXUS application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source:
      "https://creditcards.chase.com/travel-credit-cards/united/united-quest",
  },
  {
    kind: "credit_card",
    brand: "United Club Card",
    program_name: "United MileagePlus",
    currency_label: "miles",
    annual_fee: 695,
    point_value_cents: 1.25,
    earn_rules: [
      { rate: 5, on: "United flights and other United purchases" },
      { rate: 5, on: "hotels prepaid through Renowned Hotels and Resorts" },
      {
        rate: 2,
        on: "all other travel, including airfare, hotels, car rentals and cruises",
      },
      { rate: 2, on: "dining, including delivery" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "United Club membership. United flights earn 11x in total once the MileagePlus member miles are counted. 1,500 bonus PQP a year and 1 PQP per $15 spent up to 28,000. 25% back on food, drink and Wi-Fi on board United flights. Chase used to call this the United Club Infinite Card.",
    credits: [
      {
        amount: 200,
        on: "hotel stays prepaid through Renowned Hotels and Resorts",
        resets: "annual",
      },
      {
        amount: 200,
        on: "flights booked direct with JSX",
        resets: "annual",
      },
      {
        amount: 150,
        on: "rideshare with select providers",
        resets: "annual",
        note: "up to $12 a month, $18 in December; enrollment required",
      },
      {
        amount: 100,
        on: "Avis or Budget car rentals",
        resets: "annual",
        note: "$50 on each of the first two rentals booked through cars.united.com",
      },
      {
        amount: 120,
        on: "Global Entry, TSA PreCheck or NEXUS application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source:
      "https://creditcards.chase.com/travel-credit-cards/united/club-infinite",
  },
  {
    kind: "credit_card",
    brand: "Southwest Rapid Rewards Priority",
    program_name: "Southwest Rapid Rewards",
    currency_label: "points",
    annual_fee: 229,
    point_value_cents: 1.25,
    earn_rules: [
      { rate: 4, on: "Southwest purchases" },
      { rate: 2, on: "Southwest hotel and car partners" },
      { rate: 2, on: "restaurants, including takeout" },
      { rate: 1, on: "everything else" },
    ],
    source:
      "https://creditcards.chase.com/travel-credit-cards/southwest/priority",
  },
  {
    kind: "credit_card",
    brand: "Southwest Rapid Rewards Plus",
    program_name: "Southwest Rapid Rewards",
    currency_label: "points",
    annual_fee: 99,
    point_value_cents: 1.25,
    earn_rules: [
      { rate: 2, on: "Southwest purchases" },
      { rate: 2, on: "gas stations", note: "first $5,000 a year combined" },
      { rate: 2, on: "groceries", note: "first $5,000 a year combined" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "3,000 points on each cardmember anniversary, a 10% flight discount code each year and 10,000 Companion Pass qualifying points a year. 25% back on inflight purchases.",
    source: "https://creditcards.chase.com/southwest/plus-credit-card",
  },
  {
    kind: "credit_card",
    brand: "Southwest Rapid Rewards Premier",
    program_name: "Southwest Rapid Rewards",
    currency_label: "points",
    annual_fee: 149,
    point_value_cents: 1.25,
    earn_rules: [
      { rate: 3, on: "Southwest purchases" },
      { rate: 2, on: "groceries", note: "first $8,000 a year combined" },
      { rate: 2, on: "restaurants", note: "first $8,000 a year combined" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "6,000 points on each cardmember anniversary, a 15% flight discount code each year and 10,000 Companion Pass qualifying points a year. 1,500 tier qualifying points for every $5,000 spent. 25% back on inflight purchases.",
    source: "https://creditcards.chase.com/southwest/premier-credit-card",
  },
  {
    kind: "credit_card",
    brand: "Aeroplan Card",
    program_name: "Air Canada Aeroplan",
    currency_label: "points",
    annual_fee: 95,
    point_value_cents: 1.45,
    earn_rules: [
      { rate: 3, on: "Air Canada flights and other Air Canada purchases" },
      { rate: 3, on: "dining, including takeout" },
      { rate: 3, on: "groceries" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "500 bonus points for every $2,000 spent in a calendar month, up to 1,500 points a month.",
    credits: [
      {
        amount: 120,
        on: "Global Entry, TSA PreCheck or NEXUS application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source:
      "https://creditcards.chase.com/travel-credit-cards/aircanada/aeroplan",
  },
  {
    kind: "credit_card",
    brand: "Citi / AAdvantage Executive World Legend Mastercard",
    program_name: "American AAdvantage",
    currency_label: "miles",
    annual_fee: 695,
    point_value_cents: 1.4,
    earn_rules: [
      {
        rate: 12,
        on: "hotels and car rentals booked through AAdvantage Hotels and AAdvantage Cars",
      },
      { rate: 4, on: "American Airlines purchases" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "Admirals Club membership. First checked bag free for the cardmember and up to 8 companions. One Omni free night award a year after a qualifying stay. American Airlines purchases earn 5x once $150,000 of spending is reached in a calendar year. Authorized users cost $175 for the first three. The fee rose from $595 to $695 for new cardmembers on August 23, 2026, and the card was renamed from World Elite to World Legend.",
    credits: [
      {
        amount: 250,
        on: "American Airlines Vacations travel packages and experiences",
        resets: "semiannual",
        note: "$250 in each half of the calendar year",
      },
      {
        amount: 120,
        on: "prepaid Avis and Budget car rentals booked direct",
        resets: "annual",
      },
      {
        amount: 100,
        on: "inflight and Admirals Club purchases",
        resets: "annual",
      },
      {
        amount: 15,
        on: "Lyft rides",
        resets: "monthly",
        note: "after 3 rides in the month, so up to $180 a year",
      },
      {
        amount: 120,
        on: "Global Entry or TSA PreCheck application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source:
      "https://creditcards.aa.com/credit-cards/citi-executive-card-american-airlines-direct/",
  },
  {
    kind: "credit_card",
    brand: "Citi / AAdvantage Globe Mastercard",
    program_name: "American AAdvantage",
    currency_label: "miles",
    annual_fee: 350,
    point_value_cents: 1.4,
    earn_rules: [
      { rate: 6, on: "hotels booked through AAdvantage Hotels" },
      { rate: 3, on: "American Airlines purchases" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "This is the card Barclays Aviator Silver accounts were moved to when Citi became American's only issuer.",
    credits: [
      {
        amount: 120,
        on: "Global Entry or TSA PreCheck application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source: "https://creditcards.aa.com/",
  },
  {
    kind: "credit_card",
    brand: "Citi / AAdvantage Platinum Select World Elite Mastercard",
    program_name: "American AAdvantage",
    currency_label: "miles",
    annual_fee: 99,
    point_value_cents: 1.4,
    earn_rules: [
      { rate: 2, on: "American Airlines purchases" },
      { rate: 2, on: "restaurants" },
      { rate: 2, on: "gas stations" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "Annual fee waived the first year. First checked bag free on domestic itineraries for the cardmember and up to 4 companions. 25% back on inflight food and drink. 10% off American Airlines Vacations. This is the card Barclays Aviator Red accounts were converted to in April 2026.",
    credits: [
      {
        amount: 125,
        on: "American Airlines flights",
        resets: "annual",
        note: "as a flight discount, after $20,000 of spending in the cardmembership year",
      },
    ],
    source:
      "https://www.citi.com/credit-cards/citi-aadvantage-platinum-select-world-elite-mastercard",
  },
  {
    kind: "credit_card",
    brand: "AAdvantage MileUp Card",
    program_name: "American AAdvantage",
    currency_label: "miles",
    annual_fee: 0,
    point_value_cents: 1.4,
    earn_rules: [
      { rate: 2, on: "American Airlines purchases" },
      { rate: 2, on: "groceries" },
      { rate: 1, on: "everything else" },
    ],
    perks: "25% back on inflight food and drink.",
    source: "https://creditcards.aa.com/",
  },
  {
    kind: "credit_card",
    brand: "Citi / AAdvantage Business World Elite Mastercard",
    program_name: "American AAdvantage",
    currency_label: "miles",
    annual_fee: 99,
    point_value_cents: 1.4,
    earn_rules: [
      { rate: 2, on: "American Airlines purchases" },
      { rate: 2, on: "car rentals" },
      { rate: 2, on: "gas stations" },
      { rate: 2, on: "telecom, cable and satellite providers" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "Annual fee waived the first year. The primary cardmember and each employee earn Loyalty Points on their own card spending.",
    source:
      "https://creditcards.aa.com/credit-cards/citi-business-card-american-airlines-direct/",
  },
  {
    kind: "credit_card",
    brand: "Marriott Bonvoy Boundless",
    program_name: "Marriott Bonvoy",
    currency_label: "points",
    annual_fee: 95,
    point_value_cents: 0.75,
    earn_rules: [
      { rate: 6, on: "hotels in the Marriott Bonvoy portfolio" },
      {
        rate: 3,
        on: "groceries, gas and dining",
        note: "first $6,000 a year",
      },
      { rate: 2, on: "everything else" },
    ],
    expiry_note:
      "Points hold as long as the card is used at least once every 24 months.",
    credits: [
      {
        amount: 50,
        on: "purchases direct with airlines",
        resets: "semiannual",
        note: "needs $250 of airline spending first; promotion runs to June 2027",
      },
    ],
    source:
      "https://creditcards.chase.com/travel-credit-cards/marriott-bonvoy/boundless",
  },
  {
    kind: "credit_card",
    brand: "Marriott Bonvoy Bountiful",
    program_name: "Marriott Bonvoy",
    currency_label: "points",
    annual_fee: 250,
    point_value_cents: 0.75,
    earn_rules: [
      {
        rate: 6,
        on: "hotels in the Marriott Bonvoy portfolio",
        note: "up to 18.5x in total with member and Gold Elite earning",
      },
      { rate: 4, on: "groceries", note: "first $15,000 a year combined" },
      { rate: 4, on: "dining", note: "first $15,000 a year combined" },
      { rate: 2, on: "everything else" },
    ],
    perks:
      "A free night each calendar year after $15,000 of spending, good at a hotel costing up to 50,000 points. 1,000 bonus points on each eligible stay. Gold Elite status. This is the Chase card; Bevy is the separate American Express one.",
    source:
      "https://creditcards.chase.com/travel-credit-cards/marriott-bonvoy/bountiful",
  },
  {
    kind: "credit_card",
    brand: "Hilton Honors American Express Surpass",
    program_name: "Hilton Honors",
    currency_label: "points",
    annual_fee: 150,
    point_value_cents: 0.4,
    earn_rules: [
      { rate: 12, on: "hotels and resorts in the Hilton portfolio" },
      { rate: 6, on: "U.S. restaurants" },
      { rate: 6, on: "U.S. supermarkets" },
      { rate: 6, on: "U.S. gas stations" },
      { rate: 4, on: "U.S. online retail" },
      { rate: 3, on: "everything else" },
    ],
    perks:
      "Free Night Reward after $15,000 of spending in a year; Diamond status after $40,000.",
    credits: [
      {
        amount: 50,
        on: "purchases direct with a Hilton property",
        resets: "quarterly",
      },
    ],
    source:
      "https://www.americanexpress.com/us/credit-cards/card/hilton-honors-surpass/",
  },
  {
    kind: "credit_card",
    brand: "World of Hyatt Credit Card",
    program_name: "World of Hyatt",
    currency_label: "points",
    annual_fee: 95,
    point_value_cents: 1.6,
    earn_rules: [
      { rate: 4, on: "Hyatt hotels", note: "9x in total with base earning" },
      { rate: 2, on: "restaurants" },
      { rate: 2, on: "airline tickets bought direct" },
      { rate: 2, on: "local transit and commuting" },
      { rate: 2, on: "gym memberships" },
      { rate: 1, on: "everything else" },
    ],
    source:
      "https://creditcards.chase.com/travel-credit-cards/world-of-hyatt-credit-card",
  },
  {
    kind: "credit_card",
    brand: "World of Hyatt Business Credit Card",
    program_name: "World of Hyatt",
    currency_label: "points",
    annual_fee: 199,
    point_value_cents: 1.6,
    earn_rules: [
      {
        rate: 4,
        on: "Hyatt hotels",
        note: "up to 9x in total with base earning",
      },
      {
        rate: 2,
        on: "your top three spending categories each quarter",
        note: "chosen from dining, shipping, airfare bought direct, transit, advertising, car rental, fuel and phone or internet",
      },
      { rate: 2, on: "gym memberships" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "Discoverist status for the cardmember and up to five employees. 5 tier-qualifying nights for every $10,000 spent in a calendar year.",
    credits: [
      {
        amount: 50,
        on: "purchases at any Hyatt property",
        resets: "semiannual",
        note: "needs $50 of Hyatt spending; twice each anniversary year",
      },
    ],
    source:
      "https://creditcards.chase.com/business-credit-cards/world-of-hyatt/hyatt-business-card",
  },
  {
    kind: "credit_card",
    brand: "IHG One Rewards Premier",
    program_name: "IHG One Rewards",
    currency_label: "points",
    annual_fee: 99,
    point_value_cents: 0.55,
    earn_rules: [
      {
        rate: 10,
        on: "IHG hotels",
        note: "up to 26x in total with member and Platinum Elite earning",
      },
      { rate: 5, on: "travel" },
      { rate: 5, on: "dining" },
      { rate: 5, on: "gas stations" },
      { rate: 3, on: "everything else" },
    ],
    perks:
      "A free night each anniversary year at a hotel costing up to 40,000 points, topped up with your own points if it costs more. Platinum Elite status.",
    credits: [
      {
        amount: 100,
        on: "any purchases",
        resets: "annual",
        note: "after $20,000 of spending in the calendar year, with 10,000 bonus points",
      },
      {
        amount: 50,
        on: "United flights, as TravelBank cash",
        resets: "annual",
        note: "register the card with a MileagePlus account first",
      },
      {
        amount: 120,
        on: "Global Entry, TSA PreCheck or NEXUS application fee",
        resets: "multiyear",
        note: "once every 4 years",
      },
    ],
    source:
      "https://creditcards.chase.com/travel-credit-cards/ihg-rewards-club/premier",
  },
  {
    kind: "credit_card",
    brand: "Disney Visa Card",
    program_name: "Disney Rewards Dollars",
    currency_label: "Rewards Dollars",
    annual_fee: 0,
    point_value_cents: 100,
    earn_rules: [{ rate: 0.01, on: "everything, as Disney Rewards Dollars" }],
    perks: "1 Disney Rewards Dollar is worth $1 at Disney.",
    expiry_note: "Rewards Dollars never expire.",
    source: "https://creditcards.chase.com/rewards-credit-cards/disney/rewards",
  },
  {
    kind: "credit_card",
    brand: "Wells Fargo Autograph",
    program_name: "Wells Fargo Rewards",
    currency_label: "points",
    annual_fee: 0,
    point_value_cents: 1.75,
    earn_rules: [
      {
        rate: 3,
        on: "restaurants, travel, gas, transit, streaming and phone plans",
      },
      { rate: 1, on: "everything else" },
    ],
    source: "https://creditcards.wellsfargo.com/autograph-visa-credit-card/",
  },
  {
    kind: "credit_card",
    brand: "Bank of America Travel Rewards",
    program_name: "Bank of America travel rewards",
    currency_label: "points",
    annual_fee: 0,
    earn_rules: [{ rate: 1.5, on: "everything" }],
    expiry_note: "Points do not expire while the account is open.",
    source:
      "https://www.bankofamerica.com/credit-cards/products/travel-rewards-credit-card/",
  },
  {
    kind: "credit_card",
    brand: "Chase Ink Business Preferred",
    program_name: "Chase Ultimate Rewards",
    currency_label: "points",
    annual_fee: 95,
    point_value_cents: 2.05,
    earn_rules: [
      { rate: 3, on: "travel", note: "first $150,000 a year combined" },
      { rate: 3, on: "shipping", note: "first $150,000 a year combined" },
      {
        rate: 3,
        on: "advertising with social media sites and search engines",
        note: "first $150,000 a year combined",
      },
      {
        rate: 3,
        on: "internet, cable and phone services",
        note: "first $150,000 a year combined",
      },
      { rate: 1, on: "everything else" },
    ],
    source:
      "https://creditcards.chase.com/business-credit-cards/ink/business-preferred",
  },
  {
    kind: "credit_card",
    brand: "Chase Ink Business Cash",
    program_name: "Chase Ultimate Rewards",
    currency_label: "points",
    annual_fee: 0,
    point_value_cents: 2.05,
    earn_rules: [
      {
        rate: 5,
        on: "office supply stores",
        note: "first $25,000 a year combined",
      },
      {
        rate: 5,
        on: "internet, cable and phone services",
        note: "first $25,000 a year combined",
      },
      { rate: 2, on: "gas stations", note: "first $25,000 a year combined" },
      { rate: 2, on: "restaurants", note: "first $25,000 a year combined" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "Chase advertises these rates as cash back. They post as Ultimate Rewards points worth a cent each, and only reach the higher value if they are moved to a Sapphire or Ink Business Preferred card.",
    source: "https://creditcards.chase.com/business-credit-cards/ink/cash",
  },
  {
    kind: "credit_card",
    brand: "Chase Ink Business Unlimited",
    program_name: "Chase Ultimate Rewards",
    currency_label: "points",
    annual_fee: 0,
    point_value_cents: 2.05,
    earn_rules: [{ rate: 1.5, on: "everything else" }],
    perks:
      "Chase advertises this as 1.5% cash back. It posts as Ultimate Rewards points worth a cent each, and only reaches the higher value if the points are moved to a Sapphire or Ink Business Preferred card.",
    source: "https://creditcards.chase.com/business-credit-cards/ink/unlimited",
  },
  {
    kind: "credit_card",
    brand: "Chase Ink Business Premier",
    program_name: "Chase cash back",
    currency_label: "cents",
    annual_fee: 195,
    point_value_cents: 1,
    earn_rules: [
      { rate: 5, on: "travel booked through Chase Travel" },
      { rate: 2.5, on: "any purchase of $5,000 or more" },
      { rate: 2, on: "everything else" },
    ],
    perks:
      "This one earns cash back rather than transferable points, so a cent is a cent however it is redeemed.",
    source: "https://creditcards.chase.com/business-credit-cards/ink/premier",
  },
  {
    kind: "credit_card",
    brand: "Chase Freedom Flex",
    program_name: "Chase Ultimate Rewards",
    currency_label: "points",
    annual_fee: 0,
    point_value_cents: 2.05,
    earn_rules: [
      { rate: 5, on: "travel booked through Chase Travel" },
      {
        rate: 5,
        on: "the rotating categories you activate each quarter",
        note: "first $1,500 a quarter",
      },
      { rate: 3, on: "dining, including takeout" },
      { rate: 3, on: "drugstores" },
      { rate: 1, on: "everything else" },
    ],
    perks:
      "The 5% categories change every quarter and have to be activated. Chase advertises these rates as cash back; they post as Ultimate Rewards points worth a cent each unless they are moved to a Sapphire card.",
    expiry_note: "Rewards do not expire while the account is open.",
    source: "https://creditcards.chase.com/cash-back-credit-cards/freedom/flex",
  },
];

const AIRLINES = [
  {
    kind: "airline",
    brand: "Alaska Atmos Rewards",
    currency_label: "points",
    point_value_cents: 1.55,
    perks: "Tiers: Silver, Gold, Platinum, Titanium.",
    expiry_note:
      "Points do not expire. This is the program that replaced Mileage Plan — one old mile became one Atmos point.",
    source: "https://www.alaskaair.com/atmosrewards/content/legal/terms",
  },
  {
    kind: "airline",
    brand: "Delta SkyMiles",
    currency_label: "miles",
    point_value_cents: 1.2,
    perks: "Tiers: Silver, Gold, Platinum and Diamond Medallion.",
    expiry_note: "Miles do not expire.",
    source: "https://www.delta.com/us/en/skymiles/overview",
  },
  {
    kind: "airline",
    brand: "United MileagePlus",
    currency_label: "miles",
    point_value_cents: 1.25,
    perks: "Tiers: Premier Silver, Gold, Platinum and 1K.",
    expiry_note: "Miles never expire.",
    source: "https://www.united.com/en/ca/fly/mileageplus/earn-miles.html",
  },
  {
    kind: "airline",
    brand: "American AAdvantage",
    currency_label: "miles",
    point_value_cents: 1.4,
    perks: "Tiers: Gold, Platinum, Platinum Pro, Executive Platinum.",
    expiry_note:
      "Miles expire after 24 months without qualifying activity; cardmembers are exempt.",
    source:
      "https://www.aa.com/web/i18n/aadvantage-program/answers-support/aadvantage-faq.html",
  },
  {
    kind: "airline",
    brand: "Southwest Rapid Rewards",
    currency_label: "points",
    point_value_cents: 1.25,
    perks: "Tiers: A-List and A-List Preferred.",
    expiry_note: "Points do not expire.",
    source: "https://www.southwest.com/rapidrewards/",
  },
  {
    kind: "airline",
    brand: "JetBlue TrueBlue",
    currency_label: "points",
    point_value_cents: 1.35,
    perks: "Tiers: Mosaic 1 through Mosaic 4, earned with tiles.",
    expiry_note: "Points never expire.",
    source: "https://www.jetblue.com/help/mosaic?product",
  },
];

const HOTELS = [
  {
    kind: "hotel",
    brand: "Marriott Bonvoy",
    currency_label: "points",
    point_value_cents: 0.75,
    perks: "Tiers: Silver, Gold, Platinum, Titanium and Ambassador Elite.",
    expiry_note: "Points expire after 24 months of no account activity.",
    source: "https://www.marriott.com/loyalty.mi",
  },
  {
    kind: "hotel",
    brand: "Hilton Honors",
    currency_label: "points",
    point_value_cents: 0.4,
    perks: "Tiers: Silver, Gold, Diamond and Diamond Reserve.",
    expiry_note: "Points expire after 24 months with no eligible activity.",
    source: "https://www.hilton.com/en/hilton-honors/",
  },
  {
    kind: "hotel",
    brand: "IHG One Rewards",
    currency_label: "points",
    point_value_cents: 0.55,
    perks: "Tiers: Silver, Gold, Platinum and Diamond Elite.",
    expiry_note:
      "Club members' points expire after 12 months without earning or redeeming; elites keep theirs.",
    source: "https://www.ihg.com/content/us/en/customer-care/member-tc",
  },
  {
    kind: "hotel",
    brand: "World of Hyatt",
    currency_label: "points",
    point_value_cents: 1.6,
    perks: "Tiers: Discoverist, Explorist, Globalist, Lifetime Globalist.",
    expiry_note: "Points are lost after 24 months without qualifying activity.",
    source: "https://world.hyatt.com/content/gp/en/program-overview.html",
  },
  {
    kind: "hotel",
    brand: "Wyndham Rewards",
    currency_label: "points",
    point_value_cents: 0.7,
    perks: "Tiers: Blue, Gold, Platinum and Diamond.",
    expiry_note:
      "Points expire four years after they post, and sooner after about 18 months of no activity.",
    source: "https://www.wyndhamhotels.com/wyndham-rewards",
  },
  {
    kind: "hotel",
    brand: "Choice Privileges",
    currency_label: "points",
    point_value_cents: 0.7,
    perks: "Tiers: Gold, Platinum, Diamond and Titanium.",
    expiry_note:
      "Points are forfeited after 18 months of no activity; elites are exempt.",
    source: "https://www.choicehotels.com/choice-privileges",
  },
  {
    kind: "hotel",
    brand: "Best Western Rewards",
    currency_label: "points",
    point_value_cents: 0.6,
    perks: "Tiers: Blue, Gold, Platinum, Diamond and Diamond Select.",
    expiry_note: "Points never expire.",
    source: "https://www.bestwestern.com/en_US/best-western-rewards.html",
  },
];

const CARS = [
  {
    kind: "car",
    brand: "Hertz Gold Plus Rewards",
    currency_label: "points",
    perks: "Tiers: Gold, Five Star, President's Circle.",
    expiry_note:
      "Points last five years, and are forfeited after 12 months with no rental.",
    source: "https://www.hertz.com/us/en/gold-plus-rewards/gpr-faq",
  },
  {
    kind: "car",
    brand: "Avis Preferred",
    currency_label: "points",
    perks: "Tiers: Preferred, Preferred Plus, President's Club.",
    expiry_note:
      "Points last 60 months, and are forfeited after 12 months of no activity.",
    source:
      "https://www.avis.com/en/legal-documents/avis-preferred/preferred-points-us-canada",
  },
  {
    kind: "car",
    brand: "National Emerald Club",
    currency_label: "rental credits",
    perks: "Tiers: Emerald Club, Executive, Executive Elite.",
    expiry_note:
      "Rental credits do not expire; a free day is good through the end of the following year.",
    source:
      "https://www.nationalcar.com/en/support/car-rental-faqs/earn-rental-credits-towards-free-car-rental.html",
  },
  {
    kind: "car",
    brand: "Enterprise Plus",
    currency_label: "points",
    perks: "Tiers: Plus, Silver, Gold, Platinum.",
    expiry_note: "Points expire 36 months after the last qualifying rental.",
    source: "https://www.enterprise.com/en/loyalty.html",
  },
  {
    kind: "car",
    brand: "Budget Fastbreak",
    currency_label: "Budget Bucks",
    perks: "No points: rewards come as Budget Bucks coupons.",
    source: "https://www.budget.com/en/loyalty-profile/fastbreak",
  },
  {
    kind: "car",
    brand: "SIXT ONE",
    currency_label: "rental points",
    perks: "Tiers: Silver, Gold, Platinum, Diamond.",
    expiry_note:
      "Rental points last 24 months from the end of the quarter they were earned in.",
    source: "https://www.sixt.com/sixt-one/",
  },
];

const CRUISES = [
  {
    kind: "cruise",
    brand: "Holland America Mariner Society",
    currency_label: "cruise day credits",
    perks:
      "Tiers: Star through Five-Star Mariner, earned by cruise days rather than spending.",
    source:
      "https://www.hollandamerica.com/en/us/faq/loyalty-program/loyalty-program-general-information/what-is-the-mariner-society-rewards-program",
  },
  {
    kind: "cruise",
    brand: "Disney Cruise Line Castaway Club",
    currency_label: "cruises",
    perks:
      "Levels by completed cruises: Silver at 1, Gold at 5, Platinum at 10, Pearl at 25. No points to spend.",
    source:
      "https://disneycruise.disney.go.com/en-eu/faq/castaway-club/eligibility/",
  },
  {
    kind: "cruise",
    brand: "Royal Caribbean Crown & Anchor Society",
    currency_label: "cruise points",
    perks:
      "Tiers: Gold, Platinum, Emerald, Diamond, Diamond Plus, Pinnacle Club.",
    expiry_note: "Cruise points never expire.",
    source: "https://www.royalcaribbean.com/crown-anchor-society",
  },
  {
    kind: "cruise",
    brand: "Carnival VIFP Club",
    currency_label: "VIFP points",
    perks: "Tiers: Blue, Red, Gold, Platinum, Diamond. One point a cruise day.",
    source: "https://www.carnival.com/vifp",
  },
  {
    kind: "cruise",
    brand: "Norwegian Latitudes Rewards",
    currency_label: "latitudes points",
    perks:
      "Tiers: Bronze through Ambassador. One point a night, two in a suite or The Haven.",
    source: "https://www.ncl.com/latitudes-rewards",
  },
];

const OTHERS = [
  {
    kind: "dining",
    brand: "Disney Rewards Dollars",
    currency_label: "Rewards Dollars",
    point_value_cents: 100,
    perks: "One Rewards Dollar is a dollar at Disney.",
    expiry_note: "They never expire.",
    source: "https://disneyrewards.com/rewards-dollars/",
  },
];

export const CATALOG = [
  ...CARDS,
  ...AIRLINES,
  ...HOTELS,
  ...CRUISES,
  ...CARS,
  ...OTHERS,
];

const BY_BRAND = new Map(CATALOG.map((entry) => [entry.brand, entry]));

export function catalogEntry(brand) {
  return BY_BRAND.get(brand) || null;
}

const GROUP_LABELS = {
  credit_card: "Credit cards",
  airline: "Airlines",
  hotel: "Hotels",
  cruise: "Cruise lines",
  car: "Car rental",
  dining: "Dining and shopping",
};

/** The catalog arranged for a grouped picker, in the order above. */
export function catalogByKind() {
  const order = ["credit_card", "airline", "hotel", "cruise", "car", "dining"];
  return order
    .map((kind) => ({
      kind,
      label: GROUP_LABELS[kind] || kind,
      items: CATALOG.filter((entry) => entry.kind === kind),
    }))
    .filter((group) => group.items.length);
}
