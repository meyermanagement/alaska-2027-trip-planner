// Filter the bottom-bar menu against a live natural-language query.
//
// The compass menu carries a search field that filters the pills above it as
// the primary types. A substring match on label and sub was the first pass,
// but it made the field feel like a document search rather than a way of
// asking the app what you want. Typing "suitcase" did not surface Packing;
// typing "when do I check in" did not surface a trip's overview; typing
// "family" did not surface People. This endpoint hands the query and the
// menu to a model and gets back the small set of menu keys the model thinks
// answer that query.
//
// The response is intentionally just a set of keys, not a ranked list with
// explanations. The client already has every row's presentation; all it
// needs from the server is which subset to draw. Keeping the payload flat
// and the client rendering unchanged means the filter can be swapped for a
// different backend later without touching the menu component.
//
// No auth, no database, no reads of the family's own data -- the menu shape
// is public to the client anyway, and the query is one line. On any error
// the endpoint returns keys: null, and the client falls back to the plain
// substring filter for that keystroke rather than blanking the column.

import { NextResponse } from "next/server";
import { generate as callModel } from "@/lib/agent/llm";
import { firstJson } from "@/lib/tips/parse";

export const runtime = "nodejs";

const SYSTEM = `You are the search-intent filter for one screen: a small in-app menu of navigation destinations. The primary types into a search box and you decide which menu keys they meant. You do not answer their question or give advice; you route.

The menu is a mix of groups (folders of destinations) and destinations themselves. A destination is where the primary ends up when they tap it. A group is a folder they open to reveal destinations. You return the keys of destinations that answer the query, and the keys of any groups those destinations sit under so the folder unfolds around them. If a group's own label or purpose matches the query, return the group key and every destination key under it. When nothing on the menu really fits the query, return an empty list -- do not force a poor match.

Interpret loosely. The primary might type a synonym ("suitcase" for Packing), a task ("check in for my flight" for a trip's Overview or Wallet), a person ("Steph" for People/Family), a place ("Curaçao" for a trip), a mood ("what's next" for the current trip plate), or a partial word ("rem" for Reminders). Match by what the row is for, not just by the letters in its label.

If the query is empty or one or two letters, still try -- one letter is often the first letter of the word. But if the query is nonsense (random letters, keyboard mash, a URL, a swear), return an empty list.

Rules:
1. Return STRICT JSON of the shape {"keys": ["...", "...", "..."]}. No commentary, no markdown fence.
2. Every key in your response must appear in the menu you were given. Do not invent keys.
3. Order the keys by how well they answer the query, most-relevant first. The client draws them in the same order.
4. Include the group key for any destination key that sits under a group, so the folder opens. A destination without a group parent just goes on its own.
5. Cap at eight keys. A menu narrowed to more than that is not narrowed.
6. Do not include the current screen's key (marked "you are here") unless the query specifically asks for it -- the primary is already on it.`;

function keyList(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeMenu(menu) {
  if (!Array.isArray(menu)) return [];
  const out = [];
  for (const item of menu) {
    if (!item || typeof item !== "object") continue;
    const key = keyList(item.key);
    if (!key) continue;
    const entry = {
      key,
      kind: keyList(item.kind) || "link",
      label: keyList(item.label),
      sub: keyList(item.sub),
    };
    if (item.parent) entry.parent = keyList(item.parent);
    if (item.here) entry.here = true;
    out.push(entry);
  }
  return out;
}

function briefFor({ query, menu, currentPath }) {
  const lines = [];
  lines.push(`Query: ${query}`);
  if (currentPath) lines.push(`Currently on: ${currentPath}`);
  lines.push("Menu:");
  for (const row of menu) {
    const parts = [`- key=${row.key}`];
    parts.push(`kind=${row.kind}`);
    if (row.parent) parts.push(`parent=${row.parent}`);
    if (row.here) parts.push("you are here");
    if (row.label) parts.push(`label="${row.label}"`);
    if (row.sub) parts.push(`sub="${row.sub}"`);
    lines.push(parts.join(" · "));
  }
  lines.push('Return JSON only: {"keys": ["...", "..."]}');
  return lines.join("\n");
}

function parseKeys(text, allowed) {
  if (typeof text !== "string") return null;
  const parsed = firstJson(text);
  if (!parsed || !Array.isArray(parsed.keys)) return null;
  const out = [];
  const seen = new Set();
  for (const item of parsed.keys) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (!key) continue;
    if (!allowed.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= 12) break;
  }
  return out;
}

export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const query = keyList(body?.query);
  const currentPath = keyList(body?.currentPath);
  const menu = normalizeMenu(body?.menu);
  if (!query || menu.length === 0) {
    return NextResponse.json({ keys: [] });
  }
  const allowed = new Set(menu.map((m) => m.key));

  try {
    const result = await callModel({
      system: SYSTEM,
      messages: [
        { role: "user", text: briefFor({ query, menu, currentPath }) },
      ],
      temperature: 0.2,
      grounded: false,
      thinking: "low",
    });
    const keys = parseKeys(result?.text || "", allowed);
    if (!keys) {
      return NextResponse.json({ keys: null, error: "unparseable" });
    }
    return NextResponse.json({ keys });
  } catch (err) {
    // Signal failure with a null so the client falls back to the simple
    // substring filter for this keystroke; an empty array here would look
    // like "the model considered your query and found nothing", which is a
    // different message.
    return NextResponse.json(
      { keys: null, error: err?.message || "model_error" },
      { status: 200 },
    );
  }
}
