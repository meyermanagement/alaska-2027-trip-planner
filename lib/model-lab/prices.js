// What each model charges, per million tokens, so the model lab can put a cost
// on every request it makes.
//
// These are estimates. Vendors change prices, run promotions, and count tokens
// their own way; a model that is not in this table still runs and shows its
// token counts with "price not set" rather than a made-up figure. The lab page
// lets an admin type a price for any model, and that override lives in the
// browser, so a new model is priced the day it appears without a deploy.
//
// cached: price for input tokens read from the vendor's prompt cache.
// search: price per web search, where the vendor charges for it separately.
// until:  the last day a promotional price applies, then `after` takes over.

const GOOGLE = "https://ai.google.dev/gemini-api/docs/pricing";
const OPENAI = "https://openai.com/api/pricing/";
const OPENAI_GPT6 = "https://openai.com/index/introducing-gpt-6-sol-and-luna/";

// Google Search grounding: 5,000 free a month, then $14 per 1,000. The lab
// charges the paid rate, because a test run should not look free just because
// the month's allowance has not run out yet.
const GOOGLE_SEARCH = 0.014;

// OpenAI's web search tool: $10 per 1,000 calls, with the pages it reads
// billed as ordinary input tokens (already in the reported token counts).
const OPENAI_SEARCH = 0.01;
// Source: https://developers.openai.com/api/docs/pricing (checked 2026-09-24).

export const PRICES = {
  "gemini-3.7-flash": {
    input: 0.75, cached: 0.075, output: 3.75, search: GOOGLE_SEARCH,
    until: "2026-12-31", after: { input: 1.5, cached: 0.15, output: 7.5 },
    source: GOOGLE, checked: "2026-09-24",
  },
  "gemini-3.8-flash": {
    input: 0.75, cached: 0.075, output: 3.75, search: GOOGLE_SEARCH,
    until: "2026-12-31", after: { input: 1.5, cached: 0.15, output: 7.5 },
    source: GOOGLE, checked: "2026-09-24",
  },
  "gemini-3.6-flash": {
    input: 1.5, cached: 0.15, output: 7.5, search: GOOGLE_SEARCH,
    source: GOOGLE, checked: "2026-09-24",
  },
  "gemini-3.5-flash-lite": {
    input: 0.3, cached: 0.03, output: 2.5, search: GOOGLE_SEARCH,
    source: GOOGLE, checked: "2026-09-24",
  },
  "gemini-3.1-pro-preview": {
    input: 2, cached: 0.2, output: 12, search: GOOGLE_SEARCH,
    source: GOOGLE, checked: "2026-09-24",
  },
  "gpt-5.6-luna": {
    input: 0.2, cached: 0.02, output: 1.2, search: OPENAI_SEARCH,
    source: OPENAI_GPT6, checked: "2026-09-24",
  },
  "gpt-5.6-sol": {
    input: 4, cached: 0.4, output: 20, search: OPENAI_SEARCH,
    source: OPENAI_GPT6, checked: "2026-09-24",
  },
  "gpt-5.6-terra": {
    input: 2, cached: 0.2, output: 12, search: OPENAI_SEARCH,
    source: OPENAI, checked: "2026-09-24",
  },
  "gpt-5.5": {
    input: 5, cached: 0.5, output: 30, search: OPENAI_SEARCH,
    source: OPENAI, checked: "2026-09-24",
  },
  "gpt-6-luna": {
    input: 0.1, cached: 0.01, output: 0.5, search: OPENAI_SEARCH,
    source: OPENAI, checked: "2026-09-24",
  },
  "gpt-6-sol": {
    input: 2, cached: 0.2, output: 10, search: OPENAI_SEARCH,
    source: OPENAI, checked: "2026-09-24",
  },
  "gpt-6-astra": {
    input: 10, cached: 1, output: 50, search: OPENAI_SEARCH,
    source: OPENAI, checked: "2026-09-24",
  },
};

/**
 * The price that applies to a model on a given day, with any browser override
 * laid over the table. Null when nobody has said what the model costs.
 */
export function priceFor(model, { overrides = {}, today = new Date() } = {}) {
  const own = overrides?.[model];
  if (own && Number.isFinite(Number(own.input)) && Number.isFinite(Number(own.output))) {
    return {
      input: Number(own.input),
      output: Number(own.output),
      cached: Number.isFinite(Number(own.cached)) && own.cached !== "" ? Number(own.cached) : Number(own.input),
      search: Number.isFinite(Number(own.search)) && own.search !== "" ? Number(own.search) : 0,
      source: "entered on this page",
      overridden: true,
    };
  }
  const row = PRICES[model];
  if (!row) return null;
  const day = today.toISOString().slice(0, 10);
  const base = row.until && day > row.until && row.after ? { ...row, ...row.after } : row;
  return {
    input: base.input,
    output: base.output,
    cached: base.cached ?? base.input,
    search: base.search ?? 0,
    source: row.source,
    checked: row.checked,
    until: day <= (row.until || "") ? row.until : null,
    overridden: false,
  };
}

/**
 * What one request cost, in dollars. Output includes reasoning tokens, because
 * both vendors bill them as output. Null when the model has no price.
 */
export function costOf(usage, price) {
  if (!price || !usage) return null;
  const input = Number(usage.inputTokens) || 0;
  const cached = Math.min(Number(usage.cachedTokens) || 0, input);
  const output = Number(usage.outputTokens) || 0;
  const searches = Number(usage.searches) || 0;
  return (
    ((input - cached) * price.input + cached * price.cached + output * price.output) / 1e6 +
    searches * (price.search || 0)
  );
}
