"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { aboutMeFromParts, splitAboutMe } from "@/lib/travelers/profile";
import AboutSections from "@/components/AboutSections";

// The About me step of the first-login walkthrough. Two verbs:
//
//   Save and continue -- writes the About me back to the person's traveler
//   row, then advances to /welcome/moments.
//
//   Skip -- advances without saving. The About me stays whatever it was; the
//   owner's version is preserved. The walkthrough does not stamp completion
//   here; that only happens at the end of the moments step, so somebody who
//   drops off About me can still be routed back if they sign in again.

export default function AboutYouForm({ initialAbout }) {
  const router = useRouter();
  const [parts, setParts] = useState(() => splitAboutMe(initialAbout));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveAndContinue(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/welcome", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ about_me: aboutMeFromParts(parts) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "That could not be saved.");
        setBusy(false);
        return;
      }
      router.push("/welcome/moments");
    } catch {
      setError("That could not be saved.");
      setBusy(false);
    }
  }

  function skip() {
    router.push("/welcome/moments");
  }

  return (
    <form onSubmit={saveAndContinue} className="space-y-3">
      {initialAbout && (
        <p className="rounded-lg border border-sand-deep bg-sand-soft/60 px-3 py-2 text-xs text-ink-soft">
          These details are already in your profile. Keep them, edit them, or
          add your own words. Skipping leaves your saved answers unchanged.
        </p>
      )}

      <AboutSections
        parts={parts}
        setParts={setParts}
        idPrefix="welcome-about"
      />

      {error && <p className="text-xs text-terra-deep">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          {busy ? "Saving..." : "Save and continue"}
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={busy}
          className="btn btn-ghost whitespace-nowrap px-4 py-2 text-sm"
        >
          Skip for now
        </button>
      </div>
    </form>
  );
}
