"use client";

import { useState } from "react";
import {
  AI_PROVIDER,
  OPTIONAL_FEATURES,
  PRIVACY_URL,
  TERMS_URL,
} from "@/lib/beta/agreement";

/**
 * The other half of the consent screens: the part that lets an answer be taken
 * back.
 *
 * A gate that collects permission and gives no way to withdraw it is not
 * consent, it is a toll -- and both stores ask for the way back as plainly as
 * they ask for the disclosure. So every answer the screens collected appears
 * here, in the same words, with the same effect: turning Aly off stops text
 * leaving the app the moment it is saved, because lib/agent/llm.js reads the same
 * row before every call rather than trusting a flag it was handed.
 *
 * Withdrawing consent entirely is last and behind a confirmation. It does not
 * delete anything -- that is account deletion, which is its own control -- it
 * puts the person back outside the gate, which is a thing they should be able to
 * do without also losing their trips.
 */
export default function BetaConsentControls({ consent }) {
  const [ai, setAi] = useState(Boolean(consent?.ai_processing));
  const [diagnostics, setDiagnostics] = useState(
    consent?.diagnostics !== false,
  );
  const [features, setFeatures] = useState(consent?.features || {});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function change(patch, revert) {
    setBusy(true);
    setFailed("");
    try {
      const res = await fetch("/api/beta/consent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Could not save that.");
      }
      // The route's own word rather than the status code. An expired session gets
      // a redirect to the login page from middleware, and that is a 200 -- so a
      // switch would have appeared to have moved while the row behind it did not.
      if (body?.ok !== true) {
        throw new Error("Your session ended. Sign in again to change this.");
      }
    } catch (err) {
      revert?.();
      setFailed(
        err?.message === "Failed to fetch"
          ? "No connection. Nothing changed."
          : err?.message || "Could not save that.",
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleAi(next) {
    const was = ai;
    setAi(next);
    change({ aiProcessing: next }, () => setAi(was));
  }

  function toggleDiagnostics(next) {
    const was = diagnostics;
    setDiagnostics(next);
    change({ diagnostics: next }, () => setDiagnostics(was));
  }

  function toggleFeature(id, next) {
    const was = features;
    const now = { ...features, [id]: next };
    setFeatures(now);
    change({ features: { [id]: next } }, () => setFeatures(was));
  }

  async function withdraw() {
    await change({ withdraw: true });
    // Straight out through the gate, which is now closed again for this account.
    window.location.assign("/welcome/beta");
  }

  return (
    <section>
      <h2 className="font-display text-xl font-semibold">
        Beta consent and privacy
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Everything you agreed to on the way in, and the way back out.
      </p>

      <div className="mt-4 space-y-3">
        <Row
          checked={ai}
          onChange={toggleAi}
          disabled={busy}
          label="Let Aly answer questions"
          note={
            ai
              ? `Your questions and the trip context may be sent to ${AI_PROVIDER}. Turn this off and nothing is sent to an AI provider.`
              : `Off. Nothing is sent to ${AI_PROVIDER}. Trips, packing, documents, and reminders all still work.`
          }
        />
        <Row
          checked={diagnostics}
          onChange={toggleDiagnostics}
          disabled={busy}
          label="Send crash reports and timings"
          note="Kept 90 days, then deleted."
        />
      </div>

      <h3 className="mt-6 text-sm font-semibold text-ink">Optional parts</h3>
      <div className="mt-2 space-y-3">
        {OPTIONAL_FEATURES.map((f) => (
          <Row
            key={f.id}
            checked={Boolean(features[f.id])}
            onChange={(v) => toggleFeature(f.id, v)}
            disabled={busy}
            label={f.title}
            note={`Left off: ${f.without}`}
          />
        ))}
      </div>

      <dl className="mt-6 space-y-2 text-sm">
        <Fact
          term="Agreed"
          detail={
            consent?.accepted_at
              ? new Date(consent.accepted_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "\u2014"
          }
        />
        <Fact
          term="Agreement"
          detail={`Version ${consent?.agreement_version || "\u2014"}`}
        />
        <Fact term="Build" detail={consent?.app_build || "\u2014"} />
      </dl>

      <p className="mt-3 text-sm text-ink-soft">
        <a
          className="underline"
          href={TERMS_URL}
          target="_blank"
          rel="noreferrer"
        >
          Beta agreement
        </a>
        {" \u00b7 "}
        <a
          className="underline"
          href={PRIVACY_URL}
          target="_blank"
          rel="noreferrer"
        >
          Privacy policy
        </a>
      </p>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-rose">
          {failed}
        </p>
      )}

      <div className="no-print mt-5">
        {confirming ? (
          <div className="card px-4 py-3">
            <p className="text-sm text-ink">
              Withdrawing puts you back outside the beta agreement and turns Aly
              off. Your trips and documents stay where they are. You can agree
              again at any time.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                className="btn btn-ghost text-sm"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Keep it
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                onClick={withdraw}
                disabled={busy}
              >
                Withdraw consent
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => setConfirming(true)}
          >
            Withdraw consent
          </button>
        )}
      </div>
    </section>
  );
}

function Row({ checked, onChange, label, note, disabled }) {
  return (
    <label
      className={`flex items-start gap-3 text-sm ${disabled ? "opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-teal)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="text-ink">{label}</span>
        {note && (
          <span className="mt-1 block text-xs text-ink-soft">{note}</span>
        )}
      </span>
    </label>
  );
}

function Fact({ term, detail }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {term}
      </dt>
      <dd className="min-w-0 flex-1">{detail}</dd>
    </div>
  );
}
