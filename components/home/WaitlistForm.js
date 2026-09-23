"use client";

import { useState } from "react";
import { WAITLIST_HONEYPOT } from "@/lib/home/waitlist";

const SIZES = [
  ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6 or more"],
];

const LANDED = {
  invalid: "That email address doesn't look right.",
  error: "Couldn't save that. Please try again.",
};

/**
 * The waitlist, at the foot of the front door.
 *
 * Posts to /api/waitlist with fetch. Without JavaScript the same form posts
 * normally and the route sends the browser back to /#waitlist with the outcome,
 * which app/page.js hands in as `initial`. Three questions only: the address,
 * how many travel, and whether this is somebody who organizes for a group --
 * the last is how the Groups pilot finds its first organizers.
 */
export default function WaitlistForm({ initial }) {
  const [state, setState] = useState(initial === "joined" ? "joined" : "idle");
  const [error, setError] = useState(LANDED[initial] || "");

  async function submit(event) {
    event.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) { setState("joined"); return; }
      setError(body.error || "Couldn't save that. Please try again.");
    } catch {
      setError("Couldn't reach Alyeska. Check the connection and try again.");
    }
    setState("idle");
  }

  return (
    <div id="waitlist" className="ma-in mx-auto mt-12 max-w-md scroll-mt-8 text-left" style={{ animationDelay: "120ms" }}>
      <h3 className="text-center font-display text-[20px] font-semibold">Join the waitlist.</h3>
      <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-soft">
        We invite a few new families each week during the beta.
      </p>

      {state === "joined" ? (
        <p role="status" className="card mt-5 p-4 text-center text-[14px] leading-relaxed">
          You’re on the list. We’ll email you when there’s a spot.
        </p>
      ) : (
        <form method="post" action="/api/waitlist" onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="waitlist-email" className="block text-sm font-semibold text-ink">Email</label>
            <input
              id="waitlist-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              required
              className="field mt-1 w-full"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? "waitlist-error" : undefined}
            />
          </div>
          <div>
            <label htmlFor="waitlist-size" className="block text-sm font-semibold text-ink">
              Travelers in your household <span className="font-normal text-ink-soft">(optional)</span>
            </label>
            <select id="waitlist-size" name="household_size" defaultValue="" className="field mt-1 w-full">
              <option value="">Choose</option>
              {SIZES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <label className="flex items-start gap-2.5 text-[14px] leading-snug">
            <input type="checkbox" name="organizer" value="on" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>I organize trips for a group or an organization.</span>
          </label>
          {/* Nobody sees this; a form-filling bot does, and fills it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Website
              <input type="text" name={WAITLIST_HONEYPOT} tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>
          {error ? <p id="waitlist-error" role="alert" className="text-[13px] text-rose">{error}</p> : null}
          <button type="submit" className="btn btn-primary w-full" disabled={state === "busy"}>
            {state === "busy" ? "Joining…" : "Join the waitlist"}
          </button>
          <p className="text-center text-[12px] leading-relaxed text-ink-soft">
            Used only to invite you into Alyeska. Never sold or shared.{" "}
            <a href="/privacy#waitlist" className="underline underline-offset-2">Privacy</a>
          </p>
        </form>
      )}
    </div>
  );
}
