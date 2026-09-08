"use client";

import { useState } from "react";
import { fetchDocumentUrl } from "@/lib/documents/url";
import { humanBytes, isImageMime, isPdfMime } from "@/lib/documents/kinds";

/**
 * A small strip that shows a stored document exists and opens it in a new tab
 * when tapped.
 *
 * The URL is asked for on the tap, not on render. A page listing every person
 * and every ticket would otherwise mint a signed URL for each one before the
 * reader had shown any interest in opening them, spending server round-trips
 * on paths nobody was about to click. On tap, the token comes back in a few
 * hundred milliseconds and the browser opens the file itself.
 *
 * `size` is optional: personal documents carry it, ticket documents definitely
 * do, and both fall back to just the file kind when it is missing.
 */
export default function DocumentViewer({
  storagePath,
  mimeType,
  originalFilename,
  sizeBytes,
  label,
  compact = false,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const url = await fetchDocumentUrl(storagePath, {
        filename: originalFilename,
      });
      // Opening in a new tab lets the reader keep the trip page in place; the
      // signed URL is single-use in effect because it expires in a minute, so
      // the browser cannot cache the tab across sessions.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err?.message || "That did not open.");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const url = await fetchDocumentUrl(storagePath, {
        download: true,
        filename: originalFilename,
      });
      window.location.assign(url);
    } catch (err) {
      setError(err?.message || "That did not download.");
    } finally {
      setBusy(false);
    }
  }

  const kindIcon = isImageMime(mimeType)
    ? "🖼️"
    : isPdfMime(mimeType)
      ? "📄"
      : "📎";

  const kindLabel = isImageMime(mimeType)
    ? "Photo"
    : isPdfMime(mimeType)
      ? "PDF"
      : "File";

  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={open}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-teal/30 bg-teal-soft/40 px-2 py-1 text-xs font-semibold text-teal hover:bg-teal-soft/70 disabled:opacity-60"
        >
          <span aria-hidden="true">{kindIcon}</span>
          {busy ? "Opening…" : label || `View ${kindLabel.toLowerCase()}`}
        </button>
        {error && (
          <span aria-live="polite" className="text-xs text-rose">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/60 p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            <span aria-hidden="true">{kindIcon} </span>
            {label || originalFilename || `${kindLabel} on file`}
          </p>
          <p className="text-xs text-ink-soft">
            {kindLabel}
            {sizeBytes ? ` · ${humanBytes(sizeBytes)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={open}
            disabled={busy}
            className="text-xs font-semibold text-teal disabled:opacity-60"
          >
            {busy ? "Opening…" : "Open"}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="text-xs font-semibold text-ink-soft hover:text-teal disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
      {error && (
        <p aria-live="polite" className="mt-1.5 text-xs text-rose">
          {error}
        </p>
      )}
    </div>
  );
}
