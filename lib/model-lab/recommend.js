// Turning a pile of results into "use this one for that". Pure, so the page
// can recompute the moment a price is edited, and the tests can check it.

import { priceFor, costOf } from "./prices";

// Within this much of the top quality, a model counts as "as good" and the
// cheaper or faster one wins.
export const CLOSE_ENOUGH = 0.05;

/**
 * results: [{ model, scenario, caseId, effort, ok, score, max, ms, inputTokens, ... }]
 * returns rows: [{ scenario, model, effort, runs, failures, quality, ms, cost, priced }]
 */
export function aggregate(results, { overrides = {}, today = new Date() } = {}) {
  const groups = new Map();
  for (const r of results) {
    if (r.unavailable) continue;
    const key = `${r.scenario}|${r.model}|${r.effort}`;
    if (!groups.has(key)) groups.set(key, { scenario: r.scenario, model: r.model, effort: r.effort, list: [] });
    groups.get(key).list.push(r);
  }
  const rows = [];
  for (const g of groups.values()) {
    const price = priceFor(g.model, { overrides, today });
    // A connection that dropped before the model answered is not a wrong answer,
    // so it is counted apart and left out of quality.
    const judged = g.list.filter((r) => !dropped(r));
    const shares = judged.map((r) => (r.ok && r.max ? r.score / r.max : 0));
    const answered = g.list.filter((r) => r.ok);
    const costs = answered.map((r) => costOf(r, price)).filter((c) => c != null);
    rows.push({
      scenario: g.scenario,
      model: g.model,
      effort: g.effort,
      runs: g.list.length,
      failures: judged.length - answered.length,
      dropped: g.list.length - judged.length,
      quality: shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null,
      ms: answered.length ? answered.reduce((a, r) => a + (r.ms || 0), 0) / answered.length : null,
      cost: price && costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
      priced: Boolean(price),
      notes: [...new Set(g.list.flatMap((r) => r.notes || (r.error ? [r.error] : [])))].slice(0, 6),
    });
  }
  return rows;
}

/**
 * For each request type: the best answer, the cheapest answer that is nearly as
 * good, and the fastest answer that is nearly as good. A model that failed a
 * request outright is never recommended for that type.
 */
export function recommend(rows) {
  const out = {};
  for (const scenario of [...new Set(rows.map((r) => r.scenario))]) {
    const mine = rows.filter((r) => r.scenario === scenario && r.failures === 0 && r.quality != null);
    if (!mine.length) {
      out[scenario] = null;
      continue;
    }
    const top = Math.max(...mine.map((r) => r.quality));
    const good = mine.filter((r) => r.quality >= top - CLOSE_ENOUGH);
    const best = [...mine].sort((a, b) => b.quality - a.quality || (a.cost ?? Infinity) - (b.cost ?? Infinity))[0];
    const priced = good.filter((r) => r.cost != null);
    const cheapest = priced.length ? [...priced].sort((a, b) => a.cost - b.cost || b.quality - a.quality)[0] : null;
    const fastest = [...good].sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity))[0];
    out[scenario] = { best, cheapest, fastest, top };
  }
  return out;
}

/** Dollars as cents or dollars, always to a readable precision. */
export function formatCost(dollars) {
  if (dollars == null) return "price not set";
  const cents = dollars * 100;
  if (cents < 0.01) return "<0.01¢";
  if (cents < 10) return `${cents.toFixed(2)}¢`;
  if (cents < 100) return `${cents.toFixed(1)}¢`;
  return `$${dollars.toFixed(2)}`;
}

/** True when the browser lost the request, which says nothing about the model. */
export function dropped(r) {
  if (r.ok) return false;
  return Boolean(r.network) || /load failed|failed to fetch|networkerror|network connection was lost/i.test(String(r.error || ""));
}
