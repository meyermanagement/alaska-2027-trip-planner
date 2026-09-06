"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { slotLabel } from "@/lib/travelers/slots";
import { SPECIES, speciesLabel } from "@/lib/pets/pets";
import HomePicker from "@/components/HomePicker";

// Every id below is invented by the client and never leaves the rehearsal. They
// look like real uuids so the model does not treat them as placeholder text and
// try to swap them out for something "proper".
const NEW_PERSON = "00000000-0000-4000-8000-000000000001";
const rehearsalPersonId = (i) =>
  `00000000-0000-4000-8000-00000000000${(i + 1).toString(16)}`;
const rehearsalPetId = (i) => `00000000-0000-4000-8000-0000000000${10 + i}`;

// How the interview is opened. The same words the Get to know button sends, so
// what happens here is what happens there.
function opener(name, self) {
  return self
    ? "Get to know me. Ask me the next thing you need."
    : `Get to know ${name}. Ask the next thing you need, and I will answer for ${name} or hand them the phone.`;
}

function Chips({ label, slots, tone }) {
  if (!slots || slots.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-ink-soft">{label}</span>
      {slots.map((slot) => (
        <span
          key={slot}
          className="rounded-full px-1.5 py-0.5 text-[11px]"
          style={{ background: tone }}
        >
          {slotLabel(slot)}
        </span>
      ))}
    </span>
  );
}

function Standing({ standing, count }) {
  if (!standing) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="font-semibold text-ink">{standing.known}% known</span>
      <Chips
        label="answered"
        slots={standing.settled}
        tone="var(--color-teal-soft)"
      />
      <Chips
        label="asked"
        slots={standing.asking}
        tone="var(--color-sand-deep)"
      />
      <Chips
        label="in their own words"
        slots={standing.told}
        tone="var(--color-teal-soft)"
      />
      <Chips
        label="left alone"
        slots={standing.skipped}
        tone="var(--color-sand-deep)"
      />
      {typeof count === "number" && count > 0 && (
        <span className="text-ink-soft">
          {count} {count === 1 ? "answer" : "answers"} so far
        </span>
      )}
    </div>
  );
}

const TITLES = {
  add_preference: "Would save a preference",
  add_favorite_moment: "Would save a favorite moment",
  record_household_fact: "Would save a fact",
  set_person_details: "Would fill in their own page",
  add_person: "Would add a person",
  add_pet: "Would add an animal",
  update_pet: "Would update an animal",
  set_pet_trip: "Would say whether the animal travels",
  add_rewards_program: "Would add a program to the Wallet",
  update_rewards_program: "Would update a program in the Wallet",
};

function fileLines(a) {
  const skip = new Set(["whose", "name", "slot", "body", "reason", "note"]);
  return Object.entries(a)
    .filter(
      ([k, v]) => !skip.has(k) && v !== null && v !== undefined && v !== "",
    )
    .map(([k, v]) => [
      k.replace(/_/g, " "),
      Array.isArray(v) ? v.join(", ") : String(v),
    ])
    .filter(([, v]) => v.length > 0)
    .slice(0, 8);
}

function Call({ call }) {
  const a = call.args || {};
  const refused = Boolean(call.refused);
  const title =
    TITLES[call.name] ||
    (call.name === "set_slot_status"
      ? a.status === "skipped"
        ? "Would stop asking this"
        : "Would mark this answered"
      : call.name);
  return (
    <div
      className={`rounded-lg border p-2.5 text-xs ${
        refused ? "border-rose/40 bg-rose/5" : "border-teal/30 bg-teal/[0.04]"
      }`}
    >
      <p className="font-semibold text-ink">
        {title}
        {a.slot ? ` · ${slotLabel(a.slot)}` : ""}
      </p>
      {(a.whose || a.name) && !a.body && (
        <p className="mt-1 text-ink">{a.whose || a.name}</p>
      )}
      {a.body && <p className="mt-1 text-ink">{a.body}</p>}
      {TITLES[call.name] &&
        call.name !== "add_preference" &&
        call.name !== "record_household_fact" &&
        fileLines(a).map(([k, v]) => (
          <p className="mt-1 text-ink" key={k}>
            <span className="text-ink-soft">{k}: </span>
            {v}
          </p>
        ))}
      {a.reason && <p className="mt-1 text-ink-soft">Because: {a.reason}</p>}
      {a.note && <p className="mt-1 text-ink-soft">Note: {a.note}</p>}
      {refused && (
        <p className="mt-1 font-semibold text-rose">Refused. {call.refused}</p>
      )}
    </div>
  );
}

function Exchange({ index, asked, answer, calls, pending }) {
  return (
    <section className="card mt-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="section-label">Question {index}</p>
        <p className="text-[11px] text-ink-soft">
          {[
            asked.model,
            asked.seconds ? `${asked.seconds}s` : null,
            asked.handed
              ? `about ${slotLabel(asked.handed).toLowerCase()}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">
        {asked.reply}
      </p>
      {asked.wordless && (
        <p className="mt-1.5 text-xs text-rose">
          Those are not their words. The model came back with nothing at all,
          twice, and the line above is what the app says when it has lost a
          turn.
        </p>
      )}
      {!asked.wordless && !asked.reply.includes("?") && (
        <p className="mt-1.5 text-xs text-amber">
          No question in it, so nothing was marked as asked.
        </p>
      )}
      {asked.askedAgain && (
        <p className="mt-1.5 text-xs text-ink-soft">
          Came back as cards alone; the words above are the second attempt.
        </p>
      )}
      {asked.failed && <p className="mt-2 text-xs text-rose">{asked.failed}</p>}
      {answer != null && (
        <>
          <p className="section-label mt-3">Your answer</p>
          <p className="mt-1 rounded-lg bg-sand/60 p-2.5 text-sm text-ink">
            {answer}
          </p>
        </>
      )}
      {calls?.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="section-label">What that would have written down</p>
          {calls.map((call, i) => (
            <Call call={call} key={i} />
          ))}
        </div>
      )}
      {answer != null && !calls?.length && (
        <p className="mt-2 text-xs text-ink-soft">
          Nothing would have been written down from that one.
        </p>
      )}
      {pending && (
        <p className="mt-3 text-xs text-ink-soft">
          Waiting on your answer, in the box below.
        </p>
      )}
    </section>
  );
}

/**
 * The practice screen, run end to end as a brand-new user would live it.
 *
 * Two phases. In the first, the family fills out the welcome form: where they
 * live, who is in the family, any animals -- exactly the same three questions
 * that run on a real first login. In the second, Aly opens the interview
 * against what they just typed, so her first question is not "who else is
 * here" but the first real question of the interview: about them.
 *
 * Nothing is written down. The typed form is held in memory and sent along on
 * every turn as a synthetic family; the answers Aly would save show under the
 * question that prompted them.
 */
export default function RehearsalBody({ myName = "" }) {
  const [phase, setPhase] = useState("setup"); // "setup" | "interview"

  const [address, setAddress] = useState("");
  const [located, setLocated] = useState(null);
  const [people, setPeople] = useState([{ name: myName || "" }, { name: "" }]);
  const [pets, setPets] = useState([{ name: "", species: "dog" }]);

  // Interview state
  const [turns, setTurns] = useState([]);
  const [carried, setCarried] = useState(null);
  const [standing, setStanding] = useState(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const box = useRef(null);

  const cleanPeople = useMemo(
    () =>
      people
        .map((p, i) => ({
          id: i === 0 ? NEW_PERSON : rehearsalPersonId(i),
          name: (p.name || "").trim(),
        }))
        .filter((p) => p.name),
    [people],
  );
  const cleanPets = useMemo(
    () =>
      pets
        .map((p, i) => ({
          id: rehearsalPetId(i),
          name: (p.name || "").trim(),
          species: p.species || "other",
        }))
        .filter((p) => p.name),
    [pets],
  );
  const home = useMemo(() => {
    const typed = (address || "").trim();
    if (!typed) return null;
    if (located && located.address === typed) {
      return {
        address: typed,
        lat: located.lat,
        lon: located.lon,
        precise: located.precise === true,
      };
    }
    return { address: typed, lat: null, lon: null, precise: false };
  }, [address, located]);

  const first = cleanPeople[0]?.name?.split(" ")[0] || "";
  // On practice, the person answering is always the account holder.
  const self = true;
  const primaryId = cleanPeople[0]?.id || NEW_PERSON;
  const started = turns.length > 0;
  const waiting = started && !done;

  useEffect(() => {
    if (waiting && !busy) box.current?.focus();
  }, [waiting, busy, turns.length]);

  function setPerson(i, patch) {
    setPeople((all) => all.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }
  function addPerson() {
    setPeople((all) => [...all, { name: "" }]);
  }
  function removePerson(i) {
    setPeople((all) => all.filter((_, n) => n !== i));
  }
  function setPet(i, patch) {
    setPets((all) => all.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }
  function addPet() {
    setPets((all) => [...all, { name: "", species: "dog" }]);
  }
  function removePet(i) {
    setPets((all) => all.filter((_, n) => n !== i));
  }

  async function send(said) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/rehearse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelerId: primaryId,
          said,
          history: turns.flatMap((t) => [
            { role: "user", text: t.said },
            { role: "assistant", text: t.reply },
          ]),
          carried: carried || {},
          blank: true,
          people: cleanPeople,
          pets: cleanPets,
          home,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "That did not work.");
      setTurns((all) => [...all, data.turn]);
      setCarried(data.carried);
      setStanding(data.standing);
      setAnswer("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startInterview() {
    if (!first) {
      setError("At least one name.");
      return;
    }
    setError(null);
    setPhase("interview");
    send(opener(first, self));
  }

  function restart() {
    setTurns([]);
    setCarried(null);
    setStanding(null);
    setAnswer("");
    setError(null);
    setDone(false);
    setPhase("setup");
  }

  const wrote = carried || { preferences: [], facts: [] };
  const savedCount =
    (wrote.preferences?.length || 0) + (wrote.facts?.length || 0);

  return (
    <>
      {phase === "setup" && (
        <div className="mt-5 space-y-4">
          <section className="card p-4">
            <p className="section-label">Where the family lives</p>
            <p className="mt-1 text-xs text-ink-soft">
              Start typing and pick from the list. If it is not there, whatever
              you type is what Aly will see.
            </p>
            <div className="mt-2">
              <HomePicker
                value={address}
                onChange={setAddress}
                onLocated={(place) => {
                  setLocated(place);
                  setAddress(place.address);
                }}
              />
            </div>
          </section>

          <section className="card p-4">
            <p className="section-label">Who is in the family</p>
            <p className="mt-1 text-xs text-ink-soft">
              The first row is you. Add anyone else who might come on a trip.
            </p>
            <div className="mt-3 space-y-2">
              {people.map((row, i) => (
                <div className="flex items-center gap-2" key={i}>
                  <input
                    className="field flex-1"
                    value={row.name}
                    onChange={(e) => setPerson(i, { name: e.target.value })}
                    placeholder={i === 0 ? "Your name" : "Their name"}
                    maxLength={60}
                  />
                  {i > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removePerson(i)}
                      aria-label={`Remove person ${i + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-3"
              onClick={addPerson}
            >
              Add another person
            </button>
          </section>

          <section className="card p-4">
            <p className="section-label">Animals in the family</p>
            <p className="mt-1 text-xs text-ink-soft">
              Even the ones that always stay home. It helps Aly know when to ask
              about a sitter.
            </p>
            <div className="mt-3 space-y-2">
              {pets.map((row, i) => (
                <div className="flex items-center gap-2" key={i}>
                  <input
                    className="field flex-1"
                    value={row.name}
                    onChange={(e) => setPet(i, { name: e.target.value })}
                    placeholder="Their name"
                    maxLength={60}
                  />
                  <select
                    className="field"
                    value={row.species}
                    onChange={(e) => setPet(i, { species: e.target.value })}
                    aria-label="Species"
                  >
                    {SPECIES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {speciesLabel(s.id)}
                      </option>
                    ))}
                  </select>
                  {i > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removePet(i)}
                      aria-label={`Remove animal ${i + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-3"
              onClick={addPet}
            >
              Add another animal
            </button>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !first}
              onClick={startInterview}
            >
              {busy ? "Aly is thinking…" : "Start the interview"}
            </button>
            <p className="text-xs text-ink-soft">
              Nothing here is written down.
            </p>
          </div>
          {error && <p className="text-sm text-rose">{error}</p>}
        </div>
      )}

      {phase === "interview" && (
        <div className="card mt-5 p-4">
          <p className="section-label">Where you stand</p>
          <div className="mt-1.5">
            <Standing standing={standing} count={turns.length - 1} />
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            {savedCount === 0
              ? "Nothing would have been written yet."
              : `${savedCount} ${
                  savedCount === 1 ? "thing" : "things"
                } would have been written. None of it was.`}
            {standing?.open?.length > 0 && (
              <>
                {" "}
                Still nothing on{" "}
                {standing.open
                  .slice(0, 5)
                  .map((slot) => slotLabel(slot).toLowerCase())
                  .join(", ")}
                {standing.open.length > 5
                  ? `, and ${standing.open.length - 5} more`
                  : ""}
                .
              </>
            )}
          </p>
          {done && (
            <p className="mt-2 text-sm text-ink-soft">
              To do this for real, sign out and back in with a new account, or
              press Get to know me on the Family screen.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!done && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDone(true)}
                disabled={busy}
              >
                That is enough
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={restart}
              disabled={busy}
            >
              Start again
            </button>
          </div>
        </div>
      )}

      {phase === "interview" &&
        turns.map((turn, i) => (
          <Exchange
            key={i}
            index={i + 1}
            asked={turn}
            answer={i + 1 < turns.length ? turns[i + 1].said : null}
            calls={i + 1 < turns.length ? turns[i + 1].calls : null}
            pending={i + 1 === turns.length && !done}
          />
        ))}

      {phase === "interview" && waiting && (
        <div className="card mt-4 p-4">
          <label
            className="block text-sm font-semibold text-ink"
            htmlFor="your-answer"
          >
            Your answer
          </label>
          <textarea
            id="your-answer"
            ref={box}
            className="field mt-1.5 min-h-[90px]"
            value={answer}
            placeholder="Say it the way you would say it out loud."
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey) &&
                answer.trim()
              )
                send(answer.trim());
            }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !answer.trim()}
              onClick={() => send(answer.trim())}
            >
              {busy ? "Aly is thinking…" : "Answer"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => send("Skip this one, I don't care.")}
            >
              Skip this one
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-rose">{error}</p>}
        </div>
      )}
    </>
  );
}
