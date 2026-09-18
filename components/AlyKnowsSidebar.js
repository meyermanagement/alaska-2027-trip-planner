"use client";

import { welcomeSummary } from "@/lib/welcome/copy";

// A preview of form inputs, not saved state or inferred travel preferences.
export default function AlyKnowsSidebar({ familyName, address, people, pets, practice = false }) {
  const facts = welcomeSummary({ familyName, address, people, pets });
  return (
    <aside className="self-start rounded-2xl border border-sand-deep bg-sand-soft/60 p-4 lg:sticky lg:top-4">
      <h2 className="section-label text-ink-soft">Your details so far</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        {practice
          ? "Check your details as you go. Preview these details keeps them for this practice run in this browser tab only."
          : "Check your details as you go. They are not saved until you press Save and continue."}
      </p>
      <div className="mt-3 space-y-2">
        {facts.length === 0 ? (
          <p className="text-sm text-ink-faint">Your details will appear here as you type.</p>
        ) : facts.map((fact) => (
          <p key={fact.key} className="rounded-lg border border-sand-deep bg-white p-3 text-sm leading-relaxed text-ink">
            {fact.text}
          </p>
        ))}
      </div>
    </aside>
  );
}
