"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/trips";

  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.replace(next);
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            display_name: fullName.trim().split(" ")[0],
            invite_code: inviteCode.trim().toUpperCase(),
          },
        },
      });
      if (error) throw error;

      if (data.session) {
        router.replace(next);
        router.refresh();
      } else {
        setNotice(
          "Account created. Check your email for the confirmation link, then sign in."
        );
        setMode("signin");
      }
    } catch (err) {
      setError(err?.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-5 flex rounded-xl bg-sand p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError("");
          }}
          className={`flex-1 rounded-lg py-2 transition ${
            mode === "signin" ? "bg-white text-teal shadow-sm" : "text-ink-soft"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError("");
          }}
          className={`flex-1 rounded-lg py-2 transition ${
            mode === "signup" ? "bg-white text-teal shadow-sm" : "text-ink-soft"
          }`}
        >
          Join the family
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        {mode === "signup" && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Your name
            </span>
            <input
              className="field"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Mark Meyer"
              required
              autoComplete="name"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Email
          </span>
          <input
            className="field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Password
          </span>
          <input
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </label>

        {mode === "signup" && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Family invite code
            </span>
            <input
              className="field font-mono uppercase"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="MEYER2027"
              required
            />
            <span className="mt-1 block text-xs text-ink-soft">
              This links your account to the family&apos;s shared trips.
            </span>
          </label>
        )}

        {error && (
          <p className="rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg bg-teal-soft px-3 py-2 text-sm text-teal">
            {notice}
          </p>
        )}

        <button className="btn btn-primary w-full" disabled={busy}>
          {busy
            ? "Working…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}
