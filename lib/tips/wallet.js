// Pro tips for the Wallet, which are two quite different questions.
//
// The first looks inward. The family has written down what they belong to, what
// the balances are, what each card earns and what it costs them every year. That
// record is enough to notice things nobody notices on their own: a travel credit
// that resets in December and has not been touched, points on a program that
// expires them after two years of no activity, an annual fee coming round on a
// card whose perks all duplicate another one, a status level that another chain
// will match if you ask before you book.
//
// The second looks outward, and it is the one Mark asked for. Given everything
// they already hold, is there a card they do NOT hold whose welcome bonus is
// worth opening for, timed against real spending that is already on the calendar.
// That question cannot be answered from the family's rows at all -- welcome
// offers change monthly and the good ones are often unadvertised or
// time-limited -- so it is answered from the web, and an offers tip that was not
// searched for is thrown away rather than shown. An invented sign-up bonus is not
// a slightly-wrong tip; it is a number somebody might make a financial decision
// on, and the whole point of the feature is that the number is real.
//
// Both are asked one at a time, in their own request, because a grounded look-up
// takes tens of seconds and two of them in one request is how a route runs out
// of time and files nothing.
//
// On the referrals thought: nothing here knows anything about referral links, and
// deliberately so. What it does do is name the card in `about` on every tip, which
// is the join a referral arrangement would need, and it is told to recommend on
// the merits and to say plainly when a card is not worth it. If a paid link is
// ever attached to these, that ordering has to stay in this direction -- the tip
// earns its place first -- or the feature stops being worth trusting, and an
// untrusted recommendation is worth nothing to refer with either.

import { generate as callModel } from "@/lib/agent/llm";
import { topicsOf } from "../preferences/topics";
import { tipsFrom } from "./parse";
import { acceptTips } from "./tip";
import { heldProgramForTip } from "./walletAuto";
import { aboutLines } from "@/lib/travelers/profile";
import {
  alreadyHeld,
  cardHistory,
  closedLines,
  declinedLines,
  heldCards,
  historyLines,
  offerFrom,
  openLines,
  priorDecision,
} from "@/lib/rewards-offers";

const clip = (value, max) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
};

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `$${Math.round(n)}` : null;
};

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("en-US") : null;
};

// What every wallet tip has to clear, whichever direction it is looking. Shared
// so the two system prompts cannot drift into disagreeing about the bar.
const WALLET_RULE = `Every tip must clear all of these. If it does not, do not write it:
1. It rests on a specific line of their Wallet or their calendar, and you can say which. "You have a card" is not a line; "the $300 travel credit on your Sapphire Reserve resets in December and nothing on the calendar before then is charged to it" is.
2. There is something they could do about it: a call to make, a credit to spend, a booking to move onto a different card, an offer to ask about, a card to apply for or to close.
3. It is not something true of everybody who has a credit card. No "pay your balance", no "points are worth more on travel", no "consider a travel card".
4. Every number in it is a number you found or a number that is in their record. Never estimate a bonus, a fee, a balance or a point value.
5. It is honest about the cost. If a card carries an annual fee, the fee is in the tip. If the bonus needs spending they would not otherwise do, say the spend and the window.`;

const SHAPE = `Reply with JSON and nothing else, in this exact shape:

{"tips":[{"title":"…","body":"…","because":"…","about":"…","program_id":"saved program ID","urgency":"now|soon|whenever","act_by":"YYYY-MM-DD or null"}]}

  title    under 90 characters, plain, no exclamation marks
  body     one to three sentences, under 500 characters, second person, American spelling
  because  the line of their Wallet or their calendar this rests on, under 200 characters
  about    the card or program this tip concerns, exactly as it is branded — "Chase Sapphire Preferred", "Alaska Mileage Plan". Required.
  program_id REQUIRED: copy the exact ID of the active saved card or program this tip is about. Never recommend opening a new card here. No offer object.
  urgency  "now" only if waiting genuinely costs them — an offer ending, a credit resetting, points expiring
  act_by   a real date when there is one, otherwise null. Only a date you found or that is in their record.

At most three tips. Two good ones beat three, and none is a perfectly good answer.`;

// The offers pass has to hand over the terms as fields as well as prose, and a
// tip that cannot fill them in is thrown away without being read. That is the
// mechanical version of rule 7: not "please say the bonus" but "there is nowhere
// for this tip to go unless the bonus, the spend, the window, the fee and the
// page you read them on are all here". It is also what lets the app recognize
// the same offer next month, and leave alone one they have already turned down.
const OFFERS_SHAPE = `Reply with JSON and nothing else, in this exact shape:

{"tips":[{"title":"…","body":"…","because":"…","about":"…","urgency":"now|soon|whenever","act_by":"YYYY-MM-DD or null","offer":{"issuer":"…","card_name":"…","bonus":"…","bonus_amount":60000,"bonus_unit":"…","min_spend":4000,"spend_window_days":90,"annual_fee":95,"ends_on":"YYYY-MM-DD or null","source_url":"https://…","source_title":"…"}}]}

  title    under 90 characters, plain, no exclamation marks
  body     one to three sentences, under 500 characters, second person, American spelling
  because  the line of their Wallet or their calendar this rests on, under 200 characters
  about    the card this tip concerns, exactly as it is branded — "Chase Sapphire Preferred". Required.
  urgency  "now" only if waiting genuinely costs them — an offer ending, a credit resetting
  act_by   a real date when there is one, otherwise null. Only a date you found.

  offer    REQUIRED on every tip here. Every field below has to come off a page you
           read in this call. There is no field for an estimate, and a tip whose
           offer block is incomplete is discarded unread.
    issuer            the bank, as it brands itself — "Chase", "American Express"
    card_name         the card, as the issuer names it
    bonus             the offer in words — "60,000 Ultimate Rewards points"
    bonus_amount      that same bonus as a plain number, 60000. Null only if it is not a number.
    bonus_unit        what the number counts — "Ultimate Rewards points", "dollars"
    min_spend         dollars of spending required, as a number
    spend_window_days days they have to spend it in, as a number
    annual_fee        dollars a year, as a number. 0 if there is no fee.
    ends_on           the date the offer ends if the page gives one, otherwise null
    source_url        the page you read the terms on
    source_title      what that page is

At most three tips. Two good ones beat three, and none is a perfectly good answer.`;

export const WALLET_SYSTEM = `You are the friend of one family who happens to understand loyalty programs and credit card benefits, looking over what they have written down in their travel app's Wallet.

You are looking at the programs and cards they ALREADY hold. Do not suggest new cards here; another pass does that.

${WALLET_RULE}

The things worth noticing in a wallet like this, when they are actually true of this one: a statement credit or annual travel credit that has not been used and resets on a date; points that expire after a period of no activity; an annual fee that is about to be charged on a card whose benefits overlap another card they hold; a status level that a competing chain or airline will match on request; a transfer partner that would turn the balance they have into the trip they have planned, especially when there is a transfer bonus running; a card in their wallet that earns notably more on a category they are about to spend heavily in; a balance large enough to cover something already on the calendar.

Search rather than recall. Expiration rules, credit reset dates, transfer ratios, transfer bonuses, status match policies and fee amounts all change, and several of them changed this year. Check the program's own page. If you cannot verify a rule, leave the tip out.

${SHAPE}`;

export const OFFERS_SYSTEM = `You are the friend of one family who happens to follow credit card welcome offers closely, looking at what is in their travel app's Wallet and what is on their calendar.

Your one job: is there a card they do NOT already hold whose current welcome bonus is worth opening for, given the trips they have coming and what they already carry.

${WALLET_RULE}

And these, which apply only here:
6. Never suggest a card they already hold, or a second card in a family they already hold. The list below is what they have.
7. Say the actual current offer: the bonus, what it is worth in the program's own currency, the spending required, the window to spend it in, and the annual fee. If you cannot find all of those on a page you have read, do not write the tip.
8. Tie it to spending that is already on their calendar or already booked. A bonus that needs $4,000 in three months is a good tip for a family with a cruise deposit due and a bad tip for a family with nothing booked.
9. Mention the rule that would stop them if there is one you can verify — an issuer limit on how many cards in a period, a once-per-lifetime bonus, a family-of-cards restriction. Do not guess at these.
10. If the honest answer is that nothing currently on offer is worth it for them, return no tips. That is a good answer and a common one.
11. Read the two lists below headed ALREADY TURNED DOWN and CARDS THEY USED TO HOLD before you write anything. An offer they have already waved off is not to be raised again unless it has genuinely improved — a bigger bonus, less spending, or a lower fee — and if it has, say in the body what changed since they passed. A card they closed is a card they may not earn a bonus on again; check the issuer's rule on that rather than assuming either way.
12. Where the record shows how many accounts somebody has opened recently, say where they actually stand against the rule rather than reciting the rule. If the record shows no opening dates, say so plainly instead of implying they are clear.

Search. A welcome offer you remember is a welcome offer that has changed. Read the issuer's own application page where you can, and say the date you saw the offer if the page gives one. Public offers are what you may write about; do not describe targeted or referral-only offers as though anyone can get them.

You are not a financial advisor and this is not advice about their credit. Do not comment on their credit score, their debt, or whether they can afford anything. Recommend on the merits of the offer against the spending they have already planned, and nothing else.

${OFFERS_SHAPE}`;

// The first card is a different question from the next one, and the rules above
// answer the next one. Somebody with an empty Wallet has no issuer to avoid, no
// balance to put to work and -- often -- nothing booked to spend against, so rule
// 8 as written would refuse them every card there is. This replaces that one rule
// and adds what the beginner's version of the question actually needs: an order to
// open things in rather than a shortlist, at least one card that costs nothing to
// keep, and the issuer rules stated as rules rather than as a position they are
// in, because with nothing recorded we cannot know where they stand. Everything
// else -- every figure read off a page this minute, no comment on their credit,
// nothing invented -- is unchanged, and the numbered rules say so.
export const STARTER_RULE = `
THIS FAMILY HOLDS NOTHING YET. Their Wallet is empty, so this is their first travel card rather than their next one, and three of the rules above change:

13. Rule 8 is relaxed, and only rule 8. With little or no spending on their calendar to point at, judge an offer by how reachable its minimum spend is for an ordinary household over a few months, and prefer a low or no minimum to a large one. Where they do have trips listed, use those. Never invent spending they have not told you about, and never assume a budget.
14. Give them an order, not a shortlist: say which one to open first and why that one, and at most three in total. Put the position in the title -- "open X first", "then Y" -- because the cards are shown sorted by urgency rather than in the order you wrote them, and a body that says "open this one first" beside a card shown second is worse than saying nothing. Include at least one card with no annual fee, because a first travel card that costs nothing to keep is where most beginners should start. If a card with a fee is worth it anyway, say what specifically pays the fee back.
15. State the issuer rules as rules, not as where they stand. With nothing recorded you do not know how many cards they have opened recently, so write "this issuer declines applications from anyone who has opened five cards in twenty-four months" rather than telling them they are clear of it.
16. Rules 1 to 7, 9, 10 and 11 are unchanged, and rule 12 does not apply because there is nothing recorded to stand anywhere against. The bonus, the spending required, the window and the annual fee still all have to come off a page you have read in this call, or you do not write the tip.`;

/** Nothing in the Wallet: the beginner's version of the question. */
export function starterFor({ programs = [] } = {}) {
  return !(programs || []).some((p) => p && p.is_active !== false);
}

/**
 * The record the model reads. Pure: rows in, text out.
 *
 * @param {object} input
 * @param {"wallet"|"offers"} input.scope
 * @param {Array} input.programs   rewards_programs rows
 * @param {Array} input.travelers  travelers, for whose card is whose
 * @param {Array} input.trips      trips still ahead
 * @param {Array} input.items      itinerary lines on those trips, for real spend
 * @param {Array} input.preferences travel_preferences rows
 * @param {Array} input.offers    card_offers rows, open and turned down alike
 * @param {string[]} input.already titles already offered here
 * @param {string} input.today
 */
export function walletBrief({
  scope = "wallet",
  programs = [],
  travelers = [],
  trips = [],
  items = [],
  preferences = [],
  offers = [],
  already = [],
  today,
}) {
  const byId = new Map(
    (travelers || []).filter((t) => t?.id).map((t) => [t.id, t.name]),
  );

  const held = (programs || []).filter((p) => p && p.is_active !== false);

  const programLines = held.length
    ? held.map((p) => {
        const bits = [];
        const name = [p.brand, p.program_name].filter(Boolean).join(" ");
        bits.push(name || "unnamed program");
        if (scope === "wallet") bits.push(`program_id: ${p.id}`);
        bits.push(
          p.kind === "credit_card" ? "credit card" : p.kind || "program",
        );
        const who = p.traveler_id ? byId.get(p.traveler_id) : null;
        if (who) bits.push(`held by ${who}`);
        else bits.push("household");
        if (p.status_tier) bits.push(`status: ${clip(p.status_tier, 60)}`);
        const balance = number(p.points_balance);
        if (balance)
          bits.push(
            `balance: ${balance} ${clip(p.currency_label || "points", 30)}${
              p.points_checked_on ? ` as of ${p.points_checked_on}` : ""
            }`,
          );
        const fee = money(p.annual_fee);
        if (fee) bits.push(`annual fee: ${fee}`);
        else if (p.kind === "credit_card" && Number(p.annual_fee) === 0)
          bits.push("annual fee: none");
        if (p.expiry_note) bits.push(`expiry: ${clip(p.expiry_note, 140)}`);
        if (p.perks) bits.push(`perks: ${clip(p.perks, 200)}`);
        // The earn rules and the credits are the two things a good tip usually
        // turns on, and both are free-form, so they go in as written.
        const earn = jsonLine(p.earn_rules);
        if (earn) bits.push(`earns: ${clip(earn, 240)}`);
        const credits = jsonLine(p.credits);
        if (credits) bits.push(`credits: ${clip(credits, 240)}`);
        if (p.notes) bits.push(`note: ${clip(p.notes, 160)}`);
        return `- ${bits.join(" · ")}`;
      })
    : ["- nothing saved yet"];

  // The issuers, said separately and plainly, because rule 6 is the one an
  // offers pass most easily breaks and it should not have to infer the list.
  const issuers = [
    ...new Set(
      held
        .filter((p) => p.kind === "credit_card")
        .map((p) => clip(p.brand, 40))
        .filter(Boolean),
    ),
  ];

  const tripLines = (trips || []).length
    ? (trips || []).map((t) => {
        const when = [t.start_date, t.end_date].filter(Boolean).join(" to ");
        return `- ${clip(t.name, 80)}${t.destination ? ` — ${clip(t.destination, 80)}` : ""}${
          when ? ` (${when})` : ""
        }${t.status && t.status !== "confirmed" ? ` [${t.status}]` : ""}`;
      })
    : ["- nothing on the calendar"];

  // What is actually going to be paid for, which is what makes a spending
  // requirement realistic or fantasy. Only the lines that name money or a
  // supplier are worth the space.
  const spendLines = (items || [])
    .filter((row) => row && (row.title || row.location))
    .slice(0, 40)
    .map(
      (row) =>
        `- ${clip(row.title, 70)}${row.category ? ` (${row.category})` : ""}${
          row.location ? ` — ${clip(row.location, 60)}` : ""
        }${row.status && row.status !== "confirmed" ? ` [${row.status}]` : ""}`,
    );

  // What they say they are like, because a card is chosen for the trips somebody
  // actually takes: lounges and checked bags for one household, and nothing that
  // needs a $550 fee to justify for another.
  const aboutBlock = aboutLines(travelers);

  const prefLines = (preferences || [])
    .filter((p) => p?.body)
    .slice(0, 20)
    .map(
      (p) =>
        `- ${clip(topicsOf(p).join(", "), 80) || "general"}: ${clip(p.body, 200)}`,
    );

  const parts = [
    `Today is ${today}.`,
    "",
    "WHAT THEY HOLD (their Wallet, as they have written it down):",
    ...programLines,
  ];

  if (scope === "offers") {
    parts.push(
      "",
      issuers.length
        ? `CARD ISSUERS ALREADY IN THE WALLET — do not suggest another card from a family they already hold: ${issuers.join(", ")}.`
        : "CARD ISSUERS ALREADY IN THE WALLET: none recorded, so any issuer is open.",
    );
    // Said in the brief as well as in the rules, because it is the one fact that
    // changes what a good answer looks like and the rules are long.
    if (starterFor({ programs })) {
      parts.push(
        "",
        "THIS IS THEIR FIRST TRAVEL CARD. Nothing is recorded in the Wallet, so there is no issuer to avoid, no balance to put to work and no status to protect. What they need is somewhere to start and a reason for it.",
      );
    }

    // Cards they closed. Held-only was a real hole: an issuer that pays a
    // welcome bonus once per card per lifetime does not care that the card was
    // shut in 2019, and until now the offers pass could not see it at all.
    const closed = closedLines(programs);
    if (closed.length) {
      parts.push(
        "",
        "CARDS THEY USED TO HOLD — closed, not never had, and some issuers count these:",
        ...closed,
      );
    }

    // Where they actually stand against the rules, rather than the rules.
    const history = cardHistory({ programs, travelers, today });
    const lines = historyLines(history);
    if (lines.length) {
      parts.push(
        "",
        "HOW RECENTLY THEY HAVE OPENED CARDS (from dates they entered themselves):",
        ...lines,
      );
      if (!history.anyOpenedDate) {
        parts.push(
          "None of their cards has an opening date recorded, so you cannot tell how recently they applied for anything. Say that plainly if it matters, rather than implying they are clear of an issuer's limit.",
        );
      }
    }

    const declined = declinedLines(offers);
    if (declined.length) {
      parts.push(
        "",
        "ALREADY TURNED DOWN — they saw these and passed. Do not raise one again unless the offer has genuinely improved on the terms recorded here, and if it has, say what changed:",
        ...declined,
      );
    }

    const open = openLines(offers);
    if (open.length) {
      parts.push(
        "",
        "OFFERS ALREADY ON THEIR LIST — these have been put to them and not yet decided. Do not repeat them:",
        ...open,
      );
    }
  }

  parts.push("", "TRIPS STILL AHEAD:", ...tripLines);

  if (spendLines.length) {
    parts.push(
      "",
      "WHAT IS BOOKED OR PLANNED ON THOSE TRIPS (this is the real spending):",
      ...spendLines,
    );
  }

  if (aboutBlock.length) {
    parts.push("", ...aboutBlock);
  }

  if (prefLines.length) {
    parts.push(
      "",
      "WHAT THEY HAVE TOLD THE APP THEY CARE ABOUT:",
      ...prefLines,
    );
  }

  if ((already || []).length) {
    parts.push(
      "",
      "ALREADY SAID HERE — do not repeat any of these, in any wording:",
      ...already.slice(0, 30).map((title) => `- ${clip(title, 120)}`),
    );
  }

  parts.push(
    "",
    scope === "offers"
      ? starterFor({ programs })
        ? "Now: what should a family with no travel card at all open first, and why that one? Go and check what the offers actually are today before you name any of them."
        : "Now: is there a card they do not hold whose current public welcome offer is worth opening for, against the spending above? Go and check what the offers are today."
      : "Now: is there anything about the programs and cards above that they would thank you for noticing? Go and check the rules you rely on.",
  );

  return parts.join("\n");
}

/** A jsonb column read as a sentence, whatever shape it was stored in. */
function jsonLine(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value))
    return value
      .map((entry) =>
        entry && typeof entry === "object"
          ? Object.entries(entry)
              .map(([k, v]) => `${k} ${v}`)
              .join(" ")
          : String(entry),
      )
      .filter(Boolean)
      .join("; ");
  if (typeof value === "object")
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("; ");
  return String(value);
}

// A grounded answer is the whole point of the offers pass, so there is no
// unsearched fallback for it. The wallet pass may fall back: "your Marriott
// points lapse after 24 months of no activity" is a rule the model may well know,
// and a tip filed with searched false says so on the card.
const UNSEARCHED_FLOOR_MS = 12000;

/**
 * Ask for wallet tips of one kind, and keep the few that clear the bar.
 *
 * @param {object} input
 * @param {object} input.place  {family_id, scope}
 * @param {string[]} input.avoid   advice already written down
 * @param {string[]} input.known   fingerprints already filed
 * @param {number} [input.deadline]
 * @returns {{tips: Array, dropped: Array, offers: Map<string, object>, model: string|null, searched: boolean}}
 */
export async function walletTips({
  place,
  avoid = [],
  known = [],
  subjects = [],
  deadline = undefined,
  ...brief
}) {
  const scope = place?.scope === "offers" ? "offers" : "wallet";
  const asked = { role: "user", text: walletBrief({ ...brief, scope }) };
  const left = () => (deadline ? deadline - Date.now() : Infinity);
  // An empty Wallet is not a reason to refuse the offers question -- it is the
  // family the question was invented for. It is a reason to ask it differently.
  const starter = starterFor({ programs: brief.programs });
  const askFor = (grounded, until) =>
    callModel({
      feature: "wallet.tips",
      system:
        scope === "offers"
          ? starter
            ? `${OFFERS_SYSTEM}\n${STARTER_RULE}`
            : OFFERS_SYSTEM
          : WALLET_SYSTEM,
      messages: [asked],
      temperature: 0.3,
      grounded,
      thinking: "low",
      ...(until && Number.isFinite(until) ? { deadline: until } : {}),
    });

  let result;
  try {
    result = await askFor(
      true,
      deadline ? Date.now() + Math.round(left() * 0.75) : null,
    );
  } catch (error) {
    // An offers pass that could not search has nothing honest to say, so the
    // timeout is passed up rather than answered from memory.
    if (scope === "offers") throw error;
    if (!error?.timedOut || left() < UNSEARCHED_FLOOR_MS) throw error;
    result = await askFor(false, deadline || null);
  }

  const searched = Boolean(result.searched);
  if (scope === "offers" && !searched) {
    // The model answered without going to look. Whatever bonus figures are in
    // that answer came out of its memory of last year's offers, and a wrong
    // number here is the one kind of wrong this feature cannot afford.
    return {
      tips: [],
      dropped: (tipsFrom(result.text) || []).map((tip) => ({
        title: typeof tip?.title === "string" ? tip.title : "(untitled)",
        reason:
          "the offer was not checked against a live page, and an unverified bonus is not worth showing",
      })),
      model: result.model || null,
      searched: false,
      offers: new Map(),
    };
  }

  // Three checks the prompt is not trusted with, because the prompt is a request
  // and these are the promises. A card they hold, an offer they already refused,
  // and an offer with no numbers behind it never reach the screen regardless of
  // how the model was feeling. Everything a judgment -- whether Sapphire Reserve
  // is barred to somebody holding Sapphire Preferred, whether a fee is worth it
  // -- stays with the pass that can read the issuer's own page.
  const candidates = tipsFrom(result.text);
  const refused = [];
  const offers = new Map();
  const kept =
    scope === "offers"
      ? candidates.filter((candidate) => {
          const name =
            typeof candidate?.offer?.card_name === "string"
              ? candidate.offer.card_name
              : candidate?.about;
          const title =
            typeof candidate?.title === "string"
              ? candidate.title
              : "(untitled)";
          const holds = alreadyHeld(name, heldCards(brief.programs));
          if (holds) {
            refused.push({
              title,
              reason: `they already hold ${[holds.brand, holds.program_name]
                .filter(Boolean)
                .join(" ")}`,
            });
            return false;
          }
          const offer = offerFrom(candidate);
          if (!offer) {
            refused.push({
              title,
              reason:
                "it did not come with the bonus, the spending, the window, the fee and the page they were read on",
            });
            return false;
          }
          const prior = priorDecision(offer, brief.offers);
          if (prior && !prior.better) {
            refused.push({
              title,
              reason: `they turned this card down already and the offer has not got better`,
            });
            return false;
          }
          offers.set(title, offer);
          return true;
        })
      : candidates.filter((candidate) => {
          const held = heldProgramForTip(candidate, brief.programs);
          if (!held) {
            refused.push({
              title: candidate?.title || "(untitled)",
              reason: "not tied to an active saved card or program",
            });
            return false;
          }
          // The saved name, not a model-invented product, labels owned advice.
          candidate.about = [held.brand, held.program_name].filter(Boolean).join(" ");
          return true;
        });

  const { tips, dropped } = acceptTips({
    candidates: kept,
    today: brief.today,
    place: { family_id: place.family_id, scope },
    avoid,
    known,
    subjects,
    sources: result.sources,
    model: result.model || null,
    searched,
  });

  return {
    tips,
    dropped: [...refused, ...dropped],
    // Keyed by title, which acceptTips passes through untouched, so the route can
    // file the terms beside the tip that carried them.
    offers,
    model: result.model || null,
    searched,
  };
}
