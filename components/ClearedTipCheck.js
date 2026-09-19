"use client";

import { useRef, useState } from "react";
import { CHECK_LABELS } from "@/lib/tips/archiveSearch";

export default function ClearedTipCheck({ tip }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const working = useRef(false);
  async function check(event) {
    event.preventDefault();
    if (working.current) return;
    working.current = true;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/tips/cleared/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tip.id, question: question.trim() }),
        signal: AbortSignal.timeout(105000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The check did not finish. Please try again.");
      setResult(data);
    } catch (failure) {
      setError(failure.name === "TimeoutError" ? "The check timed out. The original tip is not verified. Please try again." : failure.message);
    } finally { working.current = false; setBusy(false); }
  }
  return <div className="mt-3">
    <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      Is this still true?
    </button>
    {open && <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-4">
      <p className="text-sm text-ink-soft">Ask Aly to check current sources. The original tip stays cleared and unchanged.</p>
      <form className="mt-3" onSubmit={check}>
        <label className="block text-sm font-semibold">
          Anything else to consider? <span className="font-normal text-ink-soft">(optional)</span>
          <input className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-3 font-normal"
            maxLength={500} value={question} disabled={busy} onChange={event => setQuestion(event.target.value)}
            placeholder="For example, would this apply next summer?" />
        </label>
        <button className="btn btn-primary mt-3" disabled={busy}>{busy ? "Checking current sources…" : result ? "Check again" : "Ask Aly to check"}</button>
      </form>
      {busy && <p role="status" className="mt-3 text-sm text-ink-soft">Reading current information and comparing it with the original advice. This can take up to a minute or two.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose">{error}</p>}
      {result && <section aria-label="Current advice check" aria-live="polite" className="mt-4 border-t border-[var(--line)] pt-4">
        <h4 className="font-semibold">{CHECK_LABELS[result.verdict] || CHECK_LABELS.uncertain}</h4>
        <p className="mt-1 text-xs text-ink-soft">Checked {new Date(result.checkedAt).toLocaleString()}</p>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</p>
        {!!result.sources?.length && <ul className="mt-3 space-y-2 text-sm">{result.sources.map(source =>
          <li key={source.url}><a className="break-words text-teal underline" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul>}
        <p className="mt-3 text-xs text-ink-soft">This check did not restore the tip or change any trip plans.</p>
      </section>}
    </div>}
  </div>;
}
