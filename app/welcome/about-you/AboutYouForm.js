"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ABOUT_ME_PLACEHOLDER } from "@/lib/travelers/profile";

// The About me step of the first-login walkthrough. Two verbs:
//
//   Save and continue -- writes the About me back to the person's traveler
//   row, then advances to /welcome/moments.
//
//   Skip -- advances without saving. The About me stays whatever it was; the
//   owner's version is preserved. The walkthrough does not stamp completion
//   here; that only happens at the end of the moments step, so somebody who
//   drops off About me can still be routed back if they sign in again.

export default function AboutYouForm({ initialAbout, travelerName }) {
  const router = useRouter();
  const [aboutMe, setAboutMe] = useState(initialAbout || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Same auto-grow trick as the People form and the moments editor. A four-
  // row scroll box is exactly the wrong shape when the point is to read the
  // whole paragraph back.
  const textareaRef = useRef(null);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  }, [aboutMe]);

  async function saveAndContinue(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/welcome", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ about_me: aboutMe }),
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
      {initialAbout ? (
        <p className="rounded-lg border border-sand-deep bg-sand-soft/60 px-3 py-2 text-xs text-ink-soft">
          Below is what the family owner wrote about {travelerName}. Nothing is
          erased if you leave it -- add a line, rewrite a sentence, or move on
          as you like.
        </p>
      ) : (
        <p className="rounded-lg border border-sand-deep bg-sand-soft/60 px-3 py-2 text-xs text-ink-soft">
          No one has written About {travelerName} yet. This is the place to say
          who you are as a traveler -- Aly reads it before every answer.
        </p>
      )}

      <label className="block text-xs font-semibold">
        About me
        <textarea
          ref={textareaRef}
          className="field mt-1 min-h-32 overflow-hidden text-sm"
          rows={6}
          value={aboutMe}
          onChange={(e) => setAboutMe(e.target.value)}
          placeholder={ABOUT_ME_PLACEHOLDER}
        />
      </label>

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
