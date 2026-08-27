// Why an answer came back without having checked the web.
//
// A model vendor refusing us is the one failure that is invisible after the
// fact: the family sees a sentence saying the web was not checked, the server
// log has scrolled away, and nobody can tell a minute's worth of questions asked
// too fast from an allowance spent for the month. So each refusal is written
// down. Nothing in the app reads these rows — they exist to be asked about.

const MAX_ROWS = 6;
const MAX_ASKED = 300;

/**
 * Writes one row per refusal. Never throws and never blocks the answer: a
 * diagnostic that can break a reply is worse than no diagnostic.
 */
export async function recordRefusals(
  supabase,
  { userId, asked, wantedSearch = false, searched = false, refusals = [] } = {},
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
    detail: r?.detail ? String(r.detail).slice(0, 300) : null,
  }));

  try {
    const { error } = await supabase.from("agent_refusals").insert(rows);
    if (error) return 0;
    return rows.length;
  } catch {
    return 0;
  }
}
