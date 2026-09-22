/**
 * What each feature key is called out loud, and which part of the app it is.
 *
 * The keys written into model_usage are dotted machine names -- chat.rescue,
 * someday.expect, document.policy -- chosen so they can be grouped by and so a
 * new call site cannot accidentally invent a second spelling of an existing one.
 * They are not names anybody would use to describe what the app was doing, and
 * twenty-nine of them in a list is not a breakdown of anything.
 *
 * So a key has two names here. The area is the part of the app a person would
 * point at: Ask Aly, Pro tips, Wallet. The step is what that particular call did
 * inside it, which is what makes an area's bill explicable -- Ask Aly is not one
 * call per question but up to seven, and until you can see that the answer to
 * "why is chat expensive" is a shrug.
 *
 * The first segment of the key is the area, so a call site added later shows up
 * under the right heading before anybody writes it down here. Its step falls back
 * to the second segment, which reads acceptably because the keys were named by
 * verb. Nothing here is required for the screen to be honest: an unlisted key is
 * still counted, still totalled, and still shown.
 */

// The areas, in no particular order -- the screen sorts them by what they cost.
const AREAS = {
  chat: "Ask Aly",
  tips: "Pro tips",
  wallet: "Wallet",
  someday: "Bucket list",
  interview: "First-run interview",
  cover: "Trip covers",
  document: "Travel documents",
  inbox: "Forwarded mail",
  deals: "Fares and offers",
  day: "The day's brief",
  budget: "Budget",
  packing: "Packing",
  preferences: "Preferences",
  traveler: "About a traveler",
  trip: "Trip review",
  nav: "Search",
  welcome: "Front door",
  unnamed: "Unnamed",
};

// What the call did, per key. Written as the errand rather than the mechanism,
// because "second attempt after a malformed reply" is the fact worth seeing and
// "retry" is not.
const STEPS = {
  "chat.answer": "Answering the question",
  "chat.cards": "Drawing the cards under the answer",
  // The one finishing turn that replaced chat.reasons, chat.words and
  // chat.cards. Their labels stay for the rows already in the ledger, and so
  // does this one: since 22 September the key names its reason instead
  // (chat.finish.words, chat.finish.cards), which finishStep reads below.
  "chat.finish": "Finishing the answer — its words, its cards, or both",
  "chat.reasons": "Saying why it suggested that",
  "chat.recall": "Finding the earlier conversation it needs",
  "chat.rescue": "Salvaging a reply that came back unusable",
  "chat.retry": "Asking again after a malformed reply",
  "chat.words": "Naming the conversation",
  "tips.facts": "Looking up the facts behind a tip",
  "tips.write": "Writing the tip",
  "wallet.lookup": "Looking up what a program gives",
  "wallet.tips": "Turning that into advice",
  "someday.season": "Working out the best months",
  "someday.expect": "Working out what to expect there",
  "interview.followup": "Asking the next question",
  "interview.compare": "Showing what the answer changed",
  "interview.proof": "Proving the answer was understood",
  "cover.draw": "Drawing a trip's cover",
  "document.identity": "Reading a passport or an ID",
  "document.policy": "Reading an insurance policy",
  "inbox.read": "Reading a forwarded confirmation",
  "deals.forwarded": "Judging a forwarded fare",
  "day.insight": "Writing the day's brief",
  "budget.estimate": "Estimating what a trip costs",
  "packing.suggest": "Suggesting what to pack",
  "preferences.suggest": "Suggesting a preference",
  "traveler.priors": "Reading what somebody wrote about themselves",
  "trip.review": "Reviewing a whole trip",
  "nav.search": "Answering a search box",
  "welcome.ability": "Demonstrating an ability on the front door",
};

// What each finishing debt was, for keys like chat.finish.words+cards. The
// finishing turn records why it ran in its own key; these are those reasons
// said the way the step labels are.
const FINISH_REASONS = {
  silent: "the first reply was empty",
  reasons: "a change came back with no words",
  words: "the cards had no advice above them",
  cards: "places were named with no cards",
};

function finishStep(said) {
  const debts = said.slice("chat.finish.".length).split("+");
  const named = debts.map((d) => FINISH_REASONS[d]).filter(Boolean);
  if (!named.length || named.length !== debts.length) return null;
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `Finishing the answer, because ${list}`;
}

/** Sentence case from a bare segment: "estimate" to "Estimate". */
function sentence(word) {
  const said = String(word || "").replace(/[-_.]+/g, " ");
  return said ? said.charAt(0).toUpperCase() + said.slice(1) : "";
}

/**
 * The area and the step for one feature key.
 *
 * @param {string} key a feature value as stored in model_usage
 * @returns {{ areaId: string, areaLabel: string, stepLabel: string }}
 */
export function describeFeature(key) {
  const said = String(key || "unnamed");
  const [head, ...rest] = said.split(".");
  const areaId = head || "unnamed";
  return {
    areaId,
    areaLabel: AREAS[areaId] || sentence(areaId),
    stepLabel:
      STEPS[said] ||
      (said.startsWith("chat.finish.") ? finishStep(said) : null) ||
      sentence(rest.join(" ")) ||
      "The whole call",
  };
}

/**
 * Feature rows folded into one row per area, each keeping its steps.
 *
 * Sorted by tokens rather than by calls, because a hundred one-line calls and
 * one call carrying a 22,000-token tool schema are not the same spending and the
 * count alone puts them the wrong way round.
 *
 * @param {Array<object>} rows what model_usage_by_feature returned
 */
export function foldIntoAreas(rows) {
  const areas = new Map();
  const add = (into, row) => {
    into.calls += Number(row.calls || 0);
    into.failed += Number(row.failed || 0);
    into.grounded += Number(row.grounded || 0);
    into.searches += Number(row.searches || 0);
    into.promptTokens += Number(row.prompt_tokens || 0);
    into.replyTokens += Number(row.candidates_tokens || 0);
    into.thinkingTokens += Number(row.thoughts_tokens || 0);
    into.cachedTokens += Number(row.cached_tokens || 0);
    into.toolTokens += Number(row.tool_tokens || 0);
    into.totalTokens += Number(row.total_tokens || 0);
  };
  const blank = (extra) => ({
    calls: 0,
    failed: 0,
    grounded: 0,
    searches: 0,
    promptTokens: 0,
    replyTokens: 0,
    thinkingTokens: 0,
    cachedTokens: 0,
    toolTokens: 0,
    totalTokens: 0,
    ...extra,
  });

  for (const row of rows || []) {
    const { areaId, areaLabel, stepLabel } = describeFeature(row.feature);
    if (!areas.has(areaId)) {
      areas.set(areaId, blank({ id: areaId, label: areaLabel, steps: [] }));
    }
    const area = areas.get(areaId);
    add(area, row);
    const step = blank({
      key: row.feature,
      label: stepLabel,
      msMedian: row.ms_median === null ? null : Number(row.ms_median),
      models: row.models || [],
    });
    add(step, row);
    area.steps.push(step);
  }

  const list = [...areas.values()];
  for (const area of list)
    area.steps.sort((a, b) => b.totalTokens - a.totalTokens);
  list.sort((a, b) => b.totalTokens - a.totalTokens || b.calls - a.calls);
  return list;
}

/** Every counted token in a set of rows, for the shares to be taken against. */
export function totalOf(areas) {
  return (areas || []).reduce(
    (sum, area) => ({
      calls: sum.calls + area.calls,
      failed: sum.failed + area.failed,
      searches: sum.searches + area.searches,
      totalTokens: sum.totalTokens + area.totalTokens,
      thinkingTokens: sum.thinkingTokens + area.thinkingTokens,
      promptTokens: sum.promptTokens + area.promptTokens,
    }),
    {
      calls: 0,
      failed: 0,
      searches: 0,
      totalTokens: 0,
      thinkingTokens: 0,
      promptTokens: 0,
    },
  );
}
