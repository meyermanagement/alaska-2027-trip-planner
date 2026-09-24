// What the month went on, written down one call at a time.
//
// The app could always say why an answer had not been searched, and where people
// had been, and what a model had refused -- and nothing at all about what any of
// it cost. So the honest answer to "which feature is the bill" was a reading of
// the code: count the rows in the tables a feature writes to, measure the system
// prompt, multiply by how many times a turn asks. That is an argument, and an
// argument cannot be checked against an invoice.
//
// One row per call, holding the counts Google itself reported, the model that
// was asked, whether search was attached, and the name of the part of the app
// that asked. No prompt text, no reply, nothing about a trip or a family. The
// rows are about spending, not about people, and keeping them narrow is what
// lets them be kept.
//
// Nothing in the app reads these rows yet. They exist to be asked about, the same
// way refusals do -- with the difference that a question about spending has a
// right answer and this is the only place it can be got.

const MAX_ROWS = 12;
const MAX_NAME = 80;
const UNNAMED = "unnamed";

/**
 * A feature name the table can be grouped by.
 *
 * Lower case, dotted, and nothing else, because a column that is grouped by is
 * a column where "Chat" and "chat " and "chat.answer " are three features. A
 * caller that names nothing gets "unnamed" rather than null: a null would quietly
 * drop out of a group-by and make the total stop matching the bill, which is the
 * one thing this table exists to prevent.
 */
export function featureKey(name) {
  const said = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
  return said ? said.slice(0, MAX_NAME) : UNNAMED;
}

function whole(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

/**
 * Writes one row per model call. Never throws and never blocks the answer.
 *
 * Failure here is silent on purpose. A reply that arrived and then died because
 * the bookkeeping would not insert is a worse outcome than a month of spending
 * nobody can break down.
 */
export async function recordUsage(
  supabase,
  { userId, feature, provider = "gemini", calls = [] } = {},
) {
  if (!supabase || !userId) return 0;
  const list = Array.isArray(calls) ? calls.slice(0, MAX_ROWS) : [];
  if (!list.length) return 0;

  const key = featureKey(feature);
  const rows = list
    .filter((c) => c && c.model)
    .map((c) => ({
      user_id: userId,
      feature: key,
      // Per call where the adapter said, because one failed turn can have paid
      // OpenAI and then Google.
      provider: String(c.provider || provider || "gemini").slice(0, MAX_NAME),
      model: String(c.model).slice(0, MAX_NAME),
      grounded: c.grounded === true,
      searches: whole(c.searches) ?? 0,
      attempt: whole(c.attempt) ?? 0,
      status: whole(c.status),
      finish_reason: c.finishReason
        ? String(c.finishReason).slice(0, 60)
        : null,
      ok: c.ok !== false,
      prompt_tokens: whole(c.promptTokens),
      candidates_tokens: whole(c.candidatesTokens),
      thoughts_tokens: whole(c.thoughtsTokens),
      cached_tokens: whole(c.cachedTokens),
      tool_tokens: whole(c.toolTokens),
      total_tokens: whole(c.totalTokens),
      ms: whole(c.ms),
    }));
  if (!rows.length) return 0;

  try {
    const { error } = await supabase.from("model_usage").insert(rows);
    if (error) return 0;
    return rows.length;
  } catch {
    return 0;
  }
}
