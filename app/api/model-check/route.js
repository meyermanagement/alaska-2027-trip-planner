// Can the assistant search the web, and if not, what exactly did Google say?
//
// Every round of guessing about this has cost an evening, because the only
// evidence lived in a server log that had already scrolled away. Open this while
// signed in and it asks Google two of the smallest questions it can — one with
// search attached, one without — and reports back verbatim.
//
// It answers with the key that is actually set in this deployment, which is the
// whole point: nothing here is inferred from what anyone thinks is configured.
// The key itself is never returned, and neither is anything about the family.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as gemini from "@/lib/agent/providers/gemini";
import { providerNames } from "@/lib/agent/llm";
import { recordRefusals } from "@/lib/agent/refusals";

export const dynamic = "force-dynamic";
// Without these two lines the check is cut off at ten seconds and the page never
// loads at all - which is a poor way to diagnose a timeout.
export const runtime = "nodejs";
export const maxDuration = 60;

// Small on purpose: this is a question about entitlement, not about quality.
const PROBE = "Name one well known restaurant in Willemstad, Curaçao.";
// Two probes, one after the other, comfortably inside the sixty seconds above.
// Sequential on purpose: two requests at once could trip a per-minute burst limit
// and produce exactly the confusion this is meant to clear up.
const PROBE_MS = 12000;

async function probe({ grounded }) {
  const started = Date.now();
  try {
    const out = await gemini.generate({
      system: "Answer in one short sentence.",
      messages: [{ role: "user", text: PROBE }],
      // One declaration, so this exercises the same shape the chat route sends:
      // our own function calling and Google's search in the same request, which
      // is the combination that needs the server-side invocation flag.
      tools: [
        {
          name: "note_place",
          description: "Write down a place worth eating at.",
          parameters: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
      ],
      temperature: 0,
      grounded,
      deadline: Date.now() + PROBE_MS,
    });
    return {
      worked: true,
      model: out.model,
      searched: out.searched === true,
      sources: (out.sources || []).map((s) => s.title),
      said: String(out.text || "").slice(0, 200),
      tookMs: Date.now() - started,
      refusals: out.refusals || [],
    };
  } catch (err) {
    return {
      worked: false,
      status: err?.status ?? null,
      // What the family would have seen.
      shown: String(err?.message || "").slice(0, 300),
      // What Google actually said, per refusal, with the allowance it named.
      refusals: (err?.refusals || []).map((r) => ({
        model: r.model,
        status: r.status,
        grounded: r.grounded,
        quotaId: r.quotaId,
        quotaMetric: r.quotaMetric,
        quotaValue: r.quotaValue,
        retryMs: r.retryMs,
        searchQuota: r.searchQuota,
        google: r.detail,
      })),
      tookMs: Date.now() - started,
    };
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const withSearch = await probe({ grounded: true });
  const withoutSearch = await probe({ grounded: false });

  // Same record the chat route writes, so a check run at midnight is still
  // readable in the morning.
  for (const [label, result] of [
    ["web search check", withSearch],
    ["plain check", withoutSearch],
  ]) {
    await recordRefusals(supabase, {
      userId: user.id,
      asked: label,
      wantedSearch: label.startsWith("web"),
      searched: result.searched === true,
      refusals: result.refusals,
    });
  }

  // Google says "FreeTier" right there in the name of the allowance it refused
  // on. That is worth reading out loud rather than leaving in a field somebody
  // has to know the meaning of.
  const named = [
    ...(withSearch.refusals || []),
    ...(withoutSearch.refusals || []),
  ]
    .map((r) => r.quotaId || "")
    .filter(Boolean);
  const onFreeTier = named.some((id) => /freetier/i.test(id));

  const verdict = withSearch.worked
    ? withSearch.searched
      ? "Search is working."
      : "Search was refused, and the answer came back without it."
    : withoutSearch.worked
      ? "Search is refused and so is the fallback for this key."
      : "Google is not answering at all right now.";

  const because = onFreeTier
    ? "Google refused on an allowance with FreeTier in its name, so the Google Cloud project behind this key is still on the free tier - where search is not available at any volume. An upgrade applies to a project, not to a key, so this is most likely a key belonging to a different project than the one that was upgraded."
    : null;

  return NextResponse.json({
    verdict,
    because,
    onFreeTier,
    keySet: Boolean(process.env.GEMINI_API_KEY),
    providers: providerNames(),
    models: gemini.modelList(),
    withSearch,
    withoutSearch,
    checkedAt: new Date().toISOString(),
  });
}
