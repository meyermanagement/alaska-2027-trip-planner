"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ParentWait({ unavailable = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setBusy(true); setError("");
    try {
      const { error: problem } = await createClient().auth.signOut();
      if (problem) throw problem;
      window.location.assign("/login");
    } catch { setError("Sign-out did not finish. Please try again."); setBusy(false); }
  }
  return <section className="card mt-7 p-6">
    <p className="text-sm font-semibold text-teal">Parent-managed access</p>
    <h1 className="mt-3 text-2xl font-semibold">{unavailable ? "We couldn’t check your account" : "A parent needs to set this up"}</h1>
    <p className="mt-3 text-sm text-ink-soft">{unavailable
      ? "Please try again later. Nothing was accepted or sent to Aly."
      : "Ask your parent or legal guardian to open Family & pets, then Child access, from their own account."}</p>
    <p className="mt-3 text-sm text-ink-soft">Ask Aly is off while parent verification and child access are being prepared. You do not need to accept the adult agreement, and reloading will not turn chat on.</p>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    <button className="btn btn-secondary mt-5" disabled={busy} onClick={signOut}>{busy ? "Signing out…" : "Sign out"}</button>
  </section>;
}
