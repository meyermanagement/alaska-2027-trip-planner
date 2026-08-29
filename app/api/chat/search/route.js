import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HIT_CLOSE, HIT_OPEN, searchConversations } from "@/lib/agent/thread";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QUERY = 200;

// Searching everything Aly has ever been told. Results come back grouped by
// conversation, each with the lines that matched, so the answer to "when did we
// talk about the glacier day?" is a conversation you can open.
export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const q = (new URL(request.url).searchParams.get("q") || "")
    .slice(0, MAX_QUERY)
    .trim();
  if (q.length < 2) return NextResponse.json({ query: q, results: [] });

  const { hits, error } = await searchConversations(supabase, q, { limit: 60 });
  if (error) {
    return NextResponse.json(
      { error: "Could not search your conversations." },
      { status: 500 },
    );
  }

  // Full-text search works on whole words, so a half-typed word or an unusual
  // spelling finds nothing. Rather than show an empty result for something that
  // is plainly in there, fall back to a plain contains-this-text search.
  let rows = hits;
  let matched = "words";
  if (!rows.length) {
    const { data } = await supabase
      .from("chat_messages")
      .select("id, conversation_id, role, kind, body, created_at")
      .ilike("body", `%${escapeForLike(q)}%`)
      .order("created_at", { ascending: false })
      .limit(60);
    const titles = await titlesFor(
      supabase,
      (data || []).map((m) => m.conversation_id),
    );
    rows = (data || []).map((m) => ({
      conversationId: m.conversation_id,
      title: titles.get(m.conversation_id)?.title || "Conversation",
      tripId: titles.get(m.conversation_id)?.tripId || null,
      messageId: m.id,
      role: m.role,
      kind: m.kind || null,
      createdAt: m.created_at,
      snippet: markAround(m.body, q),
    }));
    matched = rows.length ? "text" : "nothing";
  }

  // Conversations whose title matches are worth showing even when no single
  // message does — the title is usually the first thing that was asked.
  const { data: byTitle } = await supabase
    .from("chat_conversations")
    .select("id, title, trip_id, updated_at")
    .ilike("title", `%${escapeForLike(q)}%`)
    .order("updated_at", { ascending: false })
    .limit(20);

  const groups = new Map();
  for (const hit of rows) {
    const group = groups.get(hit.conversationId) || {
      conversationId: hit.conversationId,
      title: hit.title,
      tripId: hit.tripId,
      titleMatch: false,
      hits: [],
    };
    // Three lines per conversation is enough to recognize it; the rest is
    // reading the conversation itself.
    if (group.hits.length < 3) group.hits.push(strip(hit));
    groups.set(hit.conversationId, group);
  }
  for (const row of byTitle || []) {
    const group = groups.get(row.id) || {
      conversationId: row.id,
      title: row.title,
      tripId: row.trip_id,
      hits: [],
    };
    group.titleMatch = true;
    groups.set(row.id, group);
  }

  // The trip a conversation belongs to is worth showing next to it, so a hit is
  // recognisable without opening it.
  const results = [...groups.values()];
  const names = await tripNames(
    supabase,
    results.map((r) => r.tripId),
  );
  for (const result of results) {
    result.tripName = result.tripId ? names.get(result.tripId) || null : null;
  }

  return NextResponse.json({ query: q, matched, results });
}

async function tripNames(supabase, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await supabase
    .from("trips")
    .select("id, name")
    .in("id", unique);
  return new Map((data || []).map((t) => [t.id, t.name]));
}

function strip(hit) {
  return {
    messageId: hit.messageId,
    role: hit.role,
    kind: hit.kind,
    createdAt: hit.createdAt,
    snippet: hit.snippet,
  };
}

async function titlesFor(supabase, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await supabase
    .from("chat_conversations")
    .select("id, title, trip_id")
    .in("id", unique);
  return new Map(
    (data || []).map((c) => [c.id, { title: c.title, tripId: c.trip_id }]),
  );
}

// The same marker pair Postgres uses for its own highlighting, so the client has
// only one thing to parse. Anything already containing the markers is neutered
// first, so a message can never fake a highlight.
function markAround(body, q) {
  const text = String(body || "")
    .replace(/\s+/g, " ")
    .replaceAll(HIT_OPEN, "[ [")
    .replaceAll(HIT_CLOSE, "] ]");
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return text.slice(0, 180);
  const from = Math.max(0, at - 60);
  const lead = from > 0 ? "... " : "";
  const found = text.slice(at, at + q.length);
  return `${lead}${text.slice(from, at)}${HIT_OPEN}${found}${HIT_CLOSE}${text.slice(
    at + q.length,
    at + q.length + 100,
  )}`;
}

function escapeForLike(value) {
  return value.replace(/[%_\\]/g, (c) => `\\${c}`);
}
