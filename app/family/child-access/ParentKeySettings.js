"use client";
import { useEffect, useRef, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { createClient } from "@/lib/supabase/client";

async function request(body) {
  const response = await fetch("/api/family/parent-keys", body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" }
    : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Parent access could not be updated.");
    error.needsSignIn = result.needsSignIn;
    throw error;
  }
  return result;
}
export default function ParentKeySettings({ onRecovered = () => {} }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [savedCode, setSavedCode] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const locked = useRef(false);
  async function load() {
    setLoading(true);
    try { setData(await request()); setError(""); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  // Never persist recovery secrets to storage, URLs, analytics, or a download.
  useEffect(() => {
    const clear = () => { setSavedCode(""); setCode(""); };
    window.addEventListener("pagehide", clear);
    return () => window.removeEventListener("pagehide", clear);
  }, []);
  async function act(kind, target = null) {
    if (locked.current) return;
    if (kind === "remove" && !window.confirm("Remove this parent passkey? You must verify a different registered passkey first.")) return;
    if (kind === "recovery-code" && data.recoveryReady && !window.confirm("Replace your saved recovery code? The old code will stop working immediately.")) return;
    locked.current = true; setBusy(kind); setError(""); setMessage(""); setSavedCode(""); setNeedsSignIn(false);
    try {
      let result;
      if (kind === "recover") {
        result = await request({ action: "recover", code });
        setCode("");
      } else {
        const { options } = await request({ action: "auth-options", kind, target });
        const response = await startAuthentication({ optionsJSON: options });
        result = await request({ action: "auth-verify", kind, target, response });
      }
      if (result.options) {
        const response = await startRegistration({ optionsJSON: result.options });
        result = await request({ action: "register-verify", response, label });
      }
      if (result.keys) setData(result);
      setSavedCode(result.recoveryCode || ""); setLabel("");
      setMessage(`${kind === "recover" ? "Recovery complete. Old passkeys are removed, child views are closed, and child-view setup is required again." :
        kind === "add" ? "Backup passkey saved." : kind === "remove" ? "Passkey removed." : "Recovery code ready. Save it privately now."}${
        result.notificationPending ? " Your security email is queued for retry." : " A security email was queued to your account address."}${
        result.refreshNeeded ? " Your change was saved, but the list could not reload. Save any recovery code below, then reload this page." : ""}`);
      if (kind === "recover") onRecovered();
    } catch (err) {
      setCode("");
      setNeedsSignIn(Boolean(err.needsSignIn));
      setError(err.name === "NotAllowedError"
        ? "Passkey verification was canceled. No keys were changed. Try again when ready." : err.message);
    } finally { locked.current = false; setBusy(""); }
  }
  async function signInAgain() {
    if (locked.current) return;
    locked.current = true; setBusy("signin"); setError("");
    try {
      const { error: signOutError } = await createClient().auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      window.location.assign("/login?next=%2Ffamily%2Fchild-access");
    } catch { setError("Could not sign out. Please try again."); setBusy(""); locked.current = false; }
  }
  return <section className="card p-5" aria-labelledby="parent-keys-heading" aria-busy={!!busy}>
    <h2 id="parent-keys-heading" className="text-lg font-semibold">Parent passkeys &amp; recovery</h2>
    <p className="mt-2 text-sm text-ink-soft">Keep a backup on another parent-only device or security key. Save a recovery code before you need it.</p>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-teal">{message}</p>}
    {!data ? loading ? <p className="mt-3 text-sm" role="status">Loading parent passkeys…</p> :
      <button className="btn btn-ghost mt-3" onClick={load}>Try loading parent passkeys again</button> : <>
      <fieldset disabled={!!busy || !!savedCode} className="mt-4 space-y-4">
        <legend className="sr-only">Manage your parent passkeys</legend>
        <ul className="space-y-2">{data.keys.map(key => <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
          <div className="min-w-0"><p className="break-words text-sm font-semibold">{key.label}</p>
            <p className="text-xs text-ink-soft">Added {new Date(key.createdAt).toLocaleDateString("en-US")}</p></div>
          <button className="btn btn-ghost" disabled={data.keys.length < 2} onClick={() => act("remove", key.id)}
            aria-label={`Remove ${key.label}`}>{busy === "remove" ? "Verifying…" : "Remove"}</button>
        </li>)}</ul>
        <label className="block text-sm">New passkey name
          <input className="field mt-2 w-full" value={label} maxLength={60} placeholder="My phone or backup security key"
            onChange={e => setLabel(e.target.value)} autoComplete="off" /></label>
        <button className="btn btn-ghost" disabled={data.keys.length >= 5 || !label.trim()} onClick={() => act("add")}>
          {busy === "add" ? "Verifying and saving…" : "Add backup passkey"}</button>
        <div className="border-t border-line pt-4">
          <p className="text-sm font-semibold">{data.recoveryReady ? "Recovery code is set up" : "No recovery code yet"}</p>
          <p className="mt-1 text-sm text-ink-soft">Keep it in your password manager or a private place, not on the child’s device. We cannot show it again.</p>
          <button className="btn btn-ghost mt-3" onClick={() => act("recovery-code")}>
            {busy === "recovery-code" ? "Verifying…" : data.recoveryReady ? "Replace recovery code" : "Create recovery code"}</button>
        </div>
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer py-2 font-semibold text-sm">Lost access to every passkey?</summary>
          <p className="mt-2 text-sm text-ink-soft">Use your own browser or browser profile, not the child’s locked view. Sign in again, enter your saved recovery code, then register a replacement passkey within five minutes.</p>
          <p className="mt-2 text-sm text-ink-soft">This removes all old parent passkeys, closes your open child views, and requires child-view setup again. Trips, packing and themes stay saved.</p>
          <button className="btn btn-ghost mt-3" onClick={signInAgain}>
            {busy === "signin" ? "Signing out…" : "Sign in again for recovery"}</button>
          {needsSignIn && <p className="mt-2 text-sm" role="status">A fresh sign-in is required before continuing.</p>}
          <label className="mt-4 block text-sm">Saved recovery code
            <input type="password" className="field mt-2 w-full" value={code} onChange={e => setCode(e.target.value)}
              autoComplete="off" spellCheck={false} maxLength={80} data-private="true" /></label>
          <p className="mt-2 text-xs text-ink-soft">The new passkey uses the name entered above.</p>
          <button className="btn btn-primary mt-3" disabled={!code.trim() || !label.trim()}
            onClick={() => act("recover")}>{busy === "recover" ? "Recovering parent access…" : "Verify code & replace passkeys"}</button>
          <p className="mt-3 text-sm text-ink-soft">No passkey or saved recovery code? Contact admin@alyeska.app for help and identity review. Signing in alone cannot reset this protection. Never email your code.</p>
        </details>
      </fieldset>
      {savedCode && <div className="mt-4 rounded-xl border-2 border-teal p-4" data-private="true">
        <h3 className="font-semibold">Save your recovery code</h3>
        <p className="mt-2 text-sm">This is the only time it will be shown. Anyone with this code and access to your adult sign-in can replace your parent passkeys.</p>
        <code className="mt-3 block select-all break-all rounded-lg bg-paper p-3 text-sm">{savedCode}</code>
        <button className="btn btn-primary mt-4" onClick={() => { setSavedCode(""); setMessage("Recovery code hidden. Keep your private copy safe."); }}>
          I saved it privately</button>
      </div>}
    </>}
  </section>;
}
