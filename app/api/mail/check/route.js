// Can this server send email, and can the morning run happen at all.
//
// Four settings decide it and all four live only on the host, so the only honest
// way to know they are right is to ask the running server. This says which of
// them are present and nothing else: no addresses, no keys, no values. A yes here
// is not proof that Gmail will accept the password — only a real send proves that
// — but a no here explains every silent morning.

import { NextResponse } from "next/server";
import { emailTransport, emailFrom } from "@/lib/email/send";

export const runtime = "nodejs";

export async function GET() {
  const transport = emailTransport();
  return NextResponse.json({
    transport,
    from: Boolean(emailFrom()),
    gmailUser: Boolean(process.env.GMAIL_USER),
    gmailPassword: Boolean(process.env.GMAIL_APP_PASSWORD),
    resendKey: Boolean(process.env.RESEND_API_KEY),
    siteUrl: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
    cronSecret: Boolean(process.env.CRON_SECRET),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    // Everything the nightly run needs, in one word.
    ready: Boolean(
      transport &&
      emailFrom() &&
      process.env.CRON_SECRET &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  });
}
