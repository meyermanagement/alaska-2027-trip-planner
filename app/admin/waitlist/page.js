import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { waitlistRows } from "@/lib/beta/waitlist";
import TopBar from "@/components/TopBar";
import WaitlistDesk from "./WaitlistDesk";

export const metadata = { title: "Waitlist · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * The front door's waitlist, and a code sent from it.
 *
 * Gated the same way as the beta desk and for the same reason: anybody not on
 * the allowlist gets the not-found a misspelt URL gets. The table has row-level
 * security on and no policies, so it is read with the service-role key, and the
 * route that sends from here checks the allowlist for itself.
 *
 * Sending reuses the beta desk's invite action rather than a second copy of it,
 * so a code sent from here is the same row, the same email and the same resend
 * rule as one sent from the desk.
 */

// A beta's worth, and then some. Oldest first, so the ceiling never hides the
// people who have waited longest.
const CEILING = 1000;

export default async function WaitlistPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!isAdminUser(user)) notFound();

  const admin = createAdminClient();
  if (!admin) {
    return (
      <>
        <TopBar />
        <WaitlistDesk keyMissing rows={[]} />
      </>
    );
  }

  const [{ data: entries, error }, { data: codeRows }, { data: accounts }] =
    await Promise.all([
      admin
        .from("waitlist")
        .select("id, first_name, last_name, email, household_size, organizer, created_at")
        .order("created_at", { ascending: true })
        .limit(CEILING),
      admin
        .from("signup_codes")
        .select(
          "code, assigned_email, assigned_at, sent_at, send_count, used_at, expires_at",
        )
        .not("assigned_email", "is", null),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  const codes = (codeRows || []).map((row) => ({
    code: row.code,
    assignedEmail: row.assigned_email,
    assignedAt: row.assigned_at,
    sentAt: row.sent_at,
    sendCount: row.send_count || 0,
    usedAt: row.used_at,
    expiresAt: row.expires_at,
  }));
  const accountEmails = new Set(
    (accounts?.users || [])
      .map((one) => String(one.email || "").toLowerCase())
      .filter(Boolean),
  );

  return (
    <>
      <TopBar />
      <WaitlistDesk
        rows={waitlistRows(entries || [], codes, accountEmails)}
        readError={error?.message || null}
      />
    </>
  );
}
