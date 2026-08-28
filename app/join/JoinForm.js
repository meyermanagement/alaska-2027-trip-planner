"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function claimByEmail() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("claim_traveler_seat");
    setBusy(false);
    if (error || !data) {
      setError(
        error?.message ||
          "No one has added this email address to a family yet. Ask whoever set up the trips to add you on their Family tab, then try again.",
      );
      return;
    }
    router.replace("/trips");
    router.refresh();
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("join_family_with_code", {
      p_code: code.trim(),
    });
    setBusy(false);
    if (error) {
      setError(error.message || "That code did not work.");
      return;
    }
    router.replace("/trips");
    router.refresh();
  }

  return (
    <div className="card space-y-3 p-5">
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Invite code
          </span>
          <input
            className="field font-mono uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="MEYER2027"
            required
          />
        </label>
        {error && (
          <p className="rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Checking…" : "Join family"}
        </button>
      </form>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-sand-deep" />
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          or
        </span>
        <span className="h-px flex-1 bg-sand-deep" />
      </div>
      <button
        type="button"
        onClick={claimByEmail}
        className="btn btn-ghost w-full"
        disabled={busy}
      >
        {busy ? "Checking…" : "I was invited by email"}
      </button>
      <form action="/auth/signout" method="post">
        <button type="submit" className="btn btn-ghost w-full">
          Sign out
        </button>
      </form>
    </div>
  );
}
