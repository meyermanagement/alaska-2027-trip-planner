import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientById } from "@/lib/mcp/assistantClients";
import { CONSENT_SURFACE_VERSION } from "@/lib/mcp/consentVersion";

// Records a person's answer on the assistant consent screen.
//
// The consent version is stamped here, on the server, from the same constant
// the MCP route checks (lib/mcp/grant.js), rather than taken from the browser.
// An approval can only be recorded for a client we registered and marked
// approved_for_consent. Runs as the signed-in person, so RLS limits the write
// to their own row.
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const clientId = typeof body?.client_id === "string" ? body.client_id.trim() : "";
  const decision = body?.decision;
  if (!clientId || (decision !== "approve" && decision !== "deny")) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const known = await clientById(supabase, clientId);
  if (decision === "approve" && !known?.approved_for_consent) {
    return NextResponse.json({ error: "This assistant isn’t approved to connect to Alyeska yet." }, { status: 403 });
  }
  if (!known) return NextResponse.json({ ok: true, recorded: false });

  const { error } = await supabase.from("assistant_connections").upsert(
    {
      user_id: user.id,
      client_id: clientId,
      status: decision === "approve" ? "allowed" : "denied",
      consent_version: CONSENT_SURFACE_VERSION,
      decided_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id,client_id" }
  );
  if (error) {
    console.error("assistant_connections upsert failed", error);
    return NextResponse.json({ error: "Your answer couldn’t be saved. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recorded: true, consent_version: CONSENT_SURFACE_VERSION });
}
