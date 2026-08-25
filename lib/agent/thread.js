// The conversation itself, kept in our own database rather than inside a model
// vendor's servers. One thread per person per trip, plus a thread for the
// all-trips view (trip_id null). Private to the person who wrote it: RLS on
// chat_messages restricts every row to auth.uid().
//
// Holding the transcript here is what makes the model swappable — history and
// receipts survive a change of provider.

// How much of the past is replayed to the model each turn.
export const CONTEXT_MESSAGES = 12;
// How much is shown when the drawer is reopened.
export const TRANSCRIPT_MESSAGES = 60;
// A pasted itinerary or packing list is a legitimately long message, and the
// stored copy is what Aly reads back later, so it has to survive intact.
const MAX_BODY = 12000;

export async function loadThread(
  supabase,
  userId,
  tripId,
  limit = CONTEXT_MESSAGES,
) {
  let query = supabase
    .from("chat_messages")
    .select("id, role, kind, body, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  query = tripId ? query.eq("trip_id", tripId) : query.is("trip_id", null);

  const { data, error } = await query;
  if (error) return { messages: [], error };
  // Newest-first out of the database so the limit takes the most recent tail;
  // flipped back to reading order here.
  return { messages: (data || []).reverse(), error: null };
}

export async function appendMessage(
  supabase,
  userId,
  tripId,
  role,
  body,
  kind = null,
) {
  const text = String(body || "").slice(0, MAX_BODY);
  if (!text.trim()) return { error: null };
  const { error } = await supabase.from("chat_messages").insert({
    user_id: userId,
    trip_id: tripId || null,
    role,
    kind,
    body: text,
  });
  return { error };
}

// Long messages are stored whole, but replaying a dozen pasted itineraries in
// full on every later turn is waste. Older turns get a trimmed copy; the newest
// message, the one being answered, is always sent intact.
const REPLAY_BODY = 2500;

// What the model is given: plain user/assistant turns. Receipts ("Saved 2
// changes.") are part of the story too — without them Aly forgets that the user
// approved something.
export function toModelMessages(rows) {
  const kept = rows.filter((m) => typeof m.body === "string" && m.body.trim());
  const last = kept.length - 1;
  return kept.map((m, i) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    text:
      i === last || m.body.length <= REPLAY_BODY
        ? m.body
        : `${m.body.slice(0, REPLAY_BODY)}\n…(earlier message shortened)`,
  }));
}
