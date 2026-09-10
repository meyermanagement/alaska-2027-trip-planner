"use client";

import { useRef, useState } from "react";
import {
  ACCEPT_ATTR,
  humanBytes,
  isImageMime,
  isPdfMime,
  refuseFile,
} from "@/lib/documents/kinds";

/**
 * The file part of a document form.
 *
 * Does not upload on its own -- it collects the chosen file and hands it back
 * to the parent form on save, so a person filling in a passport form can pick
 * a scan, notice they picked the wrong page, replace it, and only then have
 * the app write anything. The parent decides when to actually upload so the
 * metadata row and the file are written together or not at all.
 *
 * If a file was already stored (edit mode), the strip shows what is there and
 * lets the person replace or clear it. Replace does not delete the old file
 * until the save succeeds; clear means "remove on save".
 */
export default function DocumentPicker({
  existing = null,
  onChange,
  label = "File",
}) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
  const [clearing, setClearing] = useState(false);

  const has = pending || (!clearing && existing);
  const kind = pending
    ? { mime: pending.type, name: pending.name, size: pending.size }
    : existing
      ? {
          mime: existing.mime_type,
          name: existing.original_filename,
          size: existing.size_bytes,
        }
      : null;

  function report(next) {
    // Two orthogonal signals the parent needs:
    //   file: the new File to upload (or null)
    //   clearExisting: true if the person wants the stored file removed
    onChange?.({
      file: next.file ?? null,
      clearExisting: next.clearExisting ?? false,
    });
  }

  function pick(e) {
    setError("");
    const file = e.target.files?.[0] || null;
    if (!file) return;
    const refusal = refuseFile(file);
    if (refusal) {
      setError(refusal);
      e.target.value = "";
      return;
    }
    setPending(file);
    setClearing(false);
    // Picking a replacement counts as clearing the old one, from the parent's
    // point of view: the new file supersedes the old.
    report({ file, clearExisting: !!existing });
  }

  function clearPending() {
    setPending(null);
    if (inputRef.current) inputRef.current.value = "";
    report({ file: null, clearExisting: clearing });
  }

  function removeExisting() {
    setClearing(true);
    setPending(null);
    if (inputRef.current) inputRef.current.value = "";
    report({ file: null, clearExisting: true });
  }

  function undoRemove() {
    setClearing(false);
    report({ file: null, clearExisting: false });
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold">
        {label}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          onChange={pick}
          className="mt-1 block w-full text-sm text-ink file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-teal file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-on-accent hover:file:bg-teal/90"
        />
      </label>
      <p className="text-[11px] leading-snug text-ink-soft">
        Take a photo or pick a PDF. I read the number and expiry off the scan
        and fill in the fields below, and the file itself stays cached on the
        phone so it opens at the desk with no signal.
      </p>

      {has && kind && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--line)] bg-white/60 p-2.5 text-xs">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">
              <span aria-hidden="true">
                {isImageMime(kind.mime)
                  ? "🖼️ "
                  : isPdfMime(kind.mime)
                    ? "📄 "
                    : "📎 "}
              </span>
              {kind.name || "File"}
            </p>
            <p className="text-ink-soft">
              {pending ? "New, not yet saved" : "Already on file"}
              {kind.size ? ` · ${humanBytes(kind.size)}` : ""}
            </p>
          </div>
          {pending ? (
            <button
              type="button"
              onClick={clearPending}
              className="text-xs font-semibold text-ink-soft hover:text-rose"
            >
              Undo
            </button>
          ) : (
            <button
              type="button"
              onClick={removeExisting}
              className="text-xs font-semibold text-ink-soft hover:text-rose"
            >
              Remove
            </button>
          )}
        </div>
      )}

      {clearing && !pending && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rose/30 bg-rose/5 p-2.5 text-xs">
          <span className="text-rose">
            The file on record will be removed when you save.
          </span>
          <button
            type="button"
            onClick={undoRemove}
            className="font-semibold text-teal"
          >
            Keep it
          </button>
        </div>
      )}

      {error && (
        <p aria-live="polite" className="text-xs text-rose">
          {error}
        </p>
      )}

      <p className="text-[0.7rem] text-ink-soft">
        Photos or PDFs up to 25 MB. Only your family can open what you upload.
      </p>
    </div>
  );
}
