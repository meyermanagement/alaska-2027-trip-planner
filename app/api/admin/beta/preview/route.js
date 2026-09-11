import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { betaInviteEmail } from "@/lib/email/betaInvite";
import { siteOrigin } from "@/lib/email/sendInvite";

/**
 * The invitation, rendered in a tab, so it can be read before it is sent to
 * somebody.
 *
 * Renders against made-up details rather than a real tester's, so opening the
 * preview never risks looking like a sent message, and never puts a live code on
 * a screen that might be shared.
 */
export async function GET(request) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!isAdminUser(user)) {
    return new NextResponse(null, { status: 404 });
  }

  // Same address the real send would use, so the preview shows the link that
  // would actually arrive rather than the deployment's own hostname.
  const siteUrl = siteOrigin(request);
  const mail = betaInviteEmail({
    name: "Sam Whitfield",
    email: "sam@example.com",
    code: "ALY-XXXX-XXXX",
    siteUrl,
    note: "You three are the first people I have shown this to.",
  });

  return new NextResponse(mail.html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
