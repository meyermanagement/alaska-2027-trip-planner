// The conversation itself, kept in our own database rather than inside a model
// vendor's servers. Aly holds many conversations, not one endless transcript:
// chat_conversations is the list you pick from when you open her, and every
// message belongs to exactly one of them. A conversation remembers which trip it
// was started from, which is only a default target for what gets changed — Aly
// always sees every trip regardless.
//
// Private to the person who wrote it: RLS on both tables restricts every row to
// auth.uid().
//
// Holding the transcript here is what makes the model swappable — history,
// receipts and search all survive a change of provider.

// How much of the past is replayed to the model each turn.
export const CONTEXT_MESSAGES = 12;
// How much is shown when a conversation is reopened.
export const TRANSCRIPT_MESSAGES = 60;
// A pasted itinerary or packing list is a legitimately long message, and the
// stored copy is what Aly reads back later, so it has to survive intact.
const MAX_BODY = 12000;

// Where the highlighting in a search result starts and ends. Postgres puts these
// around the matched words; the client splits on them and renders the marks
// itself, so nothing from a message is ever treated as markup.
export const HIT_OPEN = "[[";
export const HIT_CLOSE = "]]";

export async function loadThread(
  supabase,
  conversationId,
  limit = CONTEXT_MESSAGES,
) {
  if (!conversationId) return { messages: [], error: null };
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, kind, body, sources, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) return { messages: [], error };
  // Newest-first out of the database so the limit takes the most recent tail;
  // flipped back to reading order here.
  return { messages: (data || []).reverse(), error: null };
}

export async function appendMessage(
  supabase,
  {
    userId,
    conversationId,
    tripId = null,
    role,
    body,
    kind = null,
    provider = null,
    model = null,
    latencyMs = null,
    fallbackDepth = null,
    sources = null,
  },
) {
  const text = String(body || "").slice(0, MAX_BODY);
  if (!text.trim() || !conversationId) return { error: null };
  const row = {
    user_id: userId,
    conversation_id: conversationId,
    trip_id: tripId || null,
    role,
    kind,
    body: text,
  };
  // Only assistant rows carry a model trail, and only when the caller knows it,
  // so a question keeps reading as a question with nothing pretended about it.
  if (provider) row.provider = String(provider);
  if (model) row.model = String(model);
  if (Number.isFinite(latencyMs)) row.latency_ms = Math.round(latencyMs);
  if (Number.isFinite(fallbackDepth)) row.fallback_depth = fallbackDepth;
  // Only written when there were any, so an ordinary reply keeps a null rather
  // than an empty array that reads as though a search came back with nothing.
  if (Array.isArray(sources) && sources.length) {
    row.sources = sources.slice(0, 6).map((s) => ({
      title: String(s?.title || "").slice(0, 120),
      url: String(s?.url || "").slice(0, 2000),
    }));
  }
  const { error } = await supabase.from("chat_messages").insert(row);
  return { error };
}

// Every route that writes to a conversation goes through this, so an id that was
// made up, or belongs to someone else, can never be written into. RLS would
// refuse the write anyway; this turns that into a fresh conversation instead of
// a lost message.
export async function ensureConversation(
  supabase,
  userId,
  { conversationId = null, tripId = null, focus = null, title = null } = {},
) {
  if (conversationId) {
    const { data } = await supabase
      .from("chat_conversations")
      .select("id, trip_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (data?.id) return { id: data.id, created: false, error: null };
  }
  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({
      user_id: userId,
      trip_id: tripId || null,
      focus: focus || null,
      // Left null when there is nothing to name it after: a trigger writes the
      // title from the first thing the user says.
      title: title || null,
    })
    .select("id")
    .maybeSingle();
  if (error || !data?.id) return { id: null, created: false, error };
  return { id: data.id, created: true, error: null };
}

export async function listConversations(supabase, limit = 50) {
  const { data, error } = await supabase.rpc("list_chat_conversations", {
    lim: limit,
  });
  if (error) return { conversations: [], error };
  return {
    conversations: (data || []).map((row) => ({
      id: row.id,
      title: row.title || row.trip_name || "New conversation",
      tripId: row.trip_id || null,
      tripName: row.trip_name || null,
      focus: row.focus || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: Number(row.message_count || 0),
      preview: row.preview || "",
    })),
    error: null,
  };
}

// Full-text search across every conversation the person has had. `exclude` drops
// one conversation from the results, which is what recall below uses so Aly is
// never told about the conversation she is already in.
export async function searchConversations(
  supabase,
  query,
  { exclude = null, limit = 40 } = {},
) {
  const q = String(query || "").trim();
  if (!q) return { hits: [], error: null };
  const { data, error } = await supabase.rpc("search_chat", {
    q,
    exclude_conversation: exclude,
    lim: limit,
  });
  if (error) return { hits: [], error };
  return { hits: (data || []).map(toHit), error: null };
}

function toHit(row) {
  return {
    conversationId: row.conversation_id,
    title: row.conversation_title || "Conversation",
    tripId: row.trip_id || null,
    messageId: row.message_id,
    role: row.role,
    kind: row.kind || null,
    createdAt: row.created_at,
    snippet: row.snippet || "",
  };
}

// Postgres' websearch syntax treats bare words as AND, which is right for a
// search box and wrong for recall: a whole sentence would match nothing. So for
// recall the significant words are OR-ed together instead.
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "another",
  "because",
  "been",
  "before",
  "being",
  "could",
  "does",
  "doing",
  "down",
  "each",
  "even",
  "ever",
  "every",
  "from",
  "have",
  "having",
  "here",
  "into",
  "just",
  "like",
  "make",
  "many",
  "more",
  "most",
  "much",
  "need",
  "only",
  "other",
  "over",
  "same",
  "should",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "thing",
  "things",
  "this",
  "those",
  "through",
  "very",
  "want",
  "well",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "will",
  "with",
  "would",
  "your",
  "yours",
]);

export function recallQuery(text, max = 8) {
  const words = String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ""))
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  const unique = [];
  for (const w of words) {
    if (!unique.includes(w)) unique.push(w);
    if (unique.length >= max) break;
  }
  return unique.join(" or ");
}

// What lets one conversation reference the others: before answering, the words
// of the question are used to pull the closest lines out of every other
// conversation, and those go into the prompt. So "what did we decide about the
// Curaçao flights?" finds that decision even though it was made somewhere else.
export async function recallOtherConversations(
  supabase,
  { message, exclude = null, limit = 6 } = {},
) {
  const query = recallQuery(message);
  if (!query) return { hits: [] };
  const { hits } = await searchConversations(supabase, query, {
    exclude,
    limit,
  });
  return { hits };
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
