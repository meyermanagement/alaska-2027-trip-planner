import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";

export async function POST() {
  const user = await whoIs(await createClient());
  if (!isAdminUser(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ error: "This verification flow is archived. Parents can enable read-only itinerary and packing review in Child access. Ask Aly cannot be enabled for minors." }, { status: 410 });
}
