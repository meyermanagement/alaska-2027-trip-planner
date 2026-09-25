"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { stampDaySaid } from "@/lib/format";

/**
 * The way back from the consent screen, which tells people "You can remove
 * this later from Settings."
 *
 * Removing does two things, in this order. First Alyeska's own row goes to
 * revoked: that row is what the MCP route checks before every call
 * (lib/mcp/grant.js), so access ends the moment it saves. Then Supabase is
 * asked to revoke its grant, which ends the assistant's tokens and means the
 * next connection has to ask again. If only the second step fails, access has
 * still ended, and the line says so rather than claiming a clean removal.
 *
 * Only allowed connections are listed. A denied or already-removed one has
 * nothing left to take back.
 */
export default function AssistantConnectionsControl({ connections = [] }) {
  const [rows, setRows] = useState(connections);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  if (rows.length === 0 && !note) return null;

  async function remove(row) {
    setBusy(row.client_id);
    setNote("");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    const { error } = userId
      ? await supabase
          .from("assistant_connections")
          .update({ status: "revoked", revoked_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("client_id", row.client_id)
      : { error: new Error("no user") };
    if (error) {
      setBusy("");
      setNote(`${row.name} couldn’t be removed. Nothing changed.`);
      return;
    }
    const revoked = await supabase.auth.oauth.revokeGrant({ clientId: row.client_id }).catch((e) => ({ error: e }));
    setRows((all) => all.filter((r) => r.client_id !== row.client_id));
    setBusy("");
    setNote(
      revoked?.error
        ? `${row.name} can no longer read your trips. It may still appear as connected on its side until you remove it there.`
        : `${row.name} can no longer read your trips.`,
    );
  }

  return (
    <section>
      <h2 className="font-display text-xl font-semibold">Connected assistants</h2>
      {note && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          {note}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <li key={row.client_id} className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold">{row.name}</p>
                <p className="text-xs text-ink-soft">Allowed {stampDaySaid(row.decided_at)}</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost text-sm"
                disabled={Boolean(busy)}
                onClick={() => remove(row)}
              >
                {busy === row.client_id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
