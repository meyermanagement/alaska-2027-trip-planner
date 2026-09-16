"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AGREEMENT,
  AGREEMENT_VERSION,
  AI_DISCLOSURE,
  AI_PROVIDER,
  APP_BUILD,
  BETA_ENDS,
  DATA_CATEGORIES,
  OPTIONAL_FEATURES,
  PRIVACY_PATH,
  PRIVACY_VERSION,
  SUPPORT_EMAIL,
} from "@/lib/beta/agreement";
import BetaDeclineExit from "@/components/BetaDeclineExit";

/**
 * The six screens between signing in and being let in, and the receipt that
 * closes them.
 *
 * One component rather than six routes. The whole set is a single decision with
 * a single write at the end of it, and six routes would mean six chances to land
 * on step four with a back button, a refresh, and half an answer -- which is how
 * a half-filled consent row gets written. Nothing is saved until the last
 * Continue; before that, closing the tab means the gate is simply still there.
 *
 * Two rules hold the whole thing up:
 *
 *   - Nothing is pre-agreed. Every box starts unchecked and every optional
 *     feature starts off, including the ones that make the app better. A
 *     pre-ticked consent box is not consent, and it is the single most common way
 *     an onboarding flow fails a store review.
 *   - Saying no is a real answer. Declining AI processing carries on into the app
 *     with Aly turned off rather than stopping here, and every optional feature
 *     says out loud what happens if it is left off. A screen where refusing is a
 *     dead end is a screen that taught the tester to press the other button. That
 *     now holds for the agreement itself too: under the primary is a way to sign
 *     out, or to delete the account outright, without first agreeing to the terms
 *     being declined.
 *
 * The agreement screen will not let the age box be ticked until the text has
 * actually been scrolled to the end. It is a small friction and it is the point:
 * the record this writes says the person read it, so the screen should make that
 * closer to true than a checkbox under a folded paragraph does.
 *
 * `practice` mounts the same six screens for the practice hub with the write at
 * the end removed. Every field, every rule and every word is the one a real
 * tester meets -- including the scroll gate and the missing default on the AI
 * question -- and the last button produces the row that would have been written
 * instead of writing it. It is the only practice screen where the thing being
 * rehearsed is a legal record, which is exactly why it needs rehearsing: the
 * copy has to be read at the size and in the order a tester reads it, and the
 * primary of a household that has already agreed can otherwise never see these
 * screens again without bumping a version constant in production.
 */

const STEPS = [
  { id: "status", label: "Beta" },
  { id: "agreement", label: "Terms" },
  { id: "data", label: "Data" },
  { id: "ai", label: "Aly" },
  { id: "features", label: "Optional" },
  { id: "sharing", label: "Household" },
];

// What to say to somebody who has agreed before and is here because the
// paperwork moved. Naming the reason is the difference between a screen that
// looks like a bug and one that looks like the promise in the agreement's
// "Changes" section being kept.
/**
 * What is still missing on each screen that can hold Continue shut.
 *
 * Keyed by step so it cannot drift from `canContinue`: every index with a rule
 * there has a sentence here, and the two are meant to be read together.
 */
const BLOCKED_BECAUSE = {
  1: "Read to the end of the agreement, then tick both boxes to continue.",
  2: "Tick the box to confirm you have read what the app collects.",
  3: "Choose whether Aly may send your questions to an AI provider. There is no default, so you have to pick one.",
  5: "Tick the box to confirm you understand who in your household sees what.",
};

const GAP_NOTE = {
  agreement: "The beta agreement has been updated since you last agreed.",
  privacy: "The privacy policy has been updated since you last agreed.",
  withdrawn:
    "You withdrew your consent. Agreeing again turns your account back on.",
};

export default function BetaConsentFlow({ gap, email, existing, practice }) {
  const [step, setStep] = useState(0);

  const [agreed, setAgreed] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const [dataAcknowledged, setDataAcknowledged] = useState(false);
  const [openCategory, setOpenCategory] = useState(null);
  const [diagnostics, setDiagnostics] = useState(
    existing ? existing.diagnostics : false,
  );
  // Null until answered, so Continue on the AI screen has nothing to press. A
  // default of either true or false would be the app answering for them.
  const [aiProcessing, setAiProcessing] = useState(null);
  // Off to start. These began pre-ticked, on the argument that each is a
  // convenience performed on information the app already holds rather than a new
  // disclosure -- and that argument does not survive being written down. Two of
  // them send a household's own material to a third party: the forwarded-mail
  // parser, and the document reader, which hands a passport photograph to an
  // outside model. A switch that is already on before anybody has read it is not
  // a decision the tester made, and the first rule at the top of this file says
  // nothing is pre-agreed.
  //
  // So every one of them starts off, each says in one line what leaving it off
  // costs, and turning one on is a press. The app a tester meets first does less
  // than the app can do; that is the honest order to meet it in.
  //
  // Somebody re-agreeing keeps what they last chose: a version bump reopening
  // this gate must not quietly switch back on something they deliberately
  // turned off.
  const [features, setFeatures] = useState(() => {
    const start = {};
    for (const f of OPTIONAL_FEATURES) {
      start[f.id] = existing?.features
        ? Boolean(existing.features[f.id])
        : false;
    }
    return start;
  });
  const [sharingAcknowledged, setSharingAcknowledged] = useState(false);

  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState("");
  const [saved, setSaved] = useState(false);

  const docRef = useRef(null);

  // Whether the agreement has been scrolled to its end. Watched on the element
  // rather than checked once, because the text is short enough on a wide screen
  // that there is nothing to scroll -- and a gate that never opens because the
  // window was big is a lockout.
  useEffect(() => {
    const el = docRef.current;
    if (!el || step !== 1) return;
    function look() {
      const room = el.scrollHeight - el.clientHeight;
      if (room <= 8 || el.scrollTop >= room - 8) setReadToEnd(true);
    }
    look();
    el.addEventListener("scroll", look, { passive: true });
    return () => el.removeEventListener("scroll", look);
  }, [step]);

  const canContinue = useMemo(() => {
    if (step === 1) return agreed && ageConfirmed;
    if (step === 2) return dataAcknowledged;
    if (step === 3) return aiProcessing !== null;
    if (step === 5) return sharingAcknowledged;
    return true;
  }, [
    step,
    agreed,
    ageConfirmed,
    dataAcknowledged,
    aiProcessing,
    sharingAcknowledged,
  ]);

  async function save() {
    if (saving) return;
    // Practice stops here. Not "posts and ignores the answer" and not "posts to a
    // different route": the consent table is append-only by trigger, so a
    // rehearsal that reached the endpoint would leave a real row in a real
    // history saying this person agreed today, which is the one thing this
    // record must never say wrongly.
    if (practice) {
      setSaved(true);
      return;
    }
    setSaving(true);
    setFailed("");
    try {
      const res = await fetch("/api/beta/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreed,
          ageConfirmed,
          dataAcknowledged,
          aiProcessing: aiProcessing === true,
          diagnostics,
          features,
          sharingAcknowledged,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Could not record that.");
      }
      // A session that expired while these screens were open does not fail: the
      // gate in middleware answers an unauthenticated POST with a redirect to the
      // login page, which arrives as a perfectly successful page of HTML. Taking
      // res.ok for an answer would have drawn the receipt for a consent that was
      // never written, which is the one lie this whole flow exists to prevent. So
      // the route's own word is what counts.
      if (body?.ok !== true) {
        throw new Error(
          "Your session ended while you were reading. Sign in again and the screens will pick up where they were.",
        );
      }
      setSaved(true);
    } catch (err) {
      setFailed(
        err?.message === "Failed to fetch"
          ? "No connection. Nothing was recorded, so try again when you have one."
          : err?.message || "Could not record that.",
      );
    } finally {
      setSaving(false);
    }
  }

  function onward() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    save();
  }

  if (saved) {
    return practice ? (
      <PracticeRecap
        email={email}
        agreed={agreed}
        ageConfirmed={ageConfirmed}
        dataAcknowledged={dataAcknowledged}
        aiProcessing={aiProcessing === true}
        diagnostics={diagnostics}
        features={features}
        sharingAcknowledged={sharingAcknowledged}
      />
    ) : (
      <Receipt
        email={email}
        aiProcessing={aiProcessing === true}
        diagnostics={diagnostics}
        features={features}
      />
    );
  }

  return (
    <div>
      <p className="section-label">Beta tester setup</p>
      <Progress step={step} />

      {/* Said once, at the top, and then not repeated on every screen. A
          rehearsal of a consent flow that keeps interrupting itself to say it is
          a rehearsal is no longer a rehearsal of the flow. */}
      {practice && step === 0 && (
        <p className="mt-4 rounded-xl border border-[var(--line)] bg-white/60 px-4 py-3 text-sm text-ink">
          Practice. Nothing here is recorded on your account, and your own
          agreement is not touched. The last screen shows the row a real tester
          would have written.
        </p>
      )}

      {gap && GAP_NOTE[gap] && step === 0 && (
        <p className="mt-4 rounded-xl border border-[var(--line)] bg-white/60 px-4 py-3 text-sm text-ink">
          {GAP_NOTE[gap]}
        </p>
      )}

      {step === 0 && <Status />}
      {step === 1 && (
        <Agreement
          docRef={docRef}
          readToEnd={readToEnd}
          agreed={agreed}
          setAgreed={setAgreed}
          ageConfirmed={ageConfirmed}
          setAgeConfirmed={setAgeConfirmed}
        />
      )}
      {step === 2 && (
        <YourData
          open={openCategory}
          setOpen={setOpenCategory}
          diagnostics={diagnostics}
          setDiagnostics={setDiagnostics}
          acknowledged={dataAcknowledged}
          setAcknowledged={setDataAcknowledged}
        />
      )}
      {step === 3 && (
        <AiChoice choice={aiProcessing} setChoice={setAiProcessing} />
      )}
      {step === 4 && <Features features={features} setFeatures={setFeatures} />}
      {step === 5 && (
        <Sharing
          acknowledged={sharingAcknowledged}
          setAcknowledged={setSharingAcknowledged}
        />
      )}

      {failed && (
        <p role="alert" className="mt-4 text-sm text-rose">
          {failed}
        </p>
      )}

      <div className="mt-7 flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => {
              setStep(step - 1);
              window.scrollTo({ top: 0 });
            }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canContinue || saving}
          onClick={onward}
        >
          {saving
            ? "Recording\u2026"
            : step < STEPS.length - 1
              ? "Continue"
              : practice
                ? "Show what would be recorded"
                : "Agree and start testing"}
        </button>
      </div>

      {/* Why the button is dead, on every screen that can hold it shut.

          This used to say only "scroll to the end of the agreement", which left
          the other three gated screens with a greyed-out button and no
          explanation -- worst on the Aly screen, where the two options are
          deliberately given no default, so the button is disabled the moment
          the screen opens and nothing on it says why. A disabled primary with
          no reason next to it reads as a broken app, and on a consent screen
          the reader's next move is to stop trusting the thing asking. */}
      {!canContinue && BLOCKED_BECAUSE[step] && (
        <p className="mt-3 text-xs text-ink-soft">{BLOCKED_BECAUSE[step]}</p>
      )}

      {/* The answer to the one question these screens never had an answer for.

          Declining a question here is a real answer -- turn Aly off and you carry
          on -- but declining the agreement itself had nowhere to go. Chromeless
          screen, dead Continue, no menu: the only way to say no was to close the
          tab, which leaves the account and the household the sign-in created
          sitting there holding data nobody agreed to store. A gate whose only
          exit is the button you did not want to press is not asking.

          Quiet and last, under the primary rather than beside it. It is a way out
          for somebody who has decided, not a second option competing with
          Continue for somebody who has not. */}
      <BetaDeclineExit practice={practice} />
    </div>
  );
}

/**
 * Where they are in the set.
 *
 * A count and a bar rather than six named chips. The chips were honest and they
 * wrapped onto a second line on a phone, which turned "this is nearly over" into
 * a block of little pills -- and the names of the steps are not information
 * somebody at step two can use. What they want to know is how many are left.
 */
function Progress({ step }) {
  const done = (step / (STEPS.length - 1)) * 100;
  return (
    <div className="mt-3">
      <p className="text-xs text-ink-soft">
        Step {step + 1} of {STEPS.length} &middot; {STEPS[step].label}
      </p>
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--line)]"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
      >
        <div
          className="h-full rounded-full bg-[var(--color-teal)] transition-[width] duration-300"
          style={{ width: `${Math.max(done, 6)}%` }}
        />
      </div>
    </div>
  );
}

function Heading({ children, sub }) {
  return (
    <>
      <h1 className="mt-4 font-display text-3xl font-semibold">{children}</h1>
      {sub && <p className="mt-2 text-sm text-ink-soft">{sub}</p>}
    </>
  );
}

function Status() {
  return (
    <section>
      <Heading sub="Three things to know before anything else.">
        You are testing an unfinished app
      </Heading>
      <dl className="mt-5 space-y-3">
        <Fact term="Build" detail={APP_BUILD} />
        <Fact term="Stops working" detail={BETA_ENDS} />
        <Fact
          term="Something broken"
          detail={`Report it from any screen, or write to ${SUPPORT_EMAIL}.`}
        />
      </dl>
      <p className="mt-5 text-sm text-ink">
        The next five screens are the paperwork: what you are agreeing to, what
        the app collects, whether Aly may send your questions to an AI provider,
        and which optional parts you want on. Nothing is recorded until the end.
      </p>
    </section>
  );
}

function Fact({ term, detail }) {
  return (
    <div className="flex flex-wrap gap-x-2 text-sm">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {term}
      </dt>
      <dd className="min-w-0 flex-1">{detail}</dd>
    </div>
  );
}

function Agreement({
  docRef,
  readToEnd,
  agreed,
  setAgreed,
  ageConfirmed,
  setAgeConfirmed,
}) {
  return (
    <section>
      <Heading sub={`Version ${AGREEMENT_VERSION}. Thirteen short sections.`}>
        Beta participation agreement
      </Heading>
      <div
        ref={docRef}
        tabIndex={0}
        className="card mt-4 max-h-[46vh] overflow-y-auto px-4 py-4"
      >
        {AGREEMENT.map((s) => (
          <div key={s.id} className="mb-4 last:mb-0">
            <h2 className="text-sm font-semibold text-ink">{s.heading}</h2>
            <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
          </div>
        ))}
        <p className="mt-5 border-t border-[var(--line)] pt-3 text-xs text-ink-soft">
          That is the end of the agreement.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <Check
          checked={agreed}
          onChange={setAgreed}
          label="I have read and agree to the beta participation agreement."
        />
        <Check
          checked={ageConfirmed}
          onChange={setAgeConfirmed}
          disabled={!readToEnd}
          label="I am 18 or older and I am agreeing on my own behalf."
          note={
            readToEnd
              ? "A teenager in your household can use the app on an account you set up. They cannot accept this."
              : "Available once you have scrolled to the end."
          }
        />
      </div>
    </section>
  );
}

function YourData({
  open,
  setOpen,
  diagnostics,
  setDiagnostics,
  acknowledged,
  setAcknowledged,
}) {
  return (
    <section>
      <Heading sub="Seven kinds of information, what each is for, and how long it stays.">
        What the app collects
      </Heading>

      <ul className="mt-4 space-y-2">
        {DATA_CATEGORIES.map((c) => {
          const isOpen = open === c.id;
          return (
            <li key={c.id} className="card overflow-hidden px-0 py-0">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : c.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-ink">
                  {c.title}
                </span>
                <span className="shrink-0 text-xs text-ink-soft">
                  {isOpen ? "Hide" : "Details"}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-[var(--line)] px-4 py-3">
                  <Line term="What" detail={c.what} />
                  <Line term="Why" detail={c.why} />
                  <Line term="Kept" detail={c.kept} />
                  {c.review && (
                    <p className="mt-2 text-xs text-ink-soft">
                      While the beta runs, someone on our side may read this to
                      work out what went wrong.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5">
        <Check
          checked={diagnostics}
          onChange={setDiagnostics}
          label="Send crash reports and timings."
          note="Off unless you turn it on. It is how broken screens get found, so it helps — and you can change it here or in Settings at any time."
        />
      </div>

      {/* Opens in its own tab rather than navigating, because leaving this screen
          mid-flow would throw away five screens of answers that are not written
          until the last one. The page it opens draws these same seven categories
          from the same array, so nothing is worded twice. */}
      <p className="mt-5 text-sm text-ink-soft">
        <a
          className="underline"
          href={PRIVACY_PATH}
          target="_blank"
          rel="noreferrer"
        >
          Read the full privacy policy
        </a>
      </p>

      <div className="mt-4">
        <Check
          checked={acknowledged}
          onChange={setAcknowledged}
          label="I have read what the app collects and why."
        />
      </div>
    </section>
  );
}

function Line({ term, detail }) {
  return (
    <p className="mt-1 text-sm text-ink-soft first:mt-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {term}
      </span>{" "}
      {detail}
    </p>
  );
}

/**
 * The one screen with no default and no way past it without an answer.
 *
 * Apple's guideline 5.1.2(i) wants sharing personal data with a third-party AI
 * disclosed and explicitly permitted before it happens. So the provider is named,
 * what leaves the app is listed next to what does not, and both buttons carry on
 * into the app -- because a choice where one branch is a dead end is not one.
 */
function AiChoice({ choice, setChoice }) {
  return (
    <section>
      <Heading
        sub={`Aly runs on ${AI_PROVIDER}, which is not us. Read this, then choose at the bottom.`}
      >
        Aly and your information
      </Heading>

      <div className="card mt-4 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Sent when you ask her something
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
          {AI_DISCLOSURE.sent.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Never sent
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
          {AI_DISCLOSURE.notSent.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {/* The file exception, said plainly under the list it qualifies rather
            than left as a clause somebody has to notice. */}
        <p className="mt-3 text-sm text-ink-soft">{AI_DISCLOSURE.aside}</p>
        <ul className="mt-4 list-disc space-y-1 border-t border-[var(--line)] pl-5 pt-3 text-sm text-ink-soft">
          {AI_DISCLOSURE.terms.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-sm text-ink">
        She can be confidently wrong. Check visas, entry rules, insurance, and
        anything medical against the airline, the consulate, or the insurer
        before you act on it.
      </p>

      <div className="mt-5 space-y-3" role="radiogroup" aria-label="Aly">
        <Choice
          selected={choice === true}
          onSelect={() => setChoice(true)}
          title="Turn Aly on"
          detail={`My questions and the trip context may be sent to ${AI_PROVIDER}.`}
        />
        <Choice
          selected={choice === false}
          onSelect={() => setChoice(false)}
          title="Keep Aly off"
          detail="Nothing is sent to an AI provider. Trips, packing, documents, and reminders all work; suggestions and Ask Aly are unavailable until you turn her on in Settings."
        />
      </div>
    </section>
  );
}

function Features({ features, setFeatures }) {
  return (
    <section>
      <Heading sub="All off to start. Turn on whichever of these you want Aly to do for you; each one says what leaving it off costs.">
        Optional parts
      </Heading>
      <ul className="mt-4 space-y-2">
        {OPTIONAL_FEATURES.map((f) => (
          <li key={f.id} className="card px-4 py-3">
            <Check
              checked={Boolean(features[f.id])}
              onChange={(v) => setFeatures({ ...features, [f.id]: v })}
              label={f.title}
              note={f.detail}
            />
            <p className="mt-2 pl-7 text-xs text-ink-soft">
              Left off: {f.without}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sharing({ acknowledged, setAcknowledged }) {
  return (
    <section>
      <Heading sub="A household shares one set of trips, and that cuts both ways.">
        Who sees what you add
      </Heading>
      <ul className="mt-4 space-y-2 text-sm text-ink">
        <li className="card px-4 py-3">
          Every signed-in member of your household can read and edit the trips,
          bookings, and documents in it. There is no per-item privacy.
        </li>
        <li className="card px-4 py-3">
          No other household can see any of it, and nothing is public. Trips are
          not shared, sold, or used to advertise.
        </li>
        <li className="card px-4 py-3">
          Adding somebody else&rsquo;s passport, birth date, or itinerary means
          handling their information. Ask them first.
        </li>
      </ul>
      <div className="mt-5">
        <Check
          checked={acknowledged}
          onChange={setAcknowledged}
          label="I understand, and I will only add other people's details with their say-so."
        />
      </div>
    </section>
  );
}

function Receipt({ email, aiProcessing, diagnostics, features }) {
  const on = OPTIONAL_FEATURES.filter((f) => features[f.id]).map(
    (f) => f.title,
  );
  return (
    <div>
      <p className="section-label">Recorded</p>
      <Heading sub="A copy of this is kept on your account and shown in Settings.">
        You are set up
      </Heading>
      <dl className="card mt-5 space-y-3 px-4 py-4">
        <Fact term="Account" detail={email} />
        <Fact term="Agreement" detail={`Version ${AGREEMENT_VERSION}`} />
        <Fact term="Build" detail={APP_BUILD} />
        <Fact
          term="Aly"
          detail={
            aiProcessing
              ? `On. Questions may be sent to ${AI_PROVIDER}.`
              : "Off. Nothing is sent to an AI provider."
          }
        />
        <Fact term="Diagnostics" detail={diagnostics ? "On" : "Off"} />
        <Fact
          term="Optional parts"
          detail={on.length ? on.join(", ") : "None"}
        />
      </dl>
      <p className="mt-4 text-sm text-ink-soft">
        Every one of these can be changed in Settings, including turning Aly off
        again and deleting your account.
      </p>
      <a className="btn btn-primary mt-6" href="/auth/land">
        Meet Aly
      </a>
    </div>
  );
}

/**
 * What the last Continue would have written, for practice.
 *
 * The real receipt is written for somebody who has just agreed: it confirms, in
 * their words, the few things they will want to check later. This one is written
 * for whoever is testing the flow, so it names the columns -- the same ones
 * beta_consents holds and beta_consent_events copies -- because the question
 * being asked here is whether the screens and the record agree with each other.
 */
function PracticeRecap({
  email,
  agreed,
  ageConfirmed,
  dataAcknowledged,
  aiProcessing,
  diagnostics,
  features,
  sharingAcknowledged,
}) {
  const on = OPTIONAL_FEATURES.filter((f) => features[f.id]).map(
    (f) => f.title,
  );
  const yes = (v) => (v ? "Yes" : "No");
  return (
    <div>
      <p className="section-label">Practice</p>
      <Heading sub="Nothing was recorded. This is the row the last button would have written.">
        What would be recorded
      </Heading>
      <dl className="card mt-5 space-y-3 px-4 py-4">
        <Fact term="Account" detail={email} />
        <Fact term="Agreement version" detail={AGREEMENT_VERSION} />
        <Fact term="Privacy version" detail={PRIVACY_VERSION} />
        <Fact term="Build" detail={APP_BUILD} />
        <Fact term="Agreed" detail={yes(agreed)} />
        <Fact term="18 or older" detail={yes(ageConfirmed)} />
        <Fact term="Read what is collected" detail={yes(dataAcknowledged)} />
        <Fact
          term="Aly"
          detail={
            aiProcessing
              ? `Permitted. Provider recorded as ${AI_PROVIDER}.`
              : "Declined. Nothing would be sent to an AI provider."
          }
        />
        <Fact term="Diagnostics" detail={diagnostics ? "On" : "Off"} />
        <Fact
          term="Optional parts"
          detail={on.length ? on.join(", ") : "None"}
        />
        <Fact term="Household understood" detail={yes(sharingAcknowledged)} />
      </dl>
      <p className="mt-4 text-sm text-ink-soft">
        A real run also stamps the time it was accepted, and lands a matching
        entry in the consent history, which nobody can edit or delete
        afterwards.
      </p>
      <a className="btn btn-primary mt-6" href="/interview-check">
        Back to practice
      </a>
    </div>
  );
}

function Check({ checked, onChange, label, note, disabled }) {
  return (
    <label
      className={`flex items-start gap-3 text-sm ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-teal)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="text-ink">{label}</span>
        {note && (
          <span className="mt-1 block text-xs text-ink-soft">{note}</span>
        )}
      </span>
    </label>
  );
}

/**
 * One of a pair of mutually exclusive answers.
 *
 * The dot earns its place. Without it these were two cards holding a bold line
 * and a grey line, which is exactly what the explanatory cards higher up the
 * same screen look like -- so the pair read as more things to read rather than
 * a question to answer, and the only hint that anything had been chosen was a
 * ring that nobody looks for on a card they have not realized is a control.
 * An empty circle is the one shape that says "pick one" before it is touched.
 */
function Choice({ selected, onSelect, title, detail }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`card flex w-full items-start gap-3 px-4 py-3 text-left ${
        selected ? "ring-2 ring-[var(--color-teal)]" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
          selected
            ? "border-[var(--color-teal)]"
            : "border-[var(--line-strong)]"
        }`}
      >
        {selected && (
          <span className="block h-2.5 w-2.5 rounded-full bg-[var(--color-teal)]" />
        )}
      </span>
      <span className="block">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-sm text-ink-soft">{detail}</span>
      </span>
    </button>
  );
}
