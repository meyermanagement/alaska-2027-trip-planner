"use client";

import { useState } from "react";

/**
 * Copy a word out of the desk.
 *
 * A beta code, and now an issue's name, are both read here and typed somewhere
 * else -- into a message, a spreadsheet, a sentence asking for the thing to be
 * fixed -- and selecting mono text with a hyphen in it on a phone is the kind of
 * small fight that makes a person retype it and get a character wrong. So each
 * row carries its own button.
 *
 * Its own state, deliberately: copying is instant, local and cannot fail
 * halfway, so several rows saying "Copied" at once is honest rather than
 * confusing. The confirmation replaces the label for a moment and is also
 * announced, because a button whose only feedback is a word changing is a button
 * that says nothing to a screen reader.
 *
 * The clipboard API needs a secure context. On http over a phone's IP address it
 * is simply missing, so there is a fallback that puts the text in a hidden field
 * and asks the document to copy the selection -- old, deprecated, and still the
 * only thing that works there.
 */
export default function CopyWord({ text }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    let done = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        done = true;
      }
    } catch {
      done = false;
    }
    if (!done) {
      try {
        const held = document.createElement("textarea");
        held.value = text;
        held.setAttribute("readonly", "");
        held.style.position = "fixed";
        held.style.opacity = "0";
        document.body.appendChild(held);
        held.select();
        done = document.execCommand("copy");
        document.body.removeChild(held);
      } catch {
        done = false;
      }
    }
    if (!done) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${text} copied` : `Copy ${text}`}
      className="btn btn-ghost btn-sm min-h-9 gap-1.5"
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m20 6-11 11-5-5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect
            x="9"
            y="9"
            width="11"
            height="11"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
