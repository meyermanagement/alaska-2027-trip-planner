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
import { SYSTEM, keyList, normalizeMenu, briefFor, parseKeys } from "@/lib/nav/search";

export const runtime = "nodejs";

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
      feature: "nav.search",
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
