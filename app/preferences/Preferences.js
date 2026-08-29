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
import {
  NO_TOPIC_LABEL,
  TOPICS_MAX,
  cleanTopic,
  groupPreferences,
  hasTopic,
  mergeSuggestions,
  normalizeTopic,
  renameEffect,
  renamePlan,
  spellingHints,
  topicChoices,
  topicPatch,
  topicsInUse,
  topicsOf,
  withTopic,
  withoutTopic,
} from "@/lib/preferences/topics";

/**
 * The filter value meaning "the ones filed under nothing".
 *
 * A sentinel rather than "", because "" is already how the row says "all of
 * them", and normalizeTopic returns "" for a blank topic — so without this the
 * chip for no topic and the chip for every topic would be the same chip.
 */
const NO_TOPIC_KEY = "\u0000none";

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
  // A topic's comparable form, or "" for all of them, or NO_TOPIC_KEY for the
  // ones filed under nothing.
  const [topicKey, setTopicKey] = useState("");
  // Which topic's own rename box is open, and what has been typed into it.
  const [renaming, setRenaming] = useState(null);
  // Suggestions turned down in this sitting. Not saved: an offer worth making
  // once is worth making again next month, and a table to remember a dismissal
  // is a schema change to hold an opinion somebody had for four seconds.
  const [ignored, setIgnored] = useState([]);
  // What Aly came back with, and nothing more: drafts held in the browser, never
  // written until somebody presses Save on one of them.
  const [ideas, setIdeas] = useState(null);
  // True when Aly had nothing of theirs to reason from and these are the ordinary
  // decisions every trip needs instead.
  const [starter, setStarter] = useState(false);
  // Which question the cards on screen are answering, so the wording above them
  // matches the button that was actually pressed.
  const [askedFor, setAskedFor] = useState("missing");
  // Which button is running, so the one that was pressed is the one that says so.
  const [asking, setAsking] = useState("");
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

  // Three filters, applied in the order they read on the screen: whose it is,
  // whether the trip in question carries it at all, then what it is about.
  const shown = useMemo(() => {
    let list = prefs;
    if (whose === SHARED_LABEL) list = list.filter((p) => !p.traveler_id);
    else if (whose) list = list.filter((p) => p.traveler_id === whose);
    if (going) list = prefsForTrip(list, going);
    if (topicKey === NO_TOPIC_KEY)
      list = list.filter((p) => topicsOf(p).length === 0);
    else if (topicKey)
      list = list.filter((p) =>
        topicsOf(p).some((t) => normalizeTopic(t) === topicKey),
      );
    return list;
  }, [prefs, whose, going, topicKey]);

  const aside = useMemo(
    () => (going ? setAsideSentence(prefs, going, travelers) : ""),
    [going, prefs, travelers],
  );

  const tripName = trips.find((t) => t.id === tripId)?.name || "";

  // Grouped in planning order, the same every time it is drawn. A preference
  // about two things appears under both, and says so.
  const groups = useMemo(() => groupPreferences(shown), [shown]);

  // The filter row counts every preference, not the filtered ones: a chip that
  // reads "Food · 2" and then shows nothing because a different filter is also on
  // is a chip that lied about what pressing it would do. So these are counted
  // against what the other two filters have already left.
  const beforeTopic = useMemo(() => {
    let list = prefs;
    if (whose === SHARED_LABEL) list = list.filter((p) => !p.traveler_id);
    else if (whose) list = list.filter((p) => p.traveler_id === whose);
    if (going) list = prefsForTrip(list, going);
    return list;
  }, [prefs, whose, going]);

  const topicChips = useMemo(() => topicsInUse(beforeTopic), [beforeTopic]);
  const untopiced = useMemo(
    () => beforeTopic.filter((p) => topicsOf(p).length === 0).length,
    [beforeTopic],
  );

  // Tidying is offered against everything saved, never against the filtered
  // view: "these two topics are the same thing" is a fact about the record, and
  // an offer that appears and disappears as filters change would be an offer
  // about the filters.
  const tidy = useMemo(() => {
    const rows = [
      ...mergeSuggestions(prefs).map((row) => ({ ...row, kind: "merge" })),
      ...spellingHints(prefs).map((row) => ({
        ...row,
        kind: "spelling",
        fromKey: row.key,
      })),
    ];
    return rows.filter(
      (row) => !ignored.includes(`${row.kind}:${row.fromKey}`),
    );
  }, [prefs, ignored]);

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

  /**
   * Rename one topic everywhere it appears, or take it off.
   *
   * The whole point of the feature: fixing a spelling used by five preferences
   * was five trips through the edit form, which is why "Restaurans" survived
   * being typed twice. The rows to write are worked out by renamePlan so that the
   * screen, and Aly, and anything later, rename in exactly the same way.
   */
  async function renameTopic(from, next) {
    const plan = renamePlan(prefs, from, next);
    if (!plan.length) {
      setRenaming(null);
      return;
    }
    setBusy(true);
    // Optimistically, because there is no single row to wait on and a list that
    // reorders itself several seconds after the button was pressed reads as a
    // different bug.
    const byId = new Map(plan.map((row) => [row.id, row]));
    setPrefs((list) =>
      list.map((p) =>
        byId.has(p.id)
          ? { ...p, topics: byId.get(p.id).topics, topic: byId.get(p.id).topic }
          : p,
      ),
    );
    const stamp = new Date().toISOString();
    await Promise.all(
      plan.map((row) =>
        supabase
          .from("travel_preferences")
          .update({ topics: row.topics, topic: row.topic, updated_at: stamp })
          .eq("id", row.id),
      ),
    );
    setBusy(false);
    setRenaming(null);
    // If the topic being filtered by is the one that just moved, follow it rather
    // than leaving the screen filtered to a heading that no longer exists.
    if (topicKey === normalizeTopic(from))
      setTopicKey(next ? normalizeTopic(next) : "");
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
  async function askAly(mode) {
    setAsking(mode);
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
        body: JSON.stringify({ mode, whose: whoseName, tripId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Aly could not answer.");
      setStarter(Boolean(data.starter));
      setAskedFor(data.mode === "ideas" ? "ideas" : "missing");
      setIdeas(
        (data.suggestions || []).map((row, index) => ({
          ...row,
          key: `${index}-${row.body?.slice(0, 24)}`,
        })),
      );
    } catch (error) {
      setAskError(error?.message || "Aly could not answer just now.");
    }
    setAsking("");
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
            onClick={() => askAly("ideas")}
            disabled={Boolean(asking)}
          >
            {asking === "ideas" ? "Aly is thinking…" : "Ask Aly for ideas"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => askAly("missing")}
            disabled={Boolean(asking)}
          >
            {asking === "missing"
              ? "Aly is thinking…"
              : "Ask Aly what is missing"}
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
            preferences={prefs}
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
          {asking === "ideas"
            ? "Aly is drafting the decisions any trip needs an answer to, skipping anything already saved here. This takes a few seconds."
            : "Aly is reading your trips, your reviews and what is already saved here, looking for the decisions she keeps having to guess at. This takes a few seconds."}
        </p>
      )}

      {ideas && !asking && (
        <div className="no-print mt-4 space-y-3 rounded-xl border border-[var(--line)] bg-sand/40 p-3">
          <div>
            <span className="section-label">Aly&apos;s suggestions</span>
            <p className="mt-1 text-sm text-ink-soft">
              {ideas.length === 0
                ? "Nothing to add — everything Aly would want to know is already written down here."
                : askedFor === "ideas"
                  ? "The decisions any trip needs an answer to, drafted the ordinary way rather than picked out of your record. Change each one to what is actually true of you, or turn it down. Nothing is saved until you press Save."
                  : starter
                    ? "There is not much saved about you yet, so these are not things Aly spotted — they are the decisions every trip needs an answer to, drafted the ordinary way. Change any of them to what is actually true of you, or turn them down. Nothing is saved until you press Save."
                    : "Drafts, in your words, from what Aly already knows about you. Nothing is saved until you press Save, and you can change the wording first."}
            </p>
          </div>
          {ideas.map((idea) => (
            <SuggestionCard
              key={idea.key}
              idea={idea}
              travelers={travelers}
              preferences={prefs}
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
          {(topicChips.length > 1 || topicKey) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="section-label">About</span>
              <Chip on={!topicKey} onClick={() => setTopicKey("")}>
                Anything
              </Chip>
              {topicChips.map((row) => (
                <Chip
                  key={row.key}
                  on={topicKey === row.key}
                  onClick={() => setTopicKey(row.key)}
                >
                  {row.label} · {row.count}
                </Chip>
              ))}
              {untopiced > 0 && (
                <Chip
                  on={topicKey === NO_TOPIC_KEY}
                  onClick={() => setTopicKey(NO_TOPIC_KEY)}
                >
                  {NO_TOPIC_LABEL} · {untopiced}
                </Chip>
              )}
            </div>
          )}
          {tripId && (
            <p className="text-sm text-ink-soft">
              {aside
                ? `What ${tripName} is planned with: everything shared, plus the people going. ${aside}`
                : `Everyone who has a preference saved is going on ${tripName}, so all of them apply.`}
            </p>
          )}
          {tidy.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber/30 bg-amber/5 p-3">
              <span className="section-label">Topics worth tidying</span>
              {tidy.map((row) => (
                <div
                  key={`${row.kind}:${row.fromKey}`}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="text-ink-soft">
                    {row.kind === "spelling"
                      ? row.said
                      : `Move ${row.fromCount} from \u201C${row.from}\u201D into \u201C${row.into}\u201D? ${row.because}`}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                    disabled={busy}
                    onClick={() => renameTopic(row.from, row.into)}
                  >
                    {row.kind === "spelling"
                      ? `Rename to \u201C${row.into}\u201D`
                      : "Merge them"}
                  </button>
                  <button
                    type="button"
                    className="text-xs font-semibold text-ink-soft underline decoration-ink-soft/30 underline-offset-2 hover:text-ink"
                    onClick={() =>
                      setIgnored((list) => [
                        ...list,
                        `${row.kind}:${row.fromKey}`,
                      ])
                    }
                  >
                    Leave it
                  </button>
                </div>
              ))}
            </div>
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
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="section-label">{group.label}</p>
                <span className="text-xs text-ink-faint">
                  {group.items.length}
                </span>
                {group.key && (
                  <button
                    type="button"
                    className="no-print text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                    onClick={() =>
                      setRenaming(
                        renaming?.key === group.key
                          ? null
                          : { key: group.key, from: group.label },
                      )
                    }
                  >
                    {renaming?.key === group.key ? "Never mind" : "Rename"}
                  </button>
                )}
              </div>
              {renaming?.key === group.key && (
                <TopicRename
                  from={group.label}
                  count={group.items.length}
                  existing={topicsInUse(prefs)}
                  busy={busy}
                  onCancel={() => setRenaming(null)}
                  onSave={(next) => renameTopic(group.label, next)}
                />
              )}
              <ul className="mt-1.5 space-y-2">
                {group.items.map(({ pref, also }) =>
                  editing === pref.id ? (
                    <li
                      key={pref.id}
                      className="rounded-xl border border-[var(--line)] bg-sand/40 p-3"
                    >
                      <PreferenceForm
                        pref={pref}
                        travelers={travelers}
                        preferences={prefs}
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
                        {also.length > 0 && (
                          <span className="text-xs text-ink-faint">
                            Also under {also.join(" and ")}
                          </span>
                        )}
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
 * Picking what a preference is about: pills, and a box for a word nobody has used
 * yet.
 *
 * Pills rather than a text field because a text field asks somebody to remember
 * how they spelled it last time, and the record shows what happens when they
 * cannot — "Restaurans" twice, and an "Accommodations and Activities" invented to
 * say two things in a field that holds one. Their own topics come first, with
 * counts, because reusing a heading that already exists is the behaviour worth
 * making easiest. The standard topics follow, and the box at the end means nothing
 * here is a closed list.
 */
function TopicPicker({ preferences, selected, onChange }) {
  const [typed, setTyped] = useState("");
  const choices = useMemo(
    () => topicChoices(preferences, selected),
    [preferences, selected],
  );
  // Their own topics, then the standard ones. Both were shown at once until a
  // measurement at 320px put sixteen pills in a column taller than the form —
  // the same fault as a page that prints everything it has because it was
  // designed when there were four of something. So the standard list is behind a
  // press, and their own is what the form opens with, since reusing a heading
  // that already exists is the behaviour worth making easiest.
  const own = choices.filter((c) => c.kind !== "idea");
  const ideas = choices.filter((c) => c.kind === "idea");
  const [showIdeas, setShowIdeas] = useState(own.length === 0);
  const full = selected.length >= TOPICS_MAX;
  const wanted = cleanTopic(typed);
  const already = wanted && hasTopic(selected, wanted);
  const offered =
    wanted && choices.some((c) => c.key === normalizeTopic(wanted));

  function add(label) {
    onChange(withTopic(selected, label));
    setTyped("");
  }

  return (
    <div>
      <span className="block section-label">What it is about (optional)</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {(showIdeas ? [...own, ...ideas] : own).map((choice) => {
          const on = hasTopic(selected, choice.label);
          return (
            <Chip
              key={choice.key}
              on={on}
              onClick={() =>
                on
                  ? onChange(withoutTopic(selected, choice.label))
                  : !full && add(choice.label)
              }
            >
              {choice.label}
              {choice.count ? ` · ${choice.count}` : ""}
            </Chip>
          );
        })}
        {!showIdeas && ideas.length > 0 && (
          <button
            type="button"
            className="chip border border-dashed border-[var(--line)] bg-white text-ink-soft hover:border-teal/40 hover:text-teal"
            onClick={() => setShowIdeas(true)}
          >
            {own.length ? `${ideas.length} more` : "Show topics"}
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          className="field max-w-56"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Something else"
          aria-label="A topic of your own"
          onKeyDown={(e) => {
            // Enter inside a form submits it, which would save the preference
            // while somebody was still typing what it is about.
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (wanted && !already && !full) add(wanted);
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!wanted || already || full}
          onClick={() => add(wanted)}
        >
          Add topic
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {full
          ? `That is ${TOPICS_MAX} topics, which is as many as one preference can carry. Take one off to add another.`
          : already
            ? `\u201C${wanted}\u201D is already on this one.`
            : offered
              ? `\u201C${wanted}\u201D is one of the pills above.`
              : selected.length > 1
                ? "It will appear under each of these."
                : "Pick as many as fit. A preference about a hotel spa belongs under both where you stay and what you do."}
      </p>
    </div>
  );
}

/**
 * Renaming a topic, with the consequence written out before the button is pressed.
 *
 * Renaming onto a topic that already exists merges the two, and a control that
 * quietly did that to five preferences would be the worst kind of tidy-up. So the
 * sentence under the box says what will happen, counted, named, every time it
 * changes.
 */
function TopicRename({ from, count, existing, busy, onCancel, onSave }) {
  const [next, setNext] = useState(from);
  const effect = renameEffect({ from, next, count, existing });

  return (
    <div className="no-print mt-2 rounded-xl border border-[var(--line)] bg-sand/40 p-3">
      <label className="block">
        <span className="block section-label">Rename this topic</span>
        <input
          className="field mt-1 max-w-sm"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (effect.ok && !busy) onSave(next);
          }}
        />
      </label>
      <p className="mt-1.5 text-sm text-ink-soft">{effect.said}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !effect.ok}
          onClick={() => onSave(next)}
        >
          {busy
            ? "Saving\u2026"
            : effect.merges
              ? `Merge into \u201C${effect.into}\u201D`
              : effect.removes
                ? "Take it off"
                : "Rename"}
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
    </div>
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
function SuggestionCard({
  idea,
  travelers,
  preferences,
  busy,
  onSave,
  onSkip,
}) {
  const [body, setBody] = useState(idea.body || "");
  // Whatever Aly filed it under, which she is asked to take from the family's own
  // topics first. Editable, because a draft nobody has agreed to yet should not
  // get to decide the filing either.
  const [topics, setTopics] = useState(() =>
    topicsOf({ topics: idea.topics, topic: idea.topic }),
  );
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
      <div className="mt-2 space-y-3">
        <TopicPicker
          preferences={preferences}
          selected={topics}
          onChange={setTopics}
        />
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
              ...topicPatch(topics),
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

function PreferenceForm({
  pref,
  travelers,
  preferences = [],
  busy,
  onCancel,
  onSave,
}) {
  const [body, setBody] = useState(pref?.body || "");
  const [topics, setTopics] = useState(() => topicsOf(pref));
  const [travelerId, setTravelerId] = useState(pref?.traveler_id || "");

  function submit(event) {
    event.preventDefault();
    if (!body.trim()) return;
    onSave({
      body: body.trim(),
      ...topicPatch(topics),
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

      <TopicPicker
        preferences={preferences}
        selected={topics}
        onChange={setTopics}
      />

      <div>
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
