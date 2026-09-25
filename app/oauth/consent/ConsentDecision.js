"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clientById } from "@/lib/mcp/assistantClients";

/**
 * The actual consent decision, once the server page has confirmed somebody
 * eligible is signed in and handed over the authorization_id.
 *
 * This has to run in the browser: getAuthorizationDetails, approveAuthorization
 * and denyAuthorization all read the session out of the browser client
 * (lib/supabase/client.js), and approving or denying redirects the tab back to
 * the client's own redirect_uri with the result -- there is no server step
 * after this one. See https://supabase.com/docs/guides/auth/oauth-server/oauth-flows.
 *
 * A client_id the OAuth server itself already validated can still be unknown to
 * assistant_oauth_clients if it registered itself through dynamic client
 * registration rather than being added here by hand -- so this shows what
 * Supabase says about it either way, and adds the name and purpose sentence
 * from our own table only when one exists, rather than refusing an otherwise
 * legitimate request over a missing row.
 */
// Bumped when this screen's disclosure changes -- what it tells a person
// before they decide, not the OAuth protocol itself. Kept separate from
// lib/beta/agreement.js's AGREEMENT_VERSION, which covers the beta terms.
const CONSENT_SURFACE_VERSION = "2026-10-19";

export default function ConsentDecision({ authorizationId, liveGrantsEnabled }) {
  const [state, setState] = useState({ status: "loading" });
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (cancelled) return;
      if (error) {
        setState({ status: "error", message: readableError(error) });
        return;
      }
      // A response with only redirect_url means this was already approved --
      // Supabase's own client library does not redirect for this call, only
      // for approve/deny, so this page redirects itself.
      if (data?.redirect_url && !data?.client) {
        window.location.assign(data.redirect_url);
        return;
      }
      const known = await clientById(supabase, data?.client_id || data?.client?.client_id);
      setState({ status: "ready", details: data, known });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  async function decide(action) {
    setDeciding(true);
    const supabase = createClient();
    const call = action === "approve" ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    const { data, error } = await call(authorizationId, { skipBrowserRedirect: true });
    if (error) {
      setDeciding(false);
      setState((s) => ({ ...s, status: "error", message: readableError(error) }));
      return;
    }
    // Supabase's own tables now hold the OAuth decision; this is Alyeska's own
    // record of it -- the row assistant_connections_enabled() will check once
    // counsel has cleared this screen and the switch is flipped. Best-effort:
    // a write failure here should not strand somebody who already got a valid
    // redirect_url back from Supabase, so it is logged, not surfaced.
    //
    // Gated on `known`, not just a client_id: assistant_connections.client_id
    // references assistant_oauth_clients, so a dynamically-registered client
    // Supabase accepted but this table has never heard of has nowhere to
    // write to yet -- recording that decision has to wait until someone adds
    // that client here, which is exactly the review step this is built to
    // wait for.
    const clientId = state?.known?.client_id;
    if (clientId) {
      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user?.id) {
        const { error: writeError } = await supabase.from("assistant_connections").upsert(
          {
            user_id: auth.user.id,
            client_id: clientId,
            status: action === "approve" ? "allowed" : "denied",
            consent_version: CONSENT_SURFACE_VERSION,
            decided_at: new Date().toISOString(),
            revoked_at: null,
          },
          { onConflict: "user_id,client_id" }
        );
        if (writeError) console.error("assistant_connections upsert failed", writeError);
      }
    }
    if (data?.redirect_url) {
      window.location.assign(data.redirect_url);
      return;
    }
    setDeciding(false);
  }

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-md">
        <div className="card space-y-3 px-4 py-4" aria-busy="true">
          <div className="h-4 w-40 animate-pulse rounded bg-[var(--line)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--line)]" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-[var(--line)]" />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-semibold">This request could not be shown</h1>
        <p className="mt-3 text-sm text-ink-soft">{state.message}</p>
      </div>
    );
  }

  const { details, known } = state;
  const name = known?.client_name || details?.client?.client_name || details?.client_name || "This app";
  const purpose = known?.purpose_summary || known?.client_description || details?.client?.client_description || null;
  const scopes = String(details?.scope || "")
    .split(/\s+/)
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold">Allow {name} to connect?</h1>
      <p className="mt-2 text-sm text-ink-soft">
        {name} is asking to read your trips through Alyeska, using the account you&rsquo;re signed in with now.
      </p>

      {!liveGrantsEnabled && (
        <div className="card mt-4 px-4 py-3 text-sm text-ink-soft">
          Assistant connections aren&rsquo;t live yet. Your answer here is saved, but no assistant can read your
          trips until this is turned on.
        </div>
      )}

      <div className="card mt-5 space-y-3 px-4 py-4">
        {purpose && <p className="text-sm">{purpose}</p>}
        {scopes.length > 0 && (
          <ul className="space-y-1.5 text-sm text-ink-soft">
            {scopes.map((scope) => (
              <li key={scope}>{describeScope(scope)}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <button type="button" className="btn btn-ghost flex-1" disabled={deciding} onClick={() => decide("deny")}>
          Don&rsquo;t allow
        </button>
        <button type="button" className="btn btn-primary flex-1" disabled={deciding} onClick={() => decide("approve")}>
          Allow
        </button>
      </div>

      <p className="mt-4 text-xs text-ink-soft">
        You can remove this later from Settings. {name} never sees health, dietary, or cost details, and nothing
        about a child on this account.
      </p>
    </div>
  );
}

function describeScope(scope) {
  const known = {
    openid: "Confirm it's you",
    email: "Your email address",
    profile: "Your name",
  };
  return known[scope] || scope;
}

function readableError(error) {
  if (error?.status === 404 || /not found|expired/i.test(error?.message || "")) {
    return "This request has expired. Go back to the assistant and try connecting again.";
  }
  return "Something went wrong loading this request. Please try again.";
}
