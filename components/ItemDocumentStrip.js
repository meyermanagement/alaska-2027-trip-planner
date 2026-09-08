"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadDocumentFile, deleteDocumentFile } from "@/lib/documents/upload";
import { ACCEPT_ATTR, refuseFile } from "@/lib/documents/kinds";
import DocumentViewer from "./DocumentViewer";

/**
 * The tickets, boarding passes, and confirmations attached to one itinerary
 * item.
 *
 * The strip does its own listing and its own writing rather than expecting the
 * outer tree to thread another array of rows through Itinerary's many callers.
 * The item's id is enough to pull the row set on mount, and RLS makes sure
 * only members of the trip's family ever get anything back.
 *
 * Uploads happen the moment a file is picked, because the item already exists
 * -- the person is not filling in a fresh form, they are attaching to a row
 * that has an id. If the upload succeeds and the row insert fails, the file is
 * cleaned up so nothing orphaned is left behind.
 */
export default function ItemDocumentStrip({
  itemId,
  familyId,
  readOnly = false,
}) {
  const supabaseRef = useRef(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();

  const [docs, setDocs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: err } = await supabaseRef.current
        .from("item_documents")
        .select(
          "id, itinerary_item_id, storage_path, mime_type, size_bytes, original_filename, label, sort_order",
        )
        .eq("itinerary_item_id", itemId)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(err.message || "Could not load tickets.");
      } else {
        setDocs(data || []);
      }
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  async function pickAndUpload(e) {
    setError("");
    const file = e.target.files?.[0] || null;
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    const refusal = refuseFile(file);
    if (refusal) {
      setError(refusal);
      return;
    }
    if (!familyId) {
      setError("Missing family context.");
      return;
    }

    setBusy(true);
    let attachment = null;
    try {
      attachment = await uploadDocumentFile({
        supabase: supabaseRef.current,
        scope: "trip",
        familyId,
        ownerId: itemId,
        file,
      });
      const next = docs.length
        ? Math.max(...docs.map((d) => d.sort_order || 0)) + 1
        : 0;
      const { data, error: err } = await supabaseRef.current
        .from("item_documents")
        .insert({
          itinerary_item_id: itemId,
          storage_path: attachment.storage_path,
          mime_type: attachment.mime_type,
          size_bytes: attachment.size_bytes,
          original_filename: attachment.original_filename,
          label: null,
          sort_order: next,
        })
        .select()
        .single();
      if (err) throw new Error(err.message || "That did not save.");
      setDocs((prev) => [...prev, data]);
    } catch (err) {
      setError(err?.message || "That did not attach.");
      if (attachment?.storage_path) {
        await deleteDocumentFile({
          supabase: supabaseRef.current,
          storagePath: attachment.storage_path,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc) {
    if (!window.confirm(`Remove ${doc.original_filename || "this ticket"}?`))
      return;
    setBusy(true);
    setError("");
    try {
      const { error: err } = await supabaseRef.current
        .from("item_documents")
        .delete()
        .eq("id", doc.id);
      if (err) throw new Error(err.message || "That did not delete.");
      await deleteDocumentFile({
        supabase: supabaseRef.current,
        storagePath: doc.storage_path,
      });
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err?.message || "That did not remove.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  if (docs.length === 0 && readOnly) return null;

  return (
    <div className="no-print mt-2 space-y-1.5">
      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <DocumentViewer
                  storagePath={doc.storage_path}
                  mimeType={doc.mime_type}
                  originalFilename={doc.original_filename}
                  sizeBytes={doc.size_bytes}
                  label={doc.label || doc.original_filename}
                />
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(doc)}
                  disabled={busy}
                  className="mt-1.5 shrink-0 text-xs font-semibold text-ink-soft hover:text-rose disabled:opacity-60"
                  aria-label="Remove this ticket"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-teal hover:text-teal">
          <span aria-hidden="true">📎</span>
          {busy ? "Uploading…" : "Attach ticket or confirmation"}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={pickAndUpload}
            disabled={busy}
            className="sr-only"
          />
        </label>
      )}
      {error && (
        <p aria-live="polite" className="text-xs text-rose">
          {error}
        </p>
      )}
    </div>
  );
}
