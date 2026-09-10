"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GoogleButton from "@/components/GoogleButton";

/** The first hop after a password sign-in: see app/auth/land/route.js. */
function landing(next) {
  return `/auth/land?next=${encodeURIComponent(next)}`;
}

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
  const [error, setError] = useState(params.get("error") || "");
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
        // Same email-to-person link the Google callback does, for the password
        // route in.
        await supabase.rpc("claim_traveler_seat");
        // Through /auth/land rather than straight to the page, because whether
        // this person has met Aly yet can only be answered on the server. Going
        // direct is what dropped a brand-new household on an empty Trips page.
        router.replace(landing(next));
        router.refresh();
        return;
      }

      // The code field lives above both buttons rather than inside this form,
      // so the browser will not enforce it for us. An account made without a
      // code has no family and nowhere to land, which is worth stopping here.
      if (!inviteCode.trim()) {
        setError("Enter the code you were sent to start a new family.");
        setBusy(false);
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
        router.replace(landing(next));
        router.refresh();
      } else {
        setNotice(
          "Account created. Check your email for the confirmation link, then sign in.",
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
      {error && (
        <p className="mb-4 rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-lg bg-teal-soft px-3 py-2 text-sm text-teal">
          {notice}
        </p>
      )}

      <div className="mb-4 flex rounded-xl bg-sand p-1 text-sm font-semibold">
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
          Start a new family
        </button>
      </div>

      {/* The code sits above both ways in, not inside the email form, because
          it is the thing that decides which family the account lands in --
          whichever button they end up pressing. Google sign-in has no metadata
          hook, so GoogleButton carries this on the callback URL and the
          callback spends it there. */}
      {mode === "signup" && (
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Signup or invite code
          </span>
          <input
            className="field font-mono uppercase"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="ALY-XXXX-XXXX"
          />
          <span className="mt-1 block text-xs text-ink-soft">
            A signup code opens a new family. A family invite code joins one
            that already exists.
          </span>
        </label>
      )}

      <GoogleButton
        next={next}
        signupCode={mode === "signup" ? inviteCode : ""}
        disabled={mode === "signup" && !inviteCode.trim()}
        onError={setError}
      />
      <p className="mt-2 text-center text-xs text-ink-soft">
        {mode === "signup" && !inviteCode.trim()
          ? "Enter your code above to start a new family this way."
          : "Fastest way in — no password to remember."}
      </p>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-sand-deep" />
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          or use email
        </span>
        <span className="h-px flex-1 bg-sand-deep" />
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
              placeholder="Alex Rivera"
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
            autoComplete={
              mode === "signin" ? "current-password" : "new-password"
            }
          />
        </label>

        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
