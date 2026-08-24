"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
}) {
  const supabase = createClient();
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const nameFor = (id) => travelers.find((t) => t.id === id)?.name;

  // Group under whatever topics have been used, in the order they appear.
  const groups = [];
  for (const p of prefs) {
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
        {!adding && (
          <button
            type="button"
            className="btn btn-primary no-print"
            onClick={() => {
              setEditing(null);
              setAdding(true);
            }}
          >
            Add a preference
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-4 rounded-xl border border-sand-deep bg-sand/40 p-3">
          <PreferenceForm
            travelers={travelers}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSave={(values) => save(null, values)}
          />
        </div>
      )}

      {prefs.length === 0 && !adding ? (
        <div className="mt-4 rounded-xl border border-dashed border-sand-deep p-4">
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
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <div key={group.key || "_none"}>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
                {group.label}
              </p>
              <ul className="mt-1.5 space-y-2">
                {group.items.map((pref) =>
                  editing === pref.id ? (
                    <li
                      key={pref.id}
                      className="rounded-xl border border-sand-deep bg-sand/40 p-3"
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
                      className="rounded-xl border border-sand-deep bg-white p-3"
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-line">
                        {pref.body}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3">
                        {pref.traveler_id && nameFor(pref.traveler_id) && (
                          <span className="text-xs font-semibold text-ink-soft">
                            {nameFor(pref.traveler_id)}
                          </span>
                        )}
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
        <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
          The preference
        </span>
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
          <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
            Topic (optional)
          </span>
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
        <label>
          <span className="block text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
            Whose
          </span>
          <select
            className="field mt-1"
            value={travelerId}
            onChange={(e) => setTravelerId(e.target.value)}
          >
            <option value="">All of us</option>
            {travelers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
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
