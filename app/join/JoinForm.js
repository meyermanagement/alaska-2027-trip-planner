"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      <form action="/auth/signout" method="post">
        <button type="submit" className="btn btn-ghost w-full">
          Sign out
        </button>
      </form>
    </div>
  );
}
