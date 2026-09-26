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
      // Supabase returns the client as { id, name, uri, logo_uri }. Reading
      // client.client_id here found nothing, so no approval was ever recorded.
      const known = await clientById(supabase, data?.client?.id || data?.client_id);
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
    const approving = action === "approve";

    // Alyeska's own record of the answer, written before Supabase is told.
    // The MCP route (lib/mcp/grant.js) honors only this row, so an approval
    // that cannot be recorded is not sent: otherwise the assistant would get a
    // token that the route then refuses. A denial is recorded when it can be,
    // but is sent either way.
    const clientId = state?.known?.client_id;
    const recordable = Boolean(clientId && state?.known?.approved_for_consent);
    if (approving && !recordable) {
      setDeciding(false);
      setState((s) => ({ ...s, status: "error", message: "This assistant isn’t approved to connect to Alyeska yet." }));
      return;
    }
    if (clientId) {
      // The server stamps the consent version (app/api/assistant-connections/decide).
      let writeError = null;
      try {
        const res = await fetch("/api/assistant-connections/decide", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ client_id: clientId, decision: action }),
        });
        if (!res.ok) writeError = new Error(String(res.status));
      } catch (e) {
        writeError = e;
      }
      if (writeError) {
        console.error("assistant_connections record failed", writeError);
        if (approving) {
          setDeciding(false);
          setState((s) => ({ ...s, status: "error", message: "Your answer couldn’t be saved. Please try again." }));
          return;
        }
      }
    }

    const call = approving ? supabase.auth.oauth.approveAuthorization : supabase.auth.oauth.denyAuthorization;
    const { data, error } = await call(authorizationId, { skipBrowserRedirect: true });
    if (error) {
      setDeciding(false);
      setState((s) => ({ ...s, status: "error", message: readableError(error) }));
      return;
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
  const name = known?.client_name || details?.client?.name || details?.client?.client_name || details?.client_name || "This app";
  const purpose = known?.purpose_summary || known?.client_description || details?.client?.client_description || null;
  // Where the answer goes. Supabase has already matched this against the
  // client's registered redirect URIs; showing the host lets a person see that
  // a request calling itself Claude is actually going back to claude.ai.
  const returnsTo = hostOf(details?.redirect_uri);
  const scopes = String(details?.scope || "")
    .split(/\s+/)
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold">Allow {name} to connect?</h1>
      <p className="mt-2 text-sm text-ink-soft">
        {name} is asking to read your trips and travel details through Alyeska, check off packing, day pack items and reminders, add packing items, reminders and bucket-list places, and create and change trips, itinerary items, wallet programs, packing templates, day packs, budgets, fares, home airports, pet plans and your adults&rsquo; travel preferences, using the account you&rsquo;re signed in with now. Its changes save right away, without the review Ask Aly shows. It can&rsquo;t delete anything except taking an add-on packing template off a trip when you ask.
      </p>
      {returnsTo && (
        <p className="mt-2 text-sm text-ink-soft">
          Your answer goes back to <span className="font-semibold text-ink break-all">{returnsTo}</span>.
        </p>
      )}

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
        You can remove this later from Settings. {name} never sees health or allergy details; ID, member, or policy
        numbers; typed notes; or anything about a child on this account except, for a parent, the child&rsquo;s
        packing items, day pack items and reminders.
      </p>
    </div>
  );
}

function hostOf(uri) {
  try {
    return new URL(uri).host || null;
  } catch {
    return null;
  }
}

function describeScope(scope) {
  const known = {
    openid: "Confirm it's you",
    email: "Your email address",
    profile: "Your name",
    phone: "Your phone number, if your account has one",
    offline_access: "Stay connected until you remove it",
  };
  return known[scope] || scope;
}

function readableError(error) {
  if (error?.status === 404 || /not found|expired/i.test(error?.message || "")) {
    return "This request has expired. Go back to the assistant and try connecting again.";
  }
  return "Something went wrong loading this request. Please try again.";
}
