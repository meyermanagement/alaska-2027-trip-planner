// Can this server send email, and can the morning run happen at all.
//
// Four settings decide it and all four live only on the host, so the only honest
// way to know they are right is to ask the running server. This says which of
// them are present and nothing else: no addresses, no keys, no values. A yes here
// is not proof that Gmail will accept the password — only a real send proves that
// — but a no here explains every silent morning.

import { NextResponse } from "next/server";
import {
  emailTransport,
  emailFrom,
  sendingAddress,
  onOwnDomain,
  transportProblem,
} from "@/lib/email/send";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request) {
  // The probe answers the scheduler and the owner, not the internet. It only ever
  // said which variables are present -- no keys, no addresses -- but a list of
  // which integrations a server has configured is still reconnaissance, and it was
  // reachable by anybody who guessed the path.
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  if (!secret || bearer !== `Bearer ${secret}`) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not allowed." }, { status: 401 });
    }
    const { data: membership } = await supabase
      .from("family_members")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership?.role !== "owner") {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }
  }

  const transport = emailTransport();
  return NextResponse.json({
    transport,
    from: Boolean(emailFrom()),
    // Named, not just counted: the whole point of the check is whether household
    // mail is going out as us, and a boolean cannot answer that.
    sendingAddress: sendingAddress(),
    ownDomain: onOwnDomain(),
    problem: transportProblem(),
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
      !transportProblem() &&
      process.env.CRON_SECRET &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  });
}
