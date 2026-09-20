// Secondary travelers receive only their own and Shared rows through RLS.
// Checking a saved row is distinct from accepting a tip (which creates items).
export function canCheckDayPack(line, { readOnly = false, userId } = {}) {
  if (!userId || !line) return false;
  return line.kind === "row" ? Boolean(line.rowId) : !readOnly && line.kind === "tip";
}

export async function saveDayPackCheck({ supabase, tripId, rowId, packed, userId }) {
  if (!tripId || !rowId || !userId || typeof packed !== "boolean") {
    throw new Error("That could not be saved. Try again.");
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("day_pack_items")
    .update({
      is_packed: packed,
      packed_by: packed ? userId : null,
      packed_at: packed ? now : null,
      updated_by: userId,
      updated_at: now,
    })
    .eq("id", rowId)
    .eq("trip_id", tripId)
    .select("id,is_packed")
    .maybeSingle();
  // RLS can deny an update by matching zero rows, without returning an error.
  if (error || data?.id !== rowId || data?.is_packed !== packed) {
    throw new Error("That could not be saved. Try again.");
  }
  return data;
}
