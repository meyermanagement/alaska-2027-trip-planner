"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { assigneeColor } from "@/lib/format";
import {
  SHARED_LABEL,
  goingIds,
  prefsForTrip,
  setAsideSentence,
  whoseCounts,
  whoseName,
} from "@/lib/preferences/scope";

// Suggestions only — the topic is a free text field, so anything goes.
const TOPIC_IDEAS = [
  "Getting around",
  "Where we stay",
  "Flying",
  "Driving",
  "Money",
  "Food",
  "Pace",
  "Rooms",
  "Packing",
  "Cruises",
  "Weather",
  "Deal breakers",
];

const EXAMPLES = [
  "Public transport over a rental car in cities, rental car anywhere rural.",
  "Hotels, not camping. A resort we do not have to leave beats a cheaper room in town.",
  "Under about six hours we would rather drive than fly.",
  "Around $400 a night is our comfortable ceiling for a normal hotel, more for a special stay.",
];

export default function Preferences({
  familyId,
  travelers,
  preferences: initial,
  trips = [],
  rosters = [],
}) {
  const supabase = createClient();
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  // "" is everyone; otherwise a traveler id, or SHARED for the family's own.
  const [whose, setWhose] = useState("");
  const [tripId, setTripId] = useState("");
  // What Aly came back with, and nothing more: drafts held in the browser, never
  // written until somebody presses Save on one of them.
  const [ideas, setIdeas] = useState(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");

  const counts = useMemo(
    () => whoseCounts(prefs, travelers),
    [prefs, travelers],
  );

  // The people going on the trip being filtered by, if any.
  const going = useMemo(
    () => (tripId ? goingIds(rosters, tripId) : null),
    [rosters, tripId],
  );

  // Two filters, applied in the order they read on the screen: whose it is, then
  // whether the trip in question carries it at all.
  const shown = useMemo(() => {
    let list = prefs;
    if (whose === SHARED_LABEL) list = list.filter((p) => !p.traveler_id);
    else if (whose) list = list.filter((p) => p.traveler_id === whose);
    if (going) list = prefsForTrip(list, going);
    return list;
  }, [prefs, whose, going]);

  const aside = useMemo(
    () => (going ? setAsideSentence(prefs, going, travelers) : ""),
    [going, prefs, travelers],
  );

  const tripName = trips.find((t) => t.id === tripId)?.name || "";

  // Group under whatever topics have been used, in the order they appear.
  const groups = [];
  for (const p of shown) {
    const key = p.topic?.trim() || "";
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: key || "Anything else", items: [] };
      groups.push(group);
    }
    group.items.push(p);
  }
  groups.sort((a, b) => {
    if (!a.key) return 1;
    if (!b.key) return -1;
    return 0;
  });

  async function save(id, values) {
    setBusy(true);
    if (id) {
      const { data } = await supabase
        .from("travel_preferences")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (data) setPrefs((list) => list.map((p) => (p.id === id ? data : p)));
    } else {
      const { data } = await supabase
        .from("travel_preferences")
        .insert({ ...values, family_id: familyId })
        .select("*")
        .maybeSingle();
      if (data) setPrefs((list) => [...list, data]);
    }
    setBusy(false);
    setAdding(false);
    setEditing(null);
    router.refresh();
  }

  async function remove(pref) {
    setBusy(true);
    setPrefs((list) => list.filter((p) => p.id !== pref.id));
    await supabase.from("travel_preferences").delete().eq("id", pref.id);
    setBusy(false);
    router.refresh();
  }

  /**
   * Ask Aly what is missing, with the screen's own filters as the question.
   *
   * The name rather than the id, because the server is writing a brief and not
   * running a query, and "weight this towards Veda" is a sentence a model can act
   * on where a uuid is not.
   */
  async function askAly() {
    setAsking(true);
    setAskError("");
    setIdeas(null);
    const whoseName =
      whose === SHARED_LABEL
        ? SHARED_LABEL
        : travelers.find((t) => t.id === whose)?.name || "";
    try {
      const res = await fetch("/api/preferences/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whose: whoseName, tripId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Aly could not answer.");
      setIdeas(
        (data.suggestions || []).map((row, index) => ({
          ...row,
          key: `${index}-${row.body?.slice(0, 24)}`,
        })),
      );
    } catch (error) {
      setAskError(error?.message || "Aly could not answer just now.");
    }
    setAsking(false);
  }

  /** Take one draft off the list, saved or turned down. */
  function dropIdea(key) {
    setIdeas((list) => (list || []).filter((row) => row.key !== key));
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">
            How we like to travel
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Anything worth remembering when we plan the next one — how we get
            around, what we will and will not sleep in, what a night is worth to
            us. Write it however you like. Aly reads these when she suggests
            things.
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={askAly}
            disabled={asking}
          >
            {asking ? "Aly is thinking…" : "Ask Aly what is missing"}
          </button>
          {!adding && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditing(null);
                setAdding(true);
              }}
            >
              Add a preference
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-sand/40 p-3">
          <PreferenceForm
            travelers={travelers}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSave={(values) => save(null, values)}
          />
        </div>
      )}

      {askError && (
        <p className="no-print mt-4 rounded-xl border border-rose/30 bg-rose/5 p-3 text-sm text-rose">
          {askError}
        </p>
      )}

      {asking && (
        <p className="no-print mt-4 rounded-xl border border-[var(--line)] bg-sand/40 p-3 text-sm text-ink-soft">
          Aly is reading your trips, your reviews and what is already saved
          here, looking for the decisions she keeps having to guess at. This
          takes a few seconds.
        </p>
      )}

      {ideas && !asking && (
        <div className="no-print mt-4 space-y-3 rounded-xl border border-[var(--line)] bg-sand/40 p-3">
          <div>
            <span className="section-label">Aly&apos;s suggestions</span>
            <p className="mt-1 text-sm text-ink-soft">
              {ideas.length === 0
                ? "Nothing to add — everything Aly would want to know is already written down here."
                : "Drafts, in your words, from what Aly already knows about you. Nothing is saved until you press Save, and you can change the wording first."}
            </p>
          </div>
          {ideas.map((idea) => (
            <SuggestionCard
              key={idea.key}
              idea={idea}
              travelers={travelers}
              busy={busy}
              onSave={async (values) => {
                await save(null, values);
                dropIdea(idea.key);
              }}
              onSkip={() => dropIdea(idea.key)}
            />
          ))}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIdeas(null)}
          >
            {ideas.length === 0 ? "Close" : "Done with these"}
          </button>
        </div>
      )}

      {prefs.length > 0 && (
        <div className="no-print mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="section-label">Show</span>
            <Chip on={!whose} onClick={() => setWhose("")}>
              Everyone · {prefs.length}
            </Chip>
            {counts.map((row) => (
              <Chip
                key={row.id || "_shared"}
                on={whose === (row.id || SHARED_LABEL)}
                onClick={() => setWhose(row.id || SHARED_LABEL)}
              >
                {row.name} · {row.count}
              </Chip>
            ))}
          </div>
          {trips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="section-label">Used on</span>
              <Chip on={!tripId} onClick={() => setTripId("")}>
                Every trip
              </Chip>
              {trips.map((t) => (
                <Chip
                  key={t.id}
                  on={tripId === t.id}
                  onClick={() => setTripId(t.id)}
                >
                  {t.cover_emoji ? `${t.cover_emoji} ` : ""}
                  {t.name}
                </Chip>
              ))}
            </div>
          )}
          {tripId && (
            <p className="text-sm text-ink-soft">
              {aside
                ? `What ${tripName} is planned with: everything shared, plus the people going. ${aside}`
                : `Everyone who has a preference saved is going on ${tripName}, so all of them apply.`}
            </p>
          )}
        </div>
      )}

      {prefs.length === 0 && !adding ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-4">
          <p className="text-sm text-ink-soft">
            Nothing saved yet. The sort of thing that belongs here:
          </p>
          <ul className="mt-2 space-y-1.5">
            {EXAMPLES.map((e) => (
              <li key={e} className="text-sm text-ink-soft">
                <span aria-hidden="true" className="mr-1.5 text-ink-soft/60">
                  ·
                </span>
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-4 text-sm text-ink-soft">
          Nothing saved under that. {prefs.length}{" "}
          {prefs.length === 1 ? "preference" : "preferences"} in all — clear the
          filters above to see them.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <div key={group.key || "_none"}>
              <p className="section-label">{group.label}</p>
              <ul className="mt-1.5 space-y-2">
                {group.items.map((pref) =>
                  editing === pref.id ? (
                    <li
                      key={pref.id}
                      className="rounded-xl border border-[var(--line)] bg-sand/40 p-3"
                    >
                      <PreferenceForm
                        pref={pref}
                        travelers={travelers}
                        busy={busy}
                        onCancel={() => setEditing(null)}
                        onSave={(values) => save(pref.id, values)}
                      />
                    </li>
                  ) : (
                    <li
                      key={pref.id}
                      className="rounded-xl border border-[var(--line)] bg-white p-3"
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-line">
                        {pref.body}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3">
                        <span
                          className={`chip ${assigneeColor(
                            whoseName(pref, travelers),
                          )}`}
                        >
                          {whoseName(pref, travelers)}
                        </span>
                        <button
                          type="button"
                          className="no-print text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                          onClick={() => {
                            setAdding(false);
                            setEditing(pref.id);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="no-print text-xs font-semibold text-rose underline decoration-rose/30 underline-offset-2 hover:decoration-rose"
                          onClick={() => remove(pref)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** The filter and picker pill, in the one shape the rest of the app uses. */
function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`chip border ${
        on
          ? "border-teal bg-teal text-white"
          : "border-[var(--line)] bg-white text-ink-soft hover:border-teal/40 hover:text-teal"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One of Aly's drafts, editable in place.
 *
 * The textarea is the point. A suggestion that saved on one press would be Aly
 * writing a preference in the family's name, and the whole feature would then be
 * a machine deciding what this family is like. Editable text next to a Save
 * button means the words that get saved are words somebody has just read.
 */
function SuggestionCard({ idea, travelers, busy, onSave, onSkip }) {
  const [body, setBody] = useState(idea.body || "");
  const [topic, setTopic] = useState(idea.topic || "");
  const [travelerId, setTravelerId] = useState(idea.travelerId || "");
  const box = useRef(null);

  // The box grows to fit the sentence. Measured at 320px, where a fixed height
  // showed the first two lines of a three-line draft and hid the rest behind an
  // inner scrollbar — on the one control whose entire purpose is that nothing is
  // saved until somebody has read all of it.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    // Plus the border, because the height set here is a border-box height while
    // scrollHeight is not: without it every box sits two pixels short and the
    // last line is clipped by exactly enough to notice.
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  }, [body]);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-3">
      {idea.because && (
        <p className="text-xs text-ink-soft">Because {idea.because}</p>
      )}
      <label className="mt-2 block">
        <span className="block section-label">The preference</span>
        <textarea
          ref={box}
          className="field mt-1 min-h-20 overflow-hidden"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="block section-label">Topic</span>
          <input
            className="field mt-1"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            list="suggested-topics"
          />
          {/* Its own list: the shared one lives inside the add form, which is
              usually closed while these cards are on screen. */}
          <datalist id="suggested-topics">
            {TOPIC_IDEAS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <div>
          <span className="block section-label">Whose</span>
          <div className="mt-1 flex flex-wrap gap-2">
            <Chip on={!travelerId} onClick={() => setTravelerId("")}>
              {SHARED_LABEL}
            </Chip>
            {travelers.map((t) => (
              <Chip
                key={t.id}
                on={travelerId === t.id}
                onClick={() => setTravelerId(t.id)}
              >
                {t.name}
              </Chip>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !body.trim()}
          onClick={() =>
            onSave({
              body: body.trim(),
              topic: topic.trim() || null,
              traveler_id: travelerId || null,
            })
          }
        >
          {busy ? "Saving…" : "Save this"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onSkip}
          disabled={busy}
        >
          Not us
        </button>
      </div>
    </div>
  );
}

function PreferenceForm({ pref, travelers, busy, onCancel, onSave }) {
  const [body, setBody] = useState(pref?.body || "");
  const [topic, setTopic] = useState(pref?.topic || "");
  const [travelerId, setTravelerId] = useState(pref?.traveler_id || "");

  function submit(event) {
    event.preventDefault();
    if (!body.trim()) return;
    onSave({
      body: body.trim(),
      topic: topic.trim() || null,
      traveler_id: travelerId || null,
    });
  }

  return (
    <form onSubmit={submit} className="no-print space-y-3">
      <label className="block">
        <span className="block section-label">The preference</span>
        <textarea
          className="field mt-1 min-h-24"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Public transport over a rental car in cities, rental car anywhere rural."
          autoFocus
          required
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="block section-label">Topic (optional)</span>
          <input
            className="field mt-1"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            list="preference-topics"
            placeholder="Getting around"
          />
          <datalist id="preference-topics">
            {TOPIC_IDEAS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <div>
          <span className="block section-label">Whose</span>
          <div className="mt-1 flex flex-wrap gap-2">
            <Chip on={!travelerId} onClick={() => setTravelerId("")}>
              {SHARED_LABEL}
            </Chip>
            {travelers.map((t) => (
              <Chip
                key={t.id}
                on={travelerId === t.id}
                onClick={() => setTravelerId(t.id)}
              >
                {t.name}
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            One person, or {SHARED_LABEL} for something true of the family. A
            person&apos;s own preference is only used on the trips they are
            actually on.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
