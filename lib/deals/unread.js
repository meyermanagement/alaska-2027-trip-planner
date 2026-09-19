import { fareHasExpired } from "@/lib/deals/deadline";

export async function unreadFares(supabase, userId, familyId = null) {
  if (!userId) return [];
  let query = supabase.from("flight_deals")
    .select("id, message_id, source_name, origin, destination, created_at, book_by, book_by_inferred")
    .eq("status", "open");
  if (familyId) query = query.eq("family_id", familyId);
  const [{ data: deals, error }, { data: reads, error: readError }] = await Promise.all([
    query,
    supabase.from("flight_deal_reads").select("deal_id").eq("user_id", userId),
  ]);
  if (error || readError) return [];
  const seen = new Set((reads || []).map((row) => row.deal_id));
  return (deals || []).filter((deal) => !seen.has(deal.id) && !fareHasExpired(deal));
}
