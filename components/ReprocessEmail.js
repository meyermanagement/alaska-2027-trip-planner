"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/LinkPending";

export function InboxReprocessHelp() {
  return (
    <div className="mt-4 rounded-xl border border-[var(--line)] bg-sand p-4 text-sm text-ink-soft">
      <p><strong className="text-ink">Missing or incorrect booking, insurance or fare details?</strong>{" "}
        Choose <strong>Reprocess email</strong>, tell Aly what was missed, then review the new reading before saving.</p>
      <p className="mt-1">Already filed it? Open <strong>Messages that have left the inbox</strong> below.
        Reprocessing leaves your saved details unchanged until you approve an update.</p>
    </div>
  );
}

const labels = {
  title: "Booking", category: "Type", item_date: "Date", end_date: "End date", start_time: "Time",
  location: "Location", confirmation_number: "Confirmation", provider: "Insurer", plan_name: "Plan",
  policy_number: "Policy number", coverage_start: "Coverage starts", coverage_end: "Coverage ends",
  emergency_phone: "Emergency phone", claims_phone: "Claims phone", claims_url: "Claims website",
  covers: "Coverage", premium: "Premium", deductible: "Deductible", medical_limit: "Medical limit",
  evacuation_limit: "Evacuation limit",
};
const shown = value => Array.isArray(value) ? value.join(", ") : String(value);

export default function ReprocessEmail({ messageId, disabled = false, onBusyChange, onApplied }) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [run, setRun] = useState(null);
  const [saved, setSaved] = useState({ savedItems: [], savedPolicies: [] });
  const [choices, setChoices] = useState({});
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirm, setConfirm] = useState(false);
  const requestLock = useRef(false);
  const active = busy || refreshing || run?.status === "running";
  const endpoint = `/api/inbox/${messageId}/reprocess`;
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    busyCallback.current?.(active);
    return () => busyCallback.current?.(false);
  }, [active]);
  async function read() {
    const response = await fetch(endpoint, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not check this reading.");
    setRun(data.run);
    setSaved(data);
    return data;
  }
  useEffect(() => {
    if (!open || run?.status !== "running") return;
    let stopped = false, checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check progress.");
        if (!stopped) { setRun(data.run); setSaved(data); setError(""); }
      } catch {
        if (!stopped) setError("Connection interrupted. Still checking; you can reopen this email later without starting over.");
      } finally { checking = false; }
    }, 2000);
    return () => { stopped = true; clearInterval(timer); };
  }, [open, run?.status, endpoint]);
  async function show() {
    setOpen(true); setBusy(true); setError(""); setSuccess("");
    try {
      const data = await read();
      if (data.run?.comment) setComment(data.run.comment);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function post(body) {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "That did not save. Please try again.");
    return data;
  }
  async function start() {
    if (requestLock.current) return;
    requestLock.current = true; setBusy(true); setError(""); setSuccess(""); setConfirm(false);
    try {
      const data = await post({ action: "start", comment });
      setChoices({}); setRun({ id: data.run_id, status: "running" });
    } catch (e) { setError(e.message); }
    finally { requestLock.current = false; setBusy(false); }
  }
  // A fare alert has no staged proposal to choose between: the fares it produced
  // are already on the fare list waiting to be taken or refused.
  const fareAlert = run?.result?.kind === "fare_alert";
  const insurance = run?.result?.kind === "insurance";
  const records = insurance ? saved.savedPolicies : saved.savedItems;
  const results = insurance ? [run.result.policy] : run?.result?.items || [];
  const selected = results.map((_, index) => ({ index, choice: choices[index] || (records.length ? "skip" : "new") }))
    .filter(r => r.choice !== "skip");
  const duplicateTarget = selected.some((r, i) => r.choice !== "new" && selected.slice(0, i).some(s => s.choice === r.choice));
  async function apply() {
    if (requestLock.current || !selected.length || duplicateTarget) return;
    requestLock.current = true; setBusy(true); setError("");
    try {
      const data = await post({ action: "apply", run_id: run.id, choices: selected.map(r => ({
        index: r.index, target_id: r.choice === "new" ? null : r.choice,
      })) });
      setRun(r => ({ ...r, status: "applied" })); setConfirm(false);
      setSuccess(data.already_applied ? "This reading was already saved."
        : `${data.updated ? `${data.updated} saved ${insurance ? "policy" : "booking"}${data.updated > 1 ? "s" : ""} updated. ` : ""}${data.staged ? "New details are ready in the Inbox. Choose File it to select the trip or covered travelers." : "Your other saved details were kept."}`);
      await onApplied?.();
      startRefresh(() => router.refresh());
    } catch (e) { setError(e.message); }
    finally { requestLock.current = false; setBusy(false); }
  }
  const button = "btn inline-flex min-h-11 items-center justify-center gap-2 px-3 py-2 text-sm disabled:opacity-50";
  if (!open) return <button type="button" onClick={show} disabled={disabled} className={button}>Reprocess email</button>;
  return (
    <section aria-label="Reprocess email" aria-busy={active} className="w-full min-w-0 rounded-xl border border-[var(--line-strong)] bg-sand p-4 text-sm text-ink">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Reprocess email</h3>
        <button type="button" className={button} onClick={() => setOpen(false)} disabled={active}>Close</button>
      </div>
      <p className="mt-1 text-ink-soft">Aly will reread the retained email and supported attachments. Nothing on your trips or insurance changes until you approve it.</p>
      <label className="mt-4 block font-medium" htmlFor={fieldId}>What was missed or incorrect? <span className="font-normal text-ink-faint">(optional)</span></label>
      <textarea id={fieldId} rows={3} maxLength={2000} value={comment} disabled={active}
        onChange={e => setComment(e.target.value)} placeholder="For example: The return flight was missed, or the policy coverage dates came from the wrong section."
        className="mt-2 w-full rounded-xl border border-[var(--line-strong)] bg-white p-3 text-base text-ink" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-faint">{comment.length}/2,000</span>
        <button type="button" className={`${button} btn-primary`} onClick={start} disabled={active}>
          {run?.status === "running" ? <><Spinner className="h-4 w-4" /> Reprocessing…</> : busy ? <><Spinner className="h-4 w-4" /> Working…</> : run?.status === "ready" ? "Read again with this comment" : "Reprocess email"}
        </button>
      </div>
      {run?.status === "running" && <p role="status" className="mt-3 text-ink-soft">Reading the email and attachments. Your existing details are safe; this can take a minute.</p>}
      {(error || run?.status === "failed") && <p role="alert" className="mt-3 text-rose">{error || run.error}</p>}
      {success && <p role="status" className="mt-3 font-medium text-teal">{success}</p>}
      {run?.status === "ready" && fareAlert && <div className="mt-4 rounded-xl border border-[var(--line)] bg-white p-3">
        <h4 className="font-semibold">Read as a fare alert</h4>
        <p className="mt-1 text-ink-soft">{run.result.saved
          ? `${run.result.saved} fare${run.result.saved === 1 ? "" : "s"} saved. Open Bucket list to take or refuse ${run.result.saved === 1 ? "it" : "them"}.`
          : `No fare was saved${run.result.why ? `: ${run.result.why}` : ""}.`}</p>
        <p className="mt-1 text-xs text-ink-faint">A fare is only saved when its route and price are printed in the email, so your comment is not used here.</p>
        {(run.result.warnings || []).map((warning, i) => <p key={i} role="note" className="mt-2 text-rose">{warning}</p>)}
      </div>}
      {run?.status === "ready" && !fareAlert && <>
        <h4 className="mt-5 font-semibold">Review the new reading</h4>
        <p className="mt-1 text-ink-soft">Only the details shown below will update. Missing values and your personal notes are kept.
          Choose an existing record to correct it, or send a genuinely new item to File it. No saved record will be removed.</p>
        {(run.result.warnings || []).map((warning, i) => <p key={i} role="note" className="mt-2 text-rose">{warning}</p>)}
        <div className="mt-3 space-y-3">
          {results.map((item, index) => {
            const choice = choices[index] || (records.length ? "skip" : "new");
            const current = records.find(r => r.id === choice);
            return <div key={index} className="rounded-xl border border-[var(--line)] bg-white p-3">
              <h5 className="font-semibold">{item.title || item.provider}</h5>
              <dl className="mt-2 space-y-1">
                {Object.entries(labels).filter(([key]) => item[key] !== null && item[key] !== undefined && item[key] !== "" && (!Array.isArray(item[key]) || item[key].length))
                  .map(([key, label]) => <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                    <dt className="text-ink-faint">{label}</dt>
                    <dd className="break-words">{current && current[key] != null && shown(current[key]) !== shown(item[key]) && <span className="block text-xs text-ink-faint">Was: {shown(current[key])}</span>}{shown(item[key])}</dd>
                  </div>)}
              </dl>
              <label className="mt-3 block font-medium" htmlFor={`${fieldId}-${index}`}>Use this reading for</label>
              <select id={`${fieldId}-${index}`} value={choice} disabled={active || confirm} onChange={e => setChoices(v => ({ ...v, [index]: e.target.value }))}
                className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--line-strong)] bg-sand p-2 text-base">
                <option value="skip">Skip this result</option>
                {records.map(record => <option key={record.id} value={record.id}>Update: {record.title || record.provider}{record.item_date ? ` (${record.item_date})` : ""}{record.policy_number ? ` · ${record.policy_number}` : ""}</option>)}
                <option value="new">New item: review with File it</option>
              </select>
              {choice === "new" && <p className="mt-1 text-xs text-ink-soft">Creates an unfiled suggestion, not a second saved booking or policy. Use Update if it is already saved.</p>}
            </div>;
          })}
        </div>
        {duplicateTarget && <p role="alert" className="mt-2 text-rose">Two results cannot update the same saved record. Choose a different record or skip one.</p>}
        {confirm ? <div className="mt-4 rounded-xl border border-[var(--line-strong)] p-3">
          <p>Apply {selected.length} selected result{selected.length === 1 ? "" : "s"}? This replaces this email&apos;s unfiled suggestions. Selected saved records will be updated as shown; new items still need File it.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={`${button} btn-primary`} onClick={apply} disabled={active}>{active ? <><Spinner className="h-4 w-4" /> Saving…</> : "Confirm and save"}</button>
            <button type="button" className={button} onClick={() => setConfirm(false)} disabled={active}>Keep reviewing</button>
          </div>
        </div> : <button type="button" className={`${button} btn-primary mt-4`} disabled={active || !selected.length || duplicateTarget} onClick={() => setConfirm(true)}>Use selected results</button>}
      </>}
    </section>
  );
}
