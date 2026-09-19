"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "./LinkPending";
import { BinocularsIcon } from "./Icons";

export default function OnTripTips({ tripId, readOnly = false }) {
  const router = useRouter();
  const running = useRef(false);
  const opened = useRef(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const check = useCallback(async () => {
    if (running.current || readOnly) return;
    running.current = true;
    setBusy(true); setError(""); setNote("");
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 110000);
    try {
      const response = await fetch("/api/tips/on-trip", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        signal: abort.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The conditions check did not finish.");
      setNote(result.note || "Today's and tomorrow's plans checked.");
      if (result.found) router.refresh();
    } catch (err) {
      setError(err.name === "AbortError" ? "The conditions check timed out. Please try again." : err.message);
    } finally { clearTimeout(timeout); running.current = false; setBusy(false); }
  }, [tripId, readOnly, router]);
  useEffect(() => {
    if (readOnly || !tripId || opened.current === tripId || document.visibilityState === "hidden") return;
    opened.current = tripId;
    check();
  }, [tripId, readOnly, check]);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible") { opened.current = tripId; check(); }
    };
    window.addEventListener("pageshow", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("pageshow", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [tripId, check]);
  if (readOnly) return null;
  return <div className="max-w-sm">
    <button className="btn btn-primary btn-sm w-full" onClick={check} disabled={busy}>
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <BinocularsIcon />}
      {busy ? "Checking today & tomorrow…" : "Check today's & tomorrow's plans"}
    </button>
    <p className={`mt-1.5 text-xs leading-snug ${error ? "text-rose" : "text-ink-soft"}`} role={error ? "alert" : "status"}>
      {busy ? "Looking for weather, reported traffic, closures and transport changes." : error || note}
    </p>
  </div>;
}
