// Why an answer came back without having checked the web.
//
// A model vendor refusing us is the one failure that is invisible after the
// fact: the family sees a sentence saying the web was not checked, the server
// log has scrolled away, and nobody can tell a minute's worth of questions asked
// too fast from an allowance spent for the month. So each refusal is written
// down. Nothing in the app reads these rows — they exist to be asked about.

const MAX_ROWS = 6;
const MAX_ASKED = 300;
const MAX_DETAIL = 300;

/**
 * The clock, said in words, so a stored refusal can be read without arithmetic.
 *
 * A timeout row used to say only "No reply within 39774ms", and 39774 is not a
 * number anywhere in the app: the turn was supposed to have been given either
 * 40000 or 62000. Working out which meant guessing how much of the request had
 * already gone on building the trip's context before the model was asked at all,
 * and that number was never written down anywhere. So it is written down here.
 */
export function turnNote({ gaveMs, beforeMs, grounded } = {}) {
  const parts = [];
  if (Number.isFinite(gaveMs)) parts.push(`given ${gaveMs}ms`);
  if (Number.isFinite(beforeMs))
    parts.push(`${beforeMs}ms spent before asking`);
  if (grounded === true) parts.push("web search attached");
  if (grounded === false) parts.push("no web search");
  return parts.length ? parts.join(", ") : "";
}

function withTurn(detail, turn) {
  const note = turn ? turnNote(turn) : "";
  const said = detail ? String(detail) : "";
  if (!note) return said ? said.slice(0, MAX_DETAIL) : null;
  return `${said ? `${said} · ` : ""}${note}`.slice(0, MAX_DETAIL);
}

/**
 * Writes one row per refusal. Never throws and never blocks the answer: a
 * diagnostic that can break a reply is worse than no diagnostic.
 */
export async function recordRefusals(
  supabase,
  {
    userId,
    asked,
    wantedSearch = false,
    searched = false,
    refusals = [],
    // What the turn was allowed and what had already been spent. Appended to
    // every row of this failure, because the shape of the clock is a fact about
    // the request rather than about any one model that was asked.
    turn = null,
  } = {},
) {
  if (!supabase || !userId) return 0;
  const list = Array.isArray(refusals) ? refusals.slice(0, MAX_ROWS) : [];
  if (!list.length) return 0;

  const rows = list.map((r) => ({
    user_id: userId,
    asked: String(asked || "").slice(0, MAX_ASKED),
    wanted_search: wantedSearch === true,
    searched: searched === true,
    model: r?.model ? String(r.model).slice(0, 80) : null,
    status: Number.isFinite(r?.status) ? r.status : null,
    grounded: r?.grounded === true,
    quota_id: r?.quotaId ? String(r.quotaId).slice(0, 200) : null,
    quota_metric: r?.quotaMetric ? String(r.quotaMetric).slice(0, 200) : null,
    quota_value: Number.isFinite(r?.quotaValue) ? r.quotaValue : null,
    retry_ms: Number.isFinite(r?.retryMs) ? r.retryMs : null,
    search_quota: r?.searchQuota === true,
    detail: withTurn(r?.detail, turn),
  }));

  try {
    const { error } = await supabase.from("agent_refusals").insert(rows);
    if (error) return 0;
    return rows.length;
  } catch {
    return 0;
  }
}
