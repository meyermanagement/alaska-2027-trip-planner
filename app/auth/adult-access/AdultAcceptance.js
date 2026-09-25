"use client";
import { useEffect, useRef, useState } from "react";
import { AGREEMENT_VERSION, PRIVACY_VERSION, OPTIONAL_FEATURES, AI_PROVIDER, AI_DISCLOSURE } from "@/lib/beta/agreement";
import { leakedPasswordCount, leakedPasswordMessage } from "@/lib/auth/pwned";

export default function AdultAcceptance() {
  const token = useRef("");
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [answers, setAnswers] = useState({ email: "", password: "", features: {} });
  const set = (key, value) => setAnswers(a => ({ ...a, [key]: value }));
  useEffect(() => {
    // Fragment never reaches hosting logs, referrers or server-rendered HTML.
    if (!token.current) token.current = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    let live = true;
    fetch("/auth/adult-access/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.current }) })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "This invitation is unavailable.");
        if (live) setInvite(result);
      }).catch(e => { if (live) setError(e.message); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, []);
  async function accept(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (invite.needsPassword) {
        const leaked = await leakedPasswordCount(answers.password);
        if (leaked) throw new Error(leakedPasswordMessage(leaked));
      }
      const response = await fetch("/auth/adult-access/complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...answers, token: token.current, agreementVersion: AGREEMENT_VERSION, privacyVersion: PRIVACY_VERSION }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Access could not be activated.");
      token.current = ""; setAnswers({ email: "", password: "", features: {} }); setDone(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function check(key, label) {
    return <label className="flex items-start gap-3 py-2 text-sm" key={key}>
      <input className="mt-1 shrink-0" type="checkbox" checked={answers[key] === true} onChange={e => set(key, e.target.checked)} required disabled={busy} />
      <span>{label}</span>
    </label>;
  }
  return <main className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
    <p className="section-label">Alyeska · Adult traveler access</p>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight">{done ? "Your own access is ready" : "Your account. Your choices."}</h1>
    {done ? <section className="mt-6 card p-6"><p>Your agreement and choices are saved. Sign in with the invited email using your password or Google. Your saved profile, theme, trips and packing lists are still yours.</p><a className="btn btn-primary mt-5" href="/login">Continue to sign in</a></section>
      : !invite ? <p role="status" className="mt-6 text-ink-soft">{busy ? "Checking your invitation…" : error}</p>
        : <form onSubmit={accept} className="mt-6 space-y-6">
          <section className="rounded-2xl border border-line bg-white/50 p-5">
            <h2 className="text-xl font-semibold">An invitation for {invite.name}</h2>
            <p className="mt-2 text-sm text-ink-soft">Sent to <strong className="break-all">{invite.email}</strong>. You must be 18 or older and accept for yourself. Nothing is activated until you finish.</p>
            <p className="mt-2 text-sm text-ink-soft">You’ll be a secondary traveler: assigned trips only, never drafts. Your existing profile, theme and packing lists are kept.</p>
            <p className="mt-2 text-sm text-ink-soft">Expires {new Date(invite.expires_at).toLocaleString()}.</p>
          </section>
          <fieldset disabled={busy} className="space-y-4">
            <legend className="mb-3 text-lg font-semibold">Confirm this is your invitation</legend>
            <label className="block text-sm font-semibold">Your email
              <input type="email" className="field mt-1 text-base" autoComplete="email" required value={answers.email} onChange={e => set("email", e.target.value)} /></label>
            {invite.needsPassword && <label className="block text-sm font-semibold">Choose your password
              <input type="password" className="field mt-1 text-base" autoComplete="new-password" required minLength={12} maxLength={128} value={answers.password} onChange={e => set("password", e.target.value)} />
              <span className="mt-1 block font-normal text-ink-soft">At least 12 characters. Don’t reuse a password from another account.</span>
            </label>}
          </fieldset>
          <section>
            <h2 className="text-lg font-semibold">Read and accept for yourself</h2>
            <p className="mt-2 text-sm"><a href="/beta-terms" target="_blank" rel="noreferrer" className="underline">Read the beta agreement</a>{" · "}<a href="/privacy" target="_blank" rel="noreferrer" className="underline">Read the privacy notice</a></p>
            {check("agreed", "I have read and agree to the current beta agreement.")}
            {check("ageConfirmed", "I am 18 or older and I am accepting for myself.")}
            {check("dataAcknowledged", "I have read the privacy notice and understand how my information is used.")}
            {check("sharingAcknowledged", "I understand that my shared travel information is visible to authorized members of this household.")}
          </section>
          <details className="rounded-xl border border-line p-4">
            <summary className="cursor-pointer font-semibold">Optional choices · all off to start</summary>
            <p className="mt-3 text-sm text-ink-soft">You can use your trip view without these. These choices do not grant household-manager permissions, and you can change them later in Settings.</p>
            <label className="mt-3 flex gap-3 text-sm"><input type="checkbox" checked={answers.aiProcessing === true} disabled={busy} onChange={e => set("aiProcessing", e.target.checked)} /><span>Allow Alyeska to send relevant travel information to the {AI_PROVIDER}.</span></label>
            <ul className="my-3 list-disc pl-5 text-xs text-ink-soft">{AI_DISCLOSURE.sent.map(item => <li key={item}>{item}</li>)}</ul>
            <p className="text-xs font-semibold">What is not sent</p>
            <ul className="my-3 list-disc pl-5 text-xs text-ink-soft">{AI_DISCLOSURE.notSent.map(item => <li key={item}>{item}</li>)}</ul>
            <ul className="my-3 list-disc pl-5 text-xs text-ink-soft">{AI_DISCLOSURE.terms.map(item => <li key={item}>{item}</li>)}</ul>
            <p className="mb-3 text-xs text-ink-soft">{AI_DISCLOSURE.aside}</p>
            {OPTIONAL_FEATURES.map(feature => <label key={feature.id} className="flex items-start gap-3 py-2 text-sm">
              <input className="mt-1" type="checkbox" disabled={busy} checked={answers.features[feature.id] === true} onChange={e => set("features", { ...answers.features, [feature.id]: e.target.checked })} />
              <span><span className="font-semibold">{feature.title}</span><span className="block text-ink-soft">{feature.detail}</span></span>
            </label>)}
            <label className="flex items-start gap-3 py-2 text-sm"><input className="mt-1" type="checkbox" disabled={busy} checked={answers.diagnostics === true} onChange={e => set("diagnostics", e.target.checked)} /><span>Share crash and performance diagnostics.</span></label>
          </details>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Saving your choices…" : "Accept and activate my access"}</button>
          <p className="text-xs text-ink-soft">Not ready? Close this page. Your parent cannot accept these choices for you.</p>
        </form>}
  </main>;
}
