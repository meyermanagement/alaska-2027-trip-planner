"use client";

/**
 * Ask the server for a short-lived link to open a document, and hand back the
 * URL. The token in the URL expires in about a minute, which is the whole
 * point of asking for a new one every time the viewer opens the file rather
 * than pasting a stored URL into an img tag.
 */
export async function fetchDocumentUrl(storagePath, opts = {}) {
  const response = await fetch("/api/documents/url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      path: storagePath,
      download: !!opts.download,
      filename: opts.filename,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.url) {
    throw new Error(json?.error || "That document could not be opened.");
  }
  return json.url;
}
