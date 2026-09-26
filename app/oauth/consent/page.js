import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { accountAge } from "@/lib/beta/accountAge";
import { assistantConnectionsEnabled } from "@/lib/mcp/connections";
import ConsentDecision from "./ConsentDecision";

export const metadata = { title: "Allow access \u00b7 Alyeska" };
export const dynamic = "force-dynamic";

/**
 * Where Supabase's OAuth 2.1 server sends a person after it has validated an
 * authorization request -- this project's Authorization Path, once that
 * setting is turned on. See research/assistant-surface-implementation-spec.md
 * and supabase/migrations/20261019_assistant_connection_consent.sql (and
 * supabase/held/assistant_connections_go_live.sql, the held switch) for the
 * schema this reads and writes.
 *
 * Everything past the redirect happens in the browser: `getAuthorizationDetails`,
 * `approveAuthorization`, and `denyAuthorization` all read the caller's own
 * session, and Supabase's client library redirects the tab itself once a
 * decision is made. So this page's job is narrow -- confirm somebody is signed
 * in, keep a minor from ever reaching the decision (the account-level rule
 * that already governs every other screen), and hand the authorization_id to
 * the piece that actually talks to Supabase.
 *
 * `assistantConnectionsEnabled()` gates whether an approval here can do
 * anything. Building this screen was authorized ahead of that switch, on the
 * understanding that a family approving a client today grants nothing until
 * counsel has reviewed this exact screen and the switch is turned on
 * afterward -- so while it is off, ConsentDecision says that plainly instead
 * of quietly collecting approvals nobody can act on yet.
 */
export default async function OAuthConsentPage({ searchParams }) {
  const params = await searchParams;
  const authorizationId = params?.authorization_id;

  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) {
    const next = authorizationId
      ? `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
      : "/oauth/consent";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  if (!authorizationId) {
    return (
      <main className="screen px-5 py-10">
        <h1 className="text-xl font-semibold">Nothing to approve</h1>
        <p className="mt-3 text-sm text-ink-soft">
          This page opens from an assistant asking to connect, not on its own. If an assistant sent you here,
          try connecting again from there.
        </p>
      </main>
    );
  }

  const age = await accountAge(supabase, user.id);
  if (age.minor) {
    return (
      <main className="screen px-5 py-10">
        <h1 className="text-xl font-semibold">Not available on this account</h1>
        <p className="mt-3 text-sm text-ink-soft">
          Connecting an assistant isn&rsquo;t available for this account.
        </p>
      </main>
    );
  }
  if (age.unavailable) {
    return (
      <main className="screen px-5 py-10">
        <h1 className="text-xl font-semibold">We couldn&rsquo;t check your account</h1>
        <p className="mt-3 text-sm text-ink-soft">Please reload to try again.</p>
      </main>
    );
  }

  const enabled = await assistantConnectionsEnabled(supabase);

  return (
    <main className="screen px-5 pb-16 pt-7">
      <ConsentDecision authorizationId={authorizationId} liveGrantsEnabled={enabled} />
    </main>
  );
}
