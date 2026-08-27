"use client";

// A page rather than raw JSON, because a browser given a slow API route just
// looks broken. This says what it is doing while it does it, then puts the
// verdict in plain English above the evidence.

import { useState } from "react";
import Link from "next/link";

function Line({ label, value }) {
  return (
    <div className="flex gap-3 border-b border-sand-deep/40 py-2 text-sm last:border-0">
      <span className="w-40 shrink-0 text-ink-soft">{label}</span>
      <span className="min-w-0 break-words text-ink">{value}</span>
    </div>
  );
}

function Refusal({ r }) {
  return (
    <div className="mt-3 rounded-lg border border-rose/30 bg-rose/5 p-3">
      <Line label="Model" value={r.model || "—"} />
      <Line label="Status" value={r.status ?? "—"} />
      <Line label="Search attached" value={r.grounded ? "Yes" : "No"} />
      <Line
        label="Allowance named"
        value={r.quotaId || "None — this is the telling part"}
      />
      <Line label="Limit" value={r.quotaValue ?? "—"} />
      <Line
        label="Wait requested"
        value={r.retryMs ? `${r.retryMs} ms` : "None"}
      />
      <Line label="A search allowance" value={r.searchQuota ? "Yes" : "No"} />
      <Line label="Google's words" value={r.google || "—"} />
    </div>
  );
}

export default function ModelCheckPage() {
  const [state, setState] = useState("idle");
  const [out, setOut] = useState(null);
  const [error, setError] = useState("");

  async function run() {
    setState("running");
    setError("");
    setOut(null);
    try {
      const res = await fetch("/api/model-check", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        setError(
          json?.error ||
            `The check itself failed (${res.status}). If that is a timeout, the request never reached Google.`,
        );
        setState("done");
        return;
      }
      setOut(json);
      setState("done");
    } catch (err) {
      setError(err?.message || "The check could not be reached.");
      setState("done");
    }
  }

  const grounded = out?.withSearch;
  const plain = out?.withoutSearch;

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-semibold text-ink">
        Can Aly search the web?
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        This asks Google two of the smallest questions it can — one with search
        attached, one without — using the key this deployment actually has, and
        shows you what came back. It takes up to half a minute.
      </p>

      <button
        onClick={run}
        disabled={state === "running"}
        className="mt-5 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {state === "running" ? "Asking Google…" : "Run the check"}
      </button>

      {error ? (
        <p className="mt-5 rounded-lg border border-rose/30 bg-rose/5 p-3 text-sm text-ink">
          {error}
        </p>
      ) : null}

      {out ? (
        <>
          <p className="mt-6 rounded-lg border border-sand-deep bg-sand p-3 text-base font-medium text-ink">
            {out.verdict}
          </p>
          {out.because ? (
            <p className="mt-2 rounded-lg border border-amber/40 bg-amber/5 p-3 text-sm text-ink">
              {out.because}
            </p>
          ) : null}

          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
              With search attached
            </h2>
            <div className="mt-2 rounded-lg border border-sand-deep bg-white p-3">
              <Line label="Answered" value={grounded?.worked ? "Yes" : "No"} />
              <Line
                label="Actually searched"
                value={grounded?.searched ? "Yes" : "No"}
              />
              <Line label="Model" value={grounded?.model || "—"} />
              <Line
                label="Sources"
                value={
                  grounded?.sources?.length
                    ? grounded.sources.join(", ")
                    : "None"
                }
              />
              <Line
                label="Took"
                value={grounded?.tookMs ? `${grounded.tookMs} ms` : "—"}
              />
              {grounded?.shown ? (
                <Line label="Shown to the family" value={grounded.shown} />
              ) : null}
            </div>
            {(grounded?.refusals || []).map((r, i) => (
              <Refusal key={i} r={r} />
            ))}
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
              Without search
            </h2>
            <div className="mt-2 rounded-lg border border-sand-deep bg-white p-3">
              <Line label="Answered" value={plain?.worked ? "Yes" : "No"} />
              <Line label="Model" value={plain?.model || "—"} />
              <Line
                label="Took"
                value={plain?.tookMs ? `${plain.tookMs} ms` : "—"}
              />
              {plain?.shown ? (
                <Line label="Shown to the family" value={plain.shown} />
              ) : null}
            </div>
            {(plain?.refusals || []).map((r, i) => (
              <Refusal key={i} r={r} />
            ))}
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
              This deployment
            </h2>
            <div className="mt-2 rounded-lg border border-sand-deep bg-white p-3">
              <Line
                label="Key set"
                value={out.keySet ? "Yes" : "No — that would explain it"}
              />
              <Line
                label="Vendors, in order"
                value={(out.providers || []).join(", ") || "—"}
              />
              <Line
                label="Models tried"
                value={(out.models || []).join(", ") || "—"}
              />
              <Line label="Checked at" value={out.checkedAt} />
            </div>
          </section>
        </>
      ) : null}

      <Link
        href="/trips"
        className="mt-8 inline-block text-sm text-teal underline"
      >
        Back to trips
      </Link>
    </main>
  );
}
