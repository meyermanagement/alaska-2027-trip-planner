"use client";

import { useState } from "react";

/**
 * The contact-us form. Three fields -- subject, message, reply-to address --
 * and one button. The reply-to defaults to the caller's sign-in address so a
 * reply lands where they can read it; they can override it if they want a
 * reply to go somewhere else.
 *
 * Submits to /api/contact, which uses the app's existing email transport to
 * send the message to the owner. The server is the one that says which
 * address the message lands at; the form does not choose the destination.
 */
export default function ContactForm({ defaultEmail = "" }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          replyTo: replyTo.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "That could not be sent.");
        setBusy(false);
        return;
      }
      setSent(true);
      setSubject("");
      setMessage("");
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
