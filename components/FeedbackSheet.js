"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import {
  ACCEPTED_SHOT_TYPES,
  FEEDBACK_EVENT,
  FEEDBACK_KINDS,
  MAX_BODY_CHARS,
  MAX_SHOTS,
  MAX_SHOT_BYTES,
  MAX_TOTAL_SHOT_BYTES,
  SHOT_LONG_EDGE,
  humanBytes,
} from "@/lib/feedback/shared";

/**
 * Telling us something is wrong without leaving the screen it is wrong on.
 *
 * Mounted once in the root layout and asleep until something fires
 * FEEDBACK_EVENT -- today that is the small report button a beta tester carries
 * at the bottom of every screen, including the onboarding screens where nothing
 * else floats. Nothing is drawn until then, so a person who never presses it
 * pays a listener and no markup.
 *
 * One box and two intents. Everything the report needs that a person should
 * not have to type -- which screen they were on, which trip, which skin, how
 * wide the window is, and what they had been doing before this -- is collected
 * without asking. The picture is the exception: a browser cannot photograph its
 * own window (a frosted panel does not survive being redrawn into a canvas, and
 * a cover from another origin poisons it outright), so the screenshot is a real
 * one the person took, chosen from their photos. It is reduced to a sensible
 * size here rather than uploaded whole, because a phone screenshot is several
 * megabytes and a beta on mobile data should not pay for that.
 *
 * Send and forget. There is no list of past reports for a tester to check on:
 * this is one direction, and the reply -- if there is one -- comes as an email
 * from a person.
 */
export default function FeedbackSheet() {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("problem");
  const [body, setBody] = useState("");
  const [shots, setShots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef(null);
  const boxRef = useRef(null);
  const panelRef = useRef(null);
  // A live handle on the pictures so the tear-down can free every preview URL
  // without re-running each time the list changes.
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  useEffect(() => {
    function onAsk(event) {
      const asked = event?.detail?.kind;
      setKind(asked === "idea" ? "idea" : "problem");
      setError("");
      setNotice("");
      setSent(false);
      setOpen(true);
    }
    window.addEventListener(FEEDBACK_EVENT, onAsk);
    return () => window.removeEventListener(FEEDBACK_EVENT, onAsk);
  }, []);

  useEffect(() => {
    return () => {
      for (const shot of shotsRef.current) {
        if (shot.previewUrl) URL.revokeObjectURL(shot.previewUrl);
      }
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setNotice("");
    setError("");
  }, []);

  // Escape closes it, and the writing box takes the caret as it opens so a
  // person can start typing the sentence they already had in their head.
  useEffect(() => {
    if (!open) return;
    function onKey(event) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    const held = window.setTimeout(() => {
      if (!sent) boxRef.current?.focus();
      else panelRef.current?.focus();
    }, 40);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(held);
    };
  }, [open, sent, close]);

  function totalBytes(list) {
    return list.reduce((sum, shot) => sum + (shot.file.size || 0), 0);
  }

  async function pick(files) {
    setError("");
    setNotice("");
    if (!files || !files.length) return;
    const added = [];
    let carried = totalBytes(shots);
    let skipped = 0;
    for (const file of files) {
      if (shots.length + added.length >= MAX_SHOTS) {
        skipped += 1;
        continue;
      }
      const type = String(file.type || "").toLowerCase();
      if (!ACCEPTED_SHOT_TYPES.includes(type)) {
        skipped += 1;
        continue;
      }
      const reduced = await shrink(file);
      if (reduced.size > MAX_SHOT_BYTES) {
        skipped += 1;
        continue;
      }
      if (carried + reduced.size > MAX_TOTAL_SHOT_BYTES) {
        skipped += 1;
        continue;
      }
      carried += reduced.size;
      added.push({
        id: `${file.name || "shot"}:${file.size}:${file.lastModified || Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        file: reduced,
        name: file.name || "screenshot",
        previewUrl: URL.createObjectURL(reduced),
      });
    }
    if (added.length) setShots((prior) => [...prior, ...added]);
    if (skipped) {
      setNotice(
        `${skipped} ${skipped === 1 ? "picture" : "pictures"} left out -- images only, ${humanBytes(MAX_SHOT_BYTES)} each, ${MAX_SHOTS} at most.`,
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function drop(id) {
    setShots((prior) => {
      const gone = prior.find((shot) => shot.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prior.filter((shot) => shot.id !== id);
    });
  }

  async function send(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("body", body.trim());
      form.set("path", pathname);
      form.set("tripId", tripFromPath(pathname));
      form.set("skin", skinNow());
      form.set("viewport", viewportNow());
      for (const shot of shots) {
        form.append("shots", shot.file, shot.file.name || shot.name);
      }
      const res = await fetch("/api/feedback", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "That could not be sent. Try once more.");
        setBusy(false);
        return;
      }
      shots.forEach((shot) => {
        if (shot.previewUrl) URL.revokeObjectURL(shot.previewUrl);
      });
      setShots([]);
      setBody("");
      setNotice("");
      setSent(true);
    } catch {
      setError("That could not be sent. Try once more.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const canSend = !busy && body.trim().length >= 4;

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="arc-scrim absolute inset-0"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={sent ? "Report sent" : "Tell us what happened"}
        className="card relative m-0 w-full max-w-lg rounded-b-none rounded-t-3xl p-5 outline-none sm:m-4 sm:rounded-3xl"
        style={{
          maxHeight: "min(88vh, 44rem)",
          overflowY: "auto",
          paddingBottom:
            "max(1.25rem, calc(env(safe-area-inset-bottom) + 1rem))",
        }}
      >
        {sent ? (
          <>
            <p className="font-display text-xl font-semibold">
              Sent. Thank you.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              It landed with the screen you were on and what you had been doing,
              so nothing has to be reproduced from memory. If it needs an
              answer, it comes to the address you signed in with.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSent(false)}
                className="btn btn-ghost px-3 py-1.5 text-sm"
              >
                Say something else
              </button>
              <button
                type="button"
                onClick={close}
                className="btn btn-primary px-4 py-1.5 text-sm"
              >
                Back to the app
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={send}>
            <p className="section-label">While you are in it</p>
            <h2 className="mt-1 font-display text-xl font-semibold">
              Tell us what happened
            </h2>

            <div className="mt-4 flex flex-wrap gap-2">
              {FEEDBACK_KINDS.map((one) => (
                <button
                  key={one.id}
                  type="button"
                  onClick={() => setKind(one.id)}
                  aria-pressed={kind === one.id}
                  className={`chip ${kind === one.id ? "chip-shade" : ""}`}
                >
                  {one.label}
                </button>
              ))}
            </div>

            <label htmlFor="feedback-body" className="sr-only">
              What happened
            </label>
            <textarea
              ref={boxRef}
              id="feedback-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              maxLength={MAX_BODY_CHARS}
              placeholder={
                kind === "idea"
                  ? "What you wish it did, and when you wanted it"
                  : "What you did, and what happened instead"
              }
              className="field mt-3 w-full"
              required
            />

            {shots.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {shots.map((shot) => (
                  <li
                    key={shot.id}
                    className="relative overflow-hidden rounded-lg border border-sand-deep bg-white"
                  >
                    <img
                      src={shot.previewUrl}
                      alt={shot.name}
                      className="block h-20 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => drop(shot.id)}
                      aria-label={`Remove ${shot.name}`}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-xs font-semibold text-white hover:bg-ink"
                    >
                      {"\u00D7"}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={shots.length >= MAX_SHOTS}
                className="btn btn-ghost btn-sm"
              >
                {shots.length === 0
                  ? "Add a screenshot"
                  : `Add another (${MAX_SHOTS - shots.length} left)`}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => pick(Array.from(event.target.files || []))}
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>

            {notice && <p className="mt-2 text-xs text-ink-soft">{notice}</p>}
            {error && <p className="mt-3 text-sm text-rose">{error}</p>}

            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Sent with it: the screen, the trip, your look, the window size,
              and where you had just been.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-sand-deep pt-4">
              <button
                type="submit"
                disabled={!canSend}
                className="btn btn-primary px-4 py-2 text-sm"
              >
                {busy ? "Sending..." : "Send"}
              </button>
              <button
                type="button"
                onClick={close}
                className="btn btn-ghost px-3 py-2 text-sm"
              >
                Not now
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * The trip a screen belongs to, if the address says so. /trips/<id> and every
 * tab under it carry it; everywhere else there is nothing to read and the
 * report simply has no trip on it.
 */
function tripFromPath(pathname) {
  const match = String(pathname).match(
    /^\/trips\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return match ? match[1] : "";
}

function skinNow() {
  try {
    return document.documentElement.dataset.skin || "";
  } catch {
    return "";
  }
}

function viewportNow() {
  try {
    const ratio = window.devicePixelRatio || 1;
    return `${window.innerWidth}x${window.innerHeight} at ${ratio}x`;
  } catch {
    return "";
  }
}

/**
 * A phone screenshot is 3 to 6 megabytes of pixels nobody needs to read a bug
 * report, so it is redrawn at a sensible longest edge and re-encoded as JPEG
 * before it leaves the device.
 *
 * Falls back to the original file whenever the browser will not decode it --
 * which is the usual answer for HEIC anywhere but Safari -- so an iPhone photo
 * that cannot be reduced is still sent rather than refused.
 */
async function shrink(file) {
  try {
    if (typeof createImageBitmap !== "function") return file;
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= SHOT_LONG_EDGE && file.size <= 900 * 1024) {
      bitmap.close?.();
      return file;
    }
    const scale = longest > SHOT_LONG_EDGE ? SHOT_LONG_EDGE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close?.();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => {
      canvas.toBlob((made) => resolve(made), "image/jpeg", 0.82);
    });
    if (!blob) return file;
    const stem = String(file.name || "screenshot").replace(/\.[^.]+$/, "");
    return new File([blob], `${stem}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
