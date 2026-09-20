import { NextResponse } from "next/server";
import { archiveContext } from "@/lib/tips/archiveAccess";
import { generate } from "@/lib/agent/llm";
import { ARCHIVE_COLUMNS, ARCHIVE_LIMIT, UUID, readJson, searchTerms, archiveFilter, keywordRank, directMatches, mergeMatches, selectedMatches, EXPAND_SYSTEM, RANK_SYSTEM } from "@/lib/tips/archiveSearch";
import { WALLET_SCOPES } from "@/lib/tips/tip";

export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request) {
  const started = Date.now();
  try {
    const context = await archiveContext(request);
    if (context.error) return reply({ error: context.error }, context.status);
    const raw = await request.text();
    if (raw.length > 4000) return reply({ error: "Please shorten your search." }, 400);
    const body = JSON.parse(raw);
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (query.length < 3 || query.length > 500 || !["trip", "wallet"].includes(body.scope) ||
        (body.scope === "trip" && !UUID.test(body.tripId || "")))
      return reply({ error: "Search from a trip's cleared tips or Wallet history." }, 400);
    const { supabase, familyId, ai } = context;
    const originalTerms = searchTerms(query);
    let terms = originalTerms, expanded = false;
    if (ai) {
      try {
        const result = await generate({ feature: "tips.archive-search", system: EXPAND_SYSTEM,
          messages: [{ role: "user", text: query }], grounded: false, temperature: 0,
          thinking: "low", deadline: started + 28000 });
        const parsed = readJson(result.text);
        if (Array.isArray(parsed?.terms)) { terms = searchTerms(query, parsed.terms); expanded = true; }
      } catch { /* Keyword search remains usable without model availability. */ }
    }
    if (!terms.length) return reply({ error: "Try a place or topic, such as cruise motion sickness." }, 400);
    async function lookup(search) {
      if (!search.length) return [];
      let requestRows = supabase.from("pro_tips").select(ARCHIVE_COLUMNS)
        .eq("family_id", familyId).in("status", ["cleared", "ignored"])
        .or(archiveFilter(search)).order("resolved_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false }).limit(ARCHIVE_LIMIT + 1);
      if (body.scope === "trip") requestRows = requestRows.eq("trip_id", body.tripId);
      else requestRows = requestRows.in("scope", WALLET_SCOPES);
      const { data, error } = await requestRows;
      if (error) throw new Error("Archive lookup failed");
      return data || [];
    }
    // Retrieve literal matches separately so a large set of newer synonym
    // matches cannot crowd an older direct hit out of the candidate window.
    const directRows = await lookup(originalTerms);
    const relatedTerms = terms.filter(term => !originalTerms.includes(term));
    let relatedRows = [];
    try { relatedRows = await lookup(relatedTerms); }
    catch { expanded = false; /* A failed enhancement must not hide direct hits. */ }
    const combined = mergeMatches(directRows, relatedRows, ARCHIVE_LIMIT * 2 + 2);
    const candidates = combined.slice(0, ARCHIVE_LIMIT);
    const direct = directMatches(candidates, originalTerms);
    let tips = mergeMatches(direct, keywordRank(candidates, terms)), mode = expanded ? "expanded" : "keywords";
    let semanticChecked = false;
    const truncated = directRows.length > ARCHIVE_LIMIT || relatedRows.length > ARCHIVE_LIMIT || combined.length > ARCHIVE_LIMIT || tips.length < candidates.length;
    if (ai && candidates.length) {
      try {
        const result = await generate({ feature: "tips.archive-rank", system: RANK_SYSTEM,
          messages: [{ role: "user", text: JSON.stringify({ query, records: candidates.map(tip => ({
            id: tip.id, title: tip.title, body: String(tip.body || "").slice(0, 1800),
            because: String(tip.because || "").slice(0, 400), trip: tip.trips?.name,
            destination: tip.trips?.destination, dates: [tip.trips?.start_date, tip.trips?.end_date],
          })) }) }], grounded: false, temperature: 0, thinking: "low", deadline: started + 85000 });
        const ranked = selectedMatches(result.text, candidates);
        if (ranked !== null) {
          semanticChecked = true;
          tips = mergeMatches(direct, ranked);
          mode = ranked.length ? "meaning" : "keywords";
        }
      } catch { /* Return visible fallback wording, not an invented semantic result. */ }
    }
    return reply({ tips, mode, truncated, aiAvailable: ai,
      note: mode === "meaning" ? "Matched by words and meaning. Original advice has not been rechecked."
        : mode === "expanded" ? "Matched related words. Relevance ranking was unavailable; original advice has not been rechecked."
          : semanticChecked ? "Showing keyword matches. Original advice has not been rechecked."
          : "Showing keyword matches. Intelligent matching was unavailable; original advice has not been rechecked." });
  } catch {
    return reply({ error: "The search did not finish. Your saved tips have not changed. Please try again." }, 400);
  }
}
