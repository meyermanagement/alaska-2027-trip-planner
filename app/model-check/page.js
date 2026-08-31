"use client";

// A page rather than raw JSON, because a browser given a slow API route just
// looks broken. This says what it is doing while it does it, then puts the
// verdict in plain English above the evidence.

import { useState } from "react";
import Link from "next/link";

function Line({ label, value }) {
  return (
    // Label beside the value where there is room, above it where there is not.
    // At 320px a fixed 160px label column left about a hundred pixels for the
    // value, and "(TimeoutError)" came out as "(Timeou tError)".
    <div className="flex flex-col gap-0.5 border-b border-sand-deep/40 py-2 text-sm last:border-0 sm:flex-row sm:gap-3">
      <span className="text-ink-soft sm:w-40 sm:shrink-0">{label}</span>
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

// One model's verdict. Green when it answered, amber when it is out of quota for
// now, rose when it is not answering at all -- because "come back tomorrow" and
// "take it out of the ladder" are different instructions.
function ModelRow({ r, onPatient, patient, busy }) {
  const quota = r.status === 429;
  const tone = r.ok
    ? "border-teal/40 bg-teal/5"
    : quota
      ? "border-amber/40 bg-amber/5"
      : "border-rose/30 bg-rose/5";
  const verdict = r.skipped
    ? r.skipped
    : r.ok
      ? `Answered in ${r.ms} ms${r.called?.length ? ` by calling ${r.called.join(", ")}` : r.said ? `: “${r.said}”` : ""}`
      : quota
        ? `Out of allowance${r.quotaMetric ? ` (${r.quotaMetric})` : ""}${
            r.retryMs ? `, asks for ${Math.round(r.retryMs / 1000)}s` : ""
          } — this one comes back on its own`
        : `Failed (${r.status ?? "—"}) after ${r.ms ?? 0} ms`;
  return (
    <div className={`mt-2 rounded-lg border p-3 ${tone}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium text-ink">{r.model}</span>
        <span className="text-xs text-ink-faint">
          {r.inLadder ? "in the ladder" : "not in the ladder"}
        </span>
      </div>
      {/* The allowance Google names is one unbroken 68-character word, and on a
          320px phone it carried the card off the side of the screen. */}
      <p className="mt-1 break-words text-sm text-ink-soft">{verdict}</p>
      {r.message ? (
        <p className="mt-1 break-words text-xs text-ink-faint">{r.message}</p>
      ) : null}

      {/* A 504 here is this page's own fourteen-second cap running out, not
          Google's answer. Saying so, and offering to wait properly, is the
          difference between "this model is dead" and "this model is slow" -- and
          gemini-3.7-flash was shelved on that exact confusion. */}
      {r.status === 504 && !r.skipped ? (
        <>
          <p className="mt-2 text-xs text-ink-soft">
            That is this page giving up, not Google refusing. All it proves is
            that this model takes longer than the roll call allows.
          </p>
          <button
            onClick={() => onPatient(r.model)}
            disabled={busy}
            className="mt-2 rounded-lg border border-ink-soft/30 px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
          >
            {busy ? "Waiting…" : "Ask it again, and wait 90 seconds"}
          </button>
        </>
      ) : null}

      {patient ? (
        <div className="mt-3 rounded-lg border border-sand-deep bg-white p-3">
          <Line label="Given" value={`${patient.gaveItMs} ms`} />
          <Line label="Answered" value={patient.ok ? "Yes" : "No"} />
          <Line label="Took" value={`${patient.ms} ms`} />
          {patient.said ? (
            <Line label="Said" value={`“${patient.said}”`} />
          ) : null}
          {patient.called?.length ? (
            <Line label="Called" value={patient.called.join(", ")} />
          ) : null}
          {patient.message ? (
            <Line label="What came back" value={patient.message} />
          ) : null}
          {patient.tooSlowForChat ? (
            <p className="mt-2 text-xs text-ink">
              It answers, but not fast enough to be any use in the chat panel: a
              searching turn there is allowed 62 seconds and a plain one 40, so
              this model would answer this page and time out the family. Leave
              it out of the ladder.
            </p>
          ) : patient.ok ? (
            <p className="mt-2 text-xs text-ink">
              It answers, and quickly enough for the chat panel. It can go back
              into the ladder — set GEMINI_MODELS in Vercel to the models you
              want, in order, with this one where you want it.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ModelCheckPage() {
  const [state, setState] = useState("idle");
  const [out, setOut] = useState(null);
  const [error, setError] = useState("");
  // Keyed by model name, so asking about one does not clear the roll call.
  const [patient, setPatient] = useState({});
  const [waitingOn, setWaitingOn] = useState("");

  async function askPatiently(model) {
    setWaitingOn(model);
    try {
      const res = await fetch(
        `/api/model-check?model=${encodeURIComponent(model)}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      setPatient((was) => ({
        ...was,
        [model]: json?.one || {
          ok: false,
          ms: 0,
          gaveItMs: 0,
          message:
            json?.error ||
            `The check itself failed (${res.status}). If that is a timeout, this model is slower than the page can wait.`,
        },
      }));
    } catch (err) {
      setPatient((was) => ({
        ...was,
        [model]: {
          ok: false,
          ms: 0,
          gaveItMs: 0,
          message: err?.message || "The check could not be reached.",
        },
      }));
    }
    setWaitingOn("");
  }

  async function run() {
    setState("running");
    setError("");
    setOut(null);
    setPatient({});
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
        attached, one without — then asks every model in the ladder, and the
        shelved ones, the same small question by name. It uses the key this
        deployment actually has and shows you what came back, verbatim. It takes
        up to a minute and a half.
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
                label="Search allowed"
                value={grounded?.searchAvailable ? "Yes" : "No — refused"}
              />
              <Line
                label="Searches Google ran"
                value={
                  grounded?.queries?.length
                    ? grounded.queries.join("; ")
                    : "None — the model did not reach for it this time"
                }
              />
              {grounded?.choseTheFunction?.length ? (
                <Line
                  label="Called instead"
                  value={`${grounded.choseTheFunction.join(", ")} — the test function, so there is no sentence to show`}
                />
              ) : null}
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

          {out.rollCall?.length ? (
            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
                Each model, asked by name
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                One small question each, with a function declaration attached so
                it is the same shape a real request has. The ones marked “not in
                the ladder” are shelved names being re-checked — if one of them
                answers, it can go back in.
              </p>
              {out.rollCall.map((r, i) => (
                <ModelRow
                  key={i}
                  r={r}
                  onPatient={askPatiently}
                  patient={patient[r.model]}
                  busy={waitingOn === r.model}
                />
              ))}
            </section>
          ) : null}

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
