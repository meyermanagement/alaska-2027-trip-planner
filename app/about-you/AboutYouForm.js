"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ABOUT_ME_EXAMPLES, ABOUT_ME_PROMPTS } from "@/lib/travelers/profile";
import DictationHint from "@/components/DictationHint";

/**
 * The About You page, which is a whole screen rather than a card.
 *
 * It began as a card on the Trips page and that was the wrong shape twice over.
 * A first-time user has an empty Trips page and the one useful thing on it was
 * competing with the heading for attention; and a box asking for a paragraph does
 * not get a paragraph when it is six lines tall between two other things. On its
 * own screen it can show four real examples at full length, which is what
 * actually gets somebody to write more than a sentence.
 *
 * For a secondary traveler this screen is not one field of their record -- it is
 * the whole of it. The database refuses every other column on their own row, so
 * the screen says which parts of themselves somebody else looks after rather than
 * leaving them to find out by pressing something that will not move.
 *
 * Shown on the first sign-in and then not again once it has been saved. Skipping
 * sets a cookie that lasts as long as the browser session, so somebody who is not
 * in the mood is not trapped and is not nagged twice in one sitting -- but the
 * question comes back next time they sign in, because until it is answered every
 * recommendation the app makes is generic.
 */
export default function AboutYouForm({
  travelerId,
  name,
  about,
  first,
  secondary = false,
}) {
  const saved = String(about || "").trim();
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function save() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("travelers")
      .update({ about_me: text.trim() || null })
      .eq("id", travelerId)
      .select("id");
    setBusy(false);

    if (dbError) {
      setError(dbError.message || "That did not save. Try again in a moment.");
      return;
    }
    // A write the rules refuse does not raise -- row-level security filters the
    // row away and the update reports success having changed nothing. Counting
    // what came back is the only way to tell "saved" from "silently dropped".
    if (!data || data.length === 0) {
      setError(
        secondary
          ? "That did not save. This paragraph is yours to change, so if it keeps refusing, tell a primary traveler in the family — something is wrong at our end, not yours."
          : "That did not save. Ask a primary traveler in the family to write this one for you.",
      );
      return;
    }
    setDone(true);
    // Straight on to the trips on a first run, because the question was in the
    // way of what they came for. On a later visit they came here on purpose, so
    // they stay and get told it saved.
    if (first) router.replace("/trips");
    else router.refresh();
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">
        {first
          ? name
            ? `Before you start, ${name} — what are you like on a trip?`
            : "Before you start — what are you like on a trip?"
          : "About you"}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        This is what shapes the recommendations, the pro tips and the
        suggestions you get. Aly reads it before she answers, so a few sentences
        here are the difference between advice that fits you and advice that
        would fit anybody. It works before you have booked a thing, and you can
        change it any time.
      </p>

      {secondary && (
        <p className="mt-3 max-w-2xl rounded-xl border border-[var(--line)] bg-sand/40 p-3 text-sm leading-relaxed text-ink-soft">
          This is the one thing about yourself you can change here. Your name,
          your email and your travel documents are looked after by a primary
          traveler in the family — ask them if any of those need fixing. What
          you write below is yours.
        </p>
      )}

      <textarea
        className="field mt-5 text-base leading-relaxed"
        rows={9}
        placeholder="Write it the way you would say it to a friend who was planning the trip for you."
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus={first}
      />

      {/* This box wants a paragraph, and a paragraph is not what anybody types
          with their thumbs -- which is most of the people who see this screen,
          since it is the first thing after signing up. Spoken, the same paragraph
          takes twenty seconds. */}
      <DictationHint className="mt-2.5" />

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Worth mentioning
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {ABOUT_ME_PROMPTS.map((prompt) => (
            <li
              key={prompt}
              className="rounded-full border border-sand-deep bg-sand/60 px-2.5 py-1 text-xs text-ink-soft"
            >
              {prompt}
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="mt-3 text-sm font-semibold text-rose">{error}</p>}
      {done && !first && (
        <p className="mt-3 text-sm font-semibold text-teal">
          Saved. Aly will use this from her next answer on.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={busy || !text.trim() || text.trim() === saved}
        >
          {busy ? "Saving…" : first ? "Save and get started" : "Save"}
        </button>
        {first && (
          // A plain link rather than a button, and a form post rather than a
          // fetch: the cookie has to be set by the server, and the only thing
          // this does is get out of the way.
          <form action="/api/about-you/skip" method="post">
            <button className="btn btn-ghost" type="submit">
              Skip for now
            </button>
          </form>
        )}
      </div>

      <div className="mt-9 border-t border-[var(--line)] pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Some examples
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          There is no right answer here. These four people would want completely
          different trips.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ABOUT_ME_EXAMPLES.map((example) => (
            <blockquote
              key={example}
              className="rounded-xl border border-sand-deep bg-sand/50 p-3 text-xs leading-relaxed text-ink-soft"
            >
              &ldquo;{example}&rdquo;
            </blockquote>
          ))}
        </div>
      </div>
    </>
  );
}
