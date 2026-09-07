"use client";

import { useEffect, useRef, useState } from "react";

// Kept in sync with the server. If either side moves, both do.
const MAX_SCREENSHOTS = 4;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
];

/**
 * The contact-us form. Four fields -- subject, message, reply-to, and an
 * optional stack of screenshots -- and one send button.
 *
 * The reply-to defaults to the caller's sign-in address so a reply lands where
 * they can read it. Screenshots are held in state as {file, previewUrl}
 * records, previewed as thumbnails so the sender can see what they attached,
 * and posted to /api/contact as multipart form data. The server, not the
 * client, decides where the message is delivered.
 */
export default function ContactForm({ defaultEmail = "" }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState(defaultEmail);
  const [screenshots, setScreenshots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [attachNotice, setAttachNotice] = useState("");
  const fileInputRef = useRef(null);
  // A live handle on the current screenshot list, kept in a ref so the
  // unmount cleanup can revoke every preview URL without having to re-run
  // whenever the list changes. Per-remove cleanup happens inline in
  // removeScreenshot; this ref only exists so a page tear-down mid-write
  // does not leak whatever previews were open at that moment.
  const screenshotsRef = useRef(screenshots);
  screenshotsRef.current = screenshots;

  useEffect(() => {
    return () => {
      for (const s of screenshotsRef.current) {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      }
    };
  }, []);

  function currentTotalBytes(list) {
    return list.reduce((total, s) => total + (s.file.size || 0), 0);
  }

  function pickScreenshots(newFiles) {
    setError("");
    setAttachNotice("");
    if (!newFiles || !newFiles.length) return;
    const additions = [];
    let carriedTotal = currentTotalBytes(screenshots);
    let skipped = 0;
    for (const file of newFiles) {
      if (screenshots.length + additions.length >= MAX_SCREENSHOTS) {
        skipped += 1;
        continue;
      }
      const type = String(file.type || "").toLowerCase();
      if (!ACCEPTED_TYPES.includes(type)) {
        skipped += 1;
        continue;
      }
      if (file.size > MAX_SCREENSHOT_BYTES) {
        skipped += 1;
        continue;
      }
      if (carriedTotal + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
        skipped += 1;
        continue;
      }
      carriedTotal += file.size;
      additions.push({
        id: `${file.name || "screenshot"}:${file.size}:${file.lastModified || Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (additions.length) {
      setScreenshots((prior) => [...prior, ...additions]);
    }
    if (skipped) {
      setAttachNotice(
        `${skipped} file${skipped === 1 ? "" : "s"} skipped -- images only, ${humanBytes(MAX_SCREENSHOT_BYTES)} each and ${MAX_SCREENSHOTS} at most.`,
      );
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeScreenshot(id) {
    setScreenshots((prior) => {
      const removed = prior.find((s) => s.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prior.filter((s) => s.id !== id);
    });
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("subject", subject.trim());
      form.set("message", message.trim());
      form.set("replyTo", replyTo.trim());
      for (const s of screenshots) {
        form.append("screenshots", s.file, s.file.name || "screenshot");
      }
      const res = await fetch("/api/contact", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "That could not be sent.");
        setBusy(false);
        return;
      }
      // Free every preview URL before the state gets swapped out.
      screenshots.forEach((s) => {
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
      });
      setSent(true);
      setSubject("");
      setMessage("");
      setScreenshots([]);
      setAttachNotice("");
    } catch {
      setError("That could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-teal/40 bg-teal-soft/40 p-4 sm:p-5">
        <p className="font-display text-lg text-ink">Message sent.</p>
        <p className="mt-1 text-sm text-ink-soft">
          Thank you -- we read every one. If a reply is worth writing back, it
          will come to {replyTo || "the address you signed in with"}.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="btn btn-ghost mt-4 px-3 py-1.5 text-sm"
        >
          Write another
        </button>
      </div>
    );
  }

  const canSend =
    !busy && subject.trim().length > 0 && message.trim().length >= 4;
  const attachDisabled = screenshots.length >= MAX_SCREENSHOTS;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label
          htmlFor="contact-subject"
          className="block text-sm font-semibold text-ink"
        >
          Subject
        </label>
        <input
          id="contact-subject"
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Short line -- what this is about"
          className="field mt-1 w-full"
          maxLength={120}
          required
        />
      </div>

      <div>
        <label
          htmlFor="contact-message"
          className="block text-sm font-semibold text-ink"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="What happened, what you expected, what you wish the app did..."
          className="field mt-1 w-full"
          rows={7}
          maxLength={4000}
          required
        />
      </div>

      <div>
        <p className="block text-sm font-semibold text-ink">
          Screenshots{" "}
          <span className="font-normal text-ink-soft">(optional)</span>
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          Up to {MAX_SCREENSHOTS}, {humanBytes(MAX_SCREENSHOT_BYTES)} each. A
          picture of the screen where something went wrong helps every time.
        </p>
        {screenshots.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {screenshots.map((s) => (
              <li
                key={s.id}
                className="relative overflow-hidden rounded-lg border border-sand-deep bg-white"
              >
                <img
                  src={s.previewUrl}
                  alt={s.file.name || "Screenshot"}
                  className="block h-24 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeScreenshot(s.id)}
                  aria-label={`Remove ${s.file.name || "screenshot"}`}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-xs font-semibold text-white shadow-sm hover:bg-ink"
                >
                  ×
                </button>
                <p className="truncate px-1.5 py-1 text-[0.68rem] text-ink-soft">
                  {s.file.name || "Screenshot"}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachDisabled}
            className="btn btn-ghost px-3 py-1.5 text-sm"
          >
            {screenshots.length === 0
              ? "Add screenshots"
              : `Add more (${MAX_SCREENSHOTS - screenshots.length} left)`}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            onChange={(event) =>
              pickScreenshots(Array.from(event.target.files || []))
            }
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
        {attachNotice && (
          <p className="mt-2 text-xs text-ink-soft">{attachNotice}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="contact-reply"
          className="block text-sm font-semibold text-ink"
        >
          Reply to
        </label>
        <input
          id="contact-reply"
          type="email"
          value={replyTo}
          onChange={(event) => setReplyTo(event.target.value)}
          className="field mt-1 w-full"
        />
        <p className="mt-1 text-xs text-ink-soft">
          Defaults to the address you signed in with. Change it if a reply
          should go somewhere else.
        </p>
      </div>

      {error && <p className="text-sm text-rose">{error}</p>}

      <div className="flex flex-wrap gap-2 border-t border-sand-deep pt-4">
        <button
          type="submit"
          disabled={!canSend}
          className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          {busy ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}

function humanBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}
