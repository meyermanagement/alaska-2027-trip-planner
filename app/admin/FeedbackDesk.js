"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  FEEDBACK_STATUSES,
  kindLabel,
  statusLabel,
} from "@/lib/feedback/shared";

/**
 * What the testers said, and what was done about it.
 *
 * A client component because each report carries one control: where it stands.
 * Nothing else here is interactive -- a report is a thing to read, and the
 * pictures are already drawn, so the work is making a fortnight of them
 * skimmable rather than clickable.
 *
 * The pictures come as links that are signed and expire within the hour: the
 * bucket is private, and a screenshot of a bug is quite often also a screenshot
 * of somebody's passport number.
 */
export default function FeedbackDesk({ reports = [] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function mark(id, status) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "That did not save.");
        return;
      }
      router.refresh();
    } catch {
      setError("That did not save.");
    } finally {
      setBusy("");
    }
  }

  const waiting = reports.filter((one) => one.status === "new").length;

  return (
    <section>
      <h2 className="font-display text-xl font-semibold">What testers said</h2>
      <p className="mt-1.5 text-sm text-ink-soft">
        {reports.length
          ? `${reports.length} ${reports.length === 1 ? "report" : "reports"}, ${waiting} not looked at yet. Newest first.`
          : "Nothing yet. Reports arrive from the Contact Us row inside the app."}
      </p>

      {error && <p className="mt-3 text-sm text-rose">{error}</p>}

      <ul className="mt-4 space-y-3">
        {reports.map((one) => (
          <li key={one.id} className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-semibold">
                {kindLabel(one.kind)}
                {one.status !== "new" && (
                  <span className="ml-2 text-xs font-normal text-ink-soft">
                    {statusLabel(one.status)}
                  </span>
                )}
              </span>
              <span className="min-w-0 break-all text-xs text-ink-soft">
                {one.email || "no address"}
                {one.at ? ` · ${one.at}` : ""}
              </span>
            </div>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {one.body}
            </p>

            {one.shots.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {one.shots.map((shot, n) => (
                  <li key={shot}>
                    <a
                      href={shot}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border border-sand-deep"
                    >
                      <img
                        src={shot}
                        alt={`Screenshot ${n + 1}`}
                        className="block h-24 w-full object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 text-xs text-ink-soft">
              {[
                one.path ? `On ${one.path}` : null,
                one.tripName ? `Trip: ${one.tripName}` : null,
                one.skin ? `Look: ${one.skin}` : null,
                one.viewport || null,
                one.build ? `Build ${one.build}` : null,
                one.browser || null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {one.trail.length > 0 && (
              <p className="mt-1.5 text-xs text-ink-soft">
                Before this: {one.trail.join(" \u2190 ")}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-sand-deep pt-3">
              {FEEDBACK_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => mark(one.id, status)}
                  disabled={busy === one.id || one.status === status}
                  aria-pressed={one.status === status}
                  className={`chip ${one.status === status ? "chip-shade" : ""}`}
                >
                  {statusLabel(status)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
