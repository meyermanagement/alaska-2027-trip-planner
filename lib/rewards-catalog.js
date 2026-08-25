// A starting point for adding a rewards programme, so nobody has to type out
// what their own credit card earns from memory.
//
// Every rate, fee and tier below was read off the issuer's or programme's own
// page in August 2026, and the cents-per-point figures come from The Points
// Guy's August 2026 monthly valuations. All of it is a default: the moment a row
// is saved it belongs to the family and they can correct it, which matters,
// because issuers change these constantly and a valuation is somebody's opinion
// rather than a price. The screen says so, and Aly is told to say so too.
//
// Sources are kept on each entry rather than in a comment, so the app can point
// at where a number came from.

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
    perks: "$300 annual travel credit; spending covered by it earns no points.",
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
      { rate: 3, on: "dining, including takeaway" },
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
    source:
      "https://creditcards.chase.com/travel-credit-cards/united/united-explorer",
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
      { rate: 2, on: "restaurants, including takeaway" },
      { rate: 1, on: "everything else" },
    ],
    source:
      "https://creditcards.chase.com/travel-credit-cards/southwest/priority",
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
    source:
      "https://creditcards.chase.com/travel-credit-cards/marriott-bonvoy/boundless",
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
];

const AIRLINES = [
  {
    kind: "airline",
    brand: "Alaska Atmos Rewards",
    currency_label: "points",
    point_value_cents: 1.55,
    perks: "Tiers: Silver, Gold, Platinum, Titanium.",
    expiry_note:
      "Points do not expire. This is the programme that replaced Mileage Plan — one old mile became one Atmos point.",
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

/** The catalogue arranged for a grouped picker, in the order above. */
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
