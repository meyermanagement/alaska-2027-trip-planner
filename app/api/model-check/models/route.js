// Which models the vendors will answer to today, and which ones the app uses.
// Admin only: it spends nothing, but it describes the deployment.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { discover } from "@/lib/model-lab/catalog";
import { EMAIL_READY } from "@/lib/model-lab/run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!isAdminUser(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const found = await discover();
  return NextResponse.json({ ...found, unavailable: EMAIL_READY ? {} : { email: "Needs the email reader's prompt exported from the parser" } });
}
