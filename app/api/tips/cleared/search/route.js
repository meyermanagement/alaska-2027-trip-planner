import { NextResponse } from "next/server";
import { archiveContext } from "@/lib/tips/archiveAccess";
import { generate } from "@/lib/agent/llm";
import { ARCHIVE_COLUMNS, ARCHIVE_LIMIT, UUID, searchTerms, archiveFilter, directMatches, mergeMatches, selectedMatches, RANK_SYSTEM } from "@/lib/tips/archiveSearch";
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
    if (!originalTerms.length) return reply({ error: "Try a place or topic, such as cruise motion sickness." }, 400);
    async function lookup(search = null) {
      let requestRows = supabase.from("pro_tips").select(ARCHIVE_COLUMNS)
        .eq("family_id", familyId).in("status", ["cleared", "ignored"]);
      if (search) requestRows = requestRows.or(archiveFilter(search));
      requestRows = requestRows.order("resolved_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false }).limit(ARCHIVE_LIMIT + 1);
      if (body.scope === "trip") requestRows = requestRows.eq("trip_id", body.tripId);
      else requestRows = requestRows.in("scope", WALLET_SCOPES);
      const { data, error } = await requestRows;
      if (error) throw new Error("Archive lookup failed");
      return data || [];
    }
    // Literal retrieval protects older explicit hits. Semantic retrieval must
    // not depend on guessed synonyms: review the scoped archive itself.
    const directRows = await lookup(originalTerms);
    let archiveRows = [], archiveUnavailable = false;
    if (ai) {
      try { archiveRows = await lookup(); }
      catch { archiveUnavailable = true; /* Keep literal search usable. */ }
    }
    const literal = directMatches(directRows, originalTerms);
    const combined = mergeMatches(literal, archiveRows, ARCHIVE_LIMIT * 2 + 2);
    const candidates = combined.slice(0, ARCHIVE_LIMIT);
    const direct = directMatches(candidates, originalTerms);
    let tips = direct.slice(0, 30), mode = "keywords";
    let semanticChecked = false;
    let truncated = archiveUnavailable || directRows.length > ARCHIVE_LIMIT ||
      archiveRows.length > ARCHIVE_LIMIT || combined.length > ARCHIVE_LIMIT || direct.length > 30;
    if (ai && candidates.length) {
      try {
        const result = await generate({ feature: "tips.archive-rank", system: RANK_SYSTEM, responseFormat: "json",
          messages: [{ role: "user", text: JSON.stringify({ query, records: candidates.map(tip => ({
            id: tip.id, title: tip.title, body: String(tip.body || "").slice(0, 1800),
            because: String(tip.because || "").slice(0, 400),
            about: String(tip.about || "").slice(0, 400), trip: tip.trips?.name,
            destination: tip.trips?.destination, dates: [tip.trips?.start_date, tip.trips?.end_date],
          })) }) }], grounded: false, temperature: 0, thinking: "low", deadline: started + 85000 });
        const ranked = selectedMatches(result.text, candidates);
        if (ranked !== null) {
          semanticChecked = true;
          tips = mergeMatches(direct, ranked);
          truncated ||= new Set([...direct, ...ranked].map(tip => tip.id)).size > 30;
          mode = ranked.length ? "meaning" : "keywords";
        }
      } catch { /* Return visible fallback wording, not an invented semantic result. */ }
    }
    return reply({ tips, mode, truncated, aiAvailable: ai,
      semanticStatus: !ai ? "disabled" : semanticChecked ? "complete" : candidates.length ? "unavailable" : "not_needed",
      note: mode === "meaning" ? "Matched by words and meaning. Original advice has not been rechecked."
        : semanticChecked ? "Showing keyword matches. Original advice has not been rechecked."
          : "Showing keyword matches. Intelligent matching was unavailable; original advice has not been rechecked." });
  } catch {
    return reply({ error: "The search did not finish. Your saved tips have not changed. Please try again." }, 400);
  }
}
