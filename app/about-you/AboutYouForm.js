"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { aboutMeFromParts, splitAboutMe } from "@/lib/travelers/profile";
import AboutSections from "@/components/AboutSections";
import AlyIntro from "@/components/AlyIntro";
import DictationHint from "@/components/DictationHint";
import { patchRun, readRun } from "@/lib/practice/session";

/**
 * The About You page, which is a whole screen rather than a card.
 *
 * Five short prompts and chip drawers that append into the matching prompt. The
 * free-text paragraph is gone -- the nine-row textarea was honest but hard, and
 * every A/B of it ended in two sentences. Now every input on the screen writes
 * into a labelled box, and on save the boxes concatenate into the same about_me
 * column so nothing downstream changes. Aly still reads one block of text before
 * every answer; the block is just written in five bites with headings.
 *
 * The questions are about the person rather than about a trip. What somebody is
 * like on a trip is mostly visible from the trip; what is not visible is the
 * standard they hold a room to, whether they only book what other people rated
 * highly, whether they drink, and whether they are up at five or up at ten.
 *
 * A paragraph that is already stored loads back into the boxes it was written
 * in, because this screen is reachable from Settings and from the Family tab
 * long after the first sign-in, and a screen that opens blank and saves over
 * what is there is a trap. Anything the split does not recognise -- a paragraph
 * Aly wrote out of the interview, free text typed before the headings existed --
 * lands whole in the last box, where it can be cut up or left alone. Nothing is
 * dropped.
 *
 * For a secondary traveler this screen is the whole of their record. Every
 * other column on their row is refused by the database, so the screen says so
 * rather than leaving them to find out by pressing something that will not
 * move.
 *
 * Shown on the first sign-in and then not again once it has been saved.
 * Skipping sets a cookie that lasts as long as the browser session, so
 * somebody who is not in the mood is not trapped and is not nagged twice in
 * one sitting -- but the question comes back next time they sign in, because
 * until it is answered every recommendation the app makes is generic.
 */
export default function AboutYouForm({
  travelerId,
  name,
  first,
  secondary = false,
  // When true, Save does not touch the database. Instead the paragraph the
  // primary would have written is shown back to them with a note that it
  // would have been written to their own page. Used from the practice hub so
  // somebody can rehearse the question without spending their real paragraph.
  practice = false,
  // The family's home coordinates from families.home_lat/home_lon. Used to
  // fill the "Sports and teams" chip drawer with local pro teams so somebody
  // in St. Louis sees the Cardinals and the Blues as the first two chips
  // instead of a generic "the NFL" that could belong to anyone. Null when
  // the family has no geocoded home (rare -- the welcome screen geocodes it)
  // in which case the drawer falls back to the general sports list.
  // The paragraph already stored on this traveler, split back into the five
  // boxes. Blank for a first visit and for practice.
  initial = "",
  homeLat = null,
  homeLon = null,
  // Where a first-run user lands after Save or Skip. Defaults to /trips --
  // the original behaviour -- but the first-login chain hands us /interview
  // so the paragraph flows straight into the interview instead of a Trips
  // page with nothing on it. Ignored on the ordinary Settings-driven visit.
  nextHref = "/trips",
}) {
  // A paragraph already on the row is read back into the five boxes it was
  // written in, so coming back to this screen from Settings is an edit rather
  // than a blank page that silently replaces what is there. Empty on a first
  // sign-in, and empty on a practice run, which never reads the database.
  const [parts, setParts] = useState(() => splitAboutMe(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Whose name the heading greets. Real visits greet the signed-in traveler.
  // A practice visit greets the first person from the practice run, because
  // the rehearsal is about a family somebody just typed -- greeting the real
  // account holder here is what made the chain feel like it had forgotten
  // the previous screen. Read after mount, since sessionStorage does not
  // exist during the server render and reading it in the initializer would
  // make the markup disagree on hydration.
  const [practiceName, setPracticeName] = useState("");
  useEffect(() => {
    if (!practice) return;
    const run = readRun();
    setPracticeName((run.people || [])[0]?.name || "");
  }, [practice]);
  const heading = practice ? practiceName : name;

  const hasAnyText = Object.values(parts).some((v) => String(v).trim());

  async function save() {
    setBusy(true);
    setError("");

    const paragraph = aboutMeFromParts(parts);

    if (practice) {
      setBusy(false);
      // Keep the paragraph in the practice run so the proof screen later in
      // the chain can weigh it, the way a real paragraph would be weighed.
      patchRun({ aboutMe: paragraph || "" });
      setDone(true);
      return;
    }

    // Route the save through the server so the same request that writes the
    // paragraph also refreshes the interview priors it implies. The route
    // still writes through the caller's Supabase session (row-level security
    // makes the same access decision it made when this ran client-side); the
    // server layer only exists to hold the Gemini key that reads the
    // paragraph and to keep the paragraph and the priors in lockstep.
    let response;
    try {
      response = await fetch("/api/about-you/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          traveler_id: travelerId,
          paragraph: paragraph || "",
        }),
      });
    } catch (fetchError) {
      setBusy(false);
      setError(
        fetchError?.message || "That did not save. Try again in a moment.",
      );
      return;
    }

    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      // 403 is the row-level-security refusal shape (server saw zero rows
      // changed). Show the same helpful wording the client-side write used
      // to show so a secondary traveler is told this is theirs to change
      // and the wall is at our end.
      if (response.status === 403) {
        setError(
          secondary
            ? "That did not save. This paragraph is yours to change, so if it keeps refusing, tell a primary traveler in the family — something is wrong at our end, not yours."
            : "That did not save. Ask a primary traveler in the family to write this one for you.",
        );
        return;
      }
      setError(payload?.error || "That did not save. Try again in a moment.");
      return;
    }
    setDone(true);
    if (first) router.replace(nextHref);
    else router.refresh();
  }

  const router = useRouter();

  return (
    <>
      {/*
        On the first-run chain -- and in practice, which walks the same chain --
        Aly asks for this herself, in the block that heads Meet Aly and the
        welcome form, so the voice does not change between one screen and the
        next. A later visit from Settings or the Family tab is somebody coming
        back to edit a field, not a conversation, and gets the plain heading.
      */}
      {first || practice ? (
        <AlyIntro
          eyebrow="About you"
          headline={
            heading
              ? `Now tell me about you, ${heading}.`
              : "Now tell me about you."
          }
          lead="Five short questions about you, not about a trip. Skip any that do not come easily."
        />
      ) : (
        <>
          <h1 className="font-display text-3xl font-semibold">About you</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Five short questions about you, not about a trip. Skip any that do
            not come easily.
          </p>
        </>
      )}

      {secondary && (
        <p className="mt-3 max-w-2xl rounded-xl border border-[var(--line)] bg-sand/40 p-3 text-sm leading-relaxed text-ink-soft">
          What you write below is yours. Your name, email and travel documents
          are looked after by a primary traveler in the family.
        </p>
      )}

      <DictationHint className="mt-5" />

      {/*
        Each of the prompts is its own card -- a sand-tinted panel with a
        border, generous inside padding, and a clear gap between cards. Before
        this the sections were separated only by vertical rhythm, and with a
        chip drawer expanded under a prompt box the next prompt's label read
        as another line of the same section. Cards give each question its own
        stage.
      */}
      <AboutSections
        parts={parts}
        setParts={setParts}
        homeLat={homeLat}
        homeLon={homeLon}
        className="mt-4"
      />

      {error && <p className="mt-4 text-sm font-semibold text-rose">{error}</p>}
      {done && !first && !practice && (
        <p className="mt-4 text-sm font-semibold text-teal">
          Saved. I will use this from my next answer on.
        </p>
      )}
      {done && practice && (
        <div className="mt-4 rounded-2xl border border-teal/40 bg-teal-soft/40 p-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-teal">
            What would have been saved
          </p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
            {aboutMeFromParts(parts) ||
              "(A blank paragraph, which stays blank.)"}
          </p>
          <p className="mt-3 text-xs text-ink-soft">
            Nothing was written to your own page. Your real About you is
            unchanged.
          </p>
          <div className="mt-4">
            <a
              href="/interview-check/interview"
              className="btn btn-primary px-4 py-2 text-sm"
            >
              Continue to the interview
            </a>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={busy || !hasAnyText}
        >
          {busy
            ? "Saving…"
            : practice
              ? "Show what would save"
              : first
                ? "Save and get started"
                : "Save"}
        </button>
        {first && !practice && (
          // A plain link rather than a button, and a form post rather than a
          // fetch: the cookie has to be set by the server, and the only thing
          // this does is get out of the way. The hidden next field tells the
          // server-side skip handler where to send them after the cookie is
          // set -- so a first-login skip still lands on the interview.
          <form action="/api/about-you/skip" method="post">
            <input type="hidden" name="next" value={nextHref} />
            <button className="btn btn-ghost" type="submit">
              Skip for now
            </button>
          </form>
        )}
        {practice && (
          <a href="/interview-check" className="btn btn-ghost">
            Back to practice
          </a>
        )}
      </div>
    </>
  );
}
