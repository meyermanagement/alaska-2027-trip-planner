"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A short editor for a person's favorite moments.
//
// The interview writes moments once, from the primary, at the end of the
// nine-question ledger. This component is what somebody uses afterwards:
// looking at what got saved, fixing wording that came out wrong, adding a
// moment that got missed, taking one down that no longer belongs there.
//
// Used in two places, on purpose the same shape:
//
//   1. Inside PersonForm on the edit person screen. A writer opens their own
//      file, or somebody else's, and sees their moments as a list with add,
//      edit, remove verbs on each row.
//
//   2. Inside the /welcome/moments step. A person signing in for the first
//      time lands here after the About me step, sees what the owner already
//      wrote about them (nothing wiped), and can add their own or fix wording.
//
// Both places talk to /api/moments. Writes need editPeople; the API enforces
// that. Rendering is deliberately flat -- a paragraph per moment, an inline
// edit box, and an add box at the bottom -- because a moment is a sentence,
// not a form.
//
// Auto-growing textareas everywhere for the same reason About me now grows:
// people write in real sentences, and a scroll bar inside a four-row box is
// exactly the wrong shape when the thing is meant to be read back later.

const MAX_MOMENT_LENGTH = 1200;

// Exported because the interview asks the same question with the same shape,
// and two auto-growing textareas that drift apart is two boxes that behave
// differently on the same content.
export function AutoGrowTextarea({ value, onChange, focusRef, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // Plus the border, because the height is a border-box height while
    // scrollHeight is content-box; without it the box sits two pixels short
    // and the last line clips.
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  }, [value]);
  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        // A caller that wants to focus the box gets the same element. Handing
        // it a ref of its own rather than letting it pass `ref` through keeps
        // the growing behavior, which needs the element here, from being
        // overwritten by whatever the caller passes in.
        if (focusRef) focusRef.current = el;
      }}
      value={value}
      onChange={onChange}
      className="field w-full min-h-16 overflow-hidden text-sm"
      rows={2}
      maxLength={MAX_MOMENT_LENGTH}
      {...rest}
    />
  );
}

export default function MomentsEditor({
  travelerId,
  travelerName,
  // The label used above the list. The person page says "Favorite moments";
  // the welcome step says something warmer. Kept configurable so both places
  // read as themselves.
  heading = "Favorite moments",
  // A short explainer read once at the top. Same story: different tone for
  // the two callers.
  help = "Aly reads these before every answer she writes. A real moment in your own words is worth more than a tidy list of places.",
}) {
  const [moments, setMoments] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editingBody, setEditingBody] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  const [newBody, setNewBody] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");

  const reload = useCallback(async () => {
    if (!travelerId) return;
    setLoadError("");
    try {
      const res = await fetch(
        `/api/moments?traveler_id=${encodeURIComponent(travelerId)}`,
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(data?.error || "Those moments could not be loaded.");
        setMoments([]);
      } else {
        setMoments(Array.isArray(data?.moments) ? data.moments : []);
      }
    } catch {
      setLoadError("Those moments could not be loaded.");
      setMoments([]);
    } finally {
      setLoaded(true);
    }
  }, [travelerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function addMoment(e) {
    e.preventDefault();
    const body = newBody.trim();
    if (!body) return;
    setAddBusy(true);
    setAddError("");
    try {
      const res = await fetch("/api/moments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ traveler_id: travelerId, body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.moment) {
        setAddError(data?.error || "That moment could not be saved.");
      } else {
        setMoments((prev) => [...prev, data.moment]);
        setNewBody("");
      }
    } catch {
      setAddError("That moment could not be saved.");
    } finally {
      setAddBusy(false);
    }
  }

  async function saveEdit(id) {
    const body = editingBody.trim();
    if (!body) {
      setEditError("A moment needs some words.");
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      const res = await fetch("/api/moments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.moment) {
        setEditError(data?.error || "That moment could not be saved.");
      } else {
        setMoments((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...data.moment } : m)),
        );
        setEditingId(null);
        setEditingBody("");
      }
    } catch {
      setEditError("That moment could not be saved.");
    } finally {
      setEditBusy(false);
    }
  }

  async function removeMoment(id) {
    // A moment is a sentence somebody wrote about themselves. Confirming once
    // beats a silent delete of something warm.
    const ok = window.confirm("Remove this moment?");
    if (!ok) return;
    try {
      const res = await fetch(`/api/moments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMoments((prev) => prev.filter((m) => m.id !== id));
        if (editingId === id) {
          setEditingId(null);
          setEditingBody("");
        }
      }
    } catch {
      // A failed delete leaves the moment on screen; the next reload catches
      // it. Silent-fail beats a modal telling the person their moment could
      // not be removed for reasons.
    }
  }

  return (
    <div className="space-y-3">
      {heading && <p className="section-label">{heading}</p>}
      {help && <p className="text-xs text-ink-soft">{help}</p>}

      {loadError && (
        <p className="rounded-lg border border-terra/40 bg-terra-soft/40 px-3 py-2 text-xs text-terra-deep">
          {loadError}
        </p>
      )}

      {loaded && moments.length === 0 && !loadError && (
        <p className="rounded-lg border border-sand-deep bg-sand-soft/60 px-3 py-2 text-xs text-ink-soft">
          Nothing here yet. Add a first moment below --{" "}
          {travelerName
            ? `something ${travelerName} would tell`
            : "the kind of thing you would tell"}{" "}
          a friend about at dinner.
        </p>
      )}

      {moments.length > 0 && (
        <ul className="space-y-2">
          {moments.map((m) => {
            const isEditing = editingId === m.id;
            return (
              <li
                key={m.id}
                className="rounded-lg border border-sand-deep bg-white p-3"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <AutoGrowTextarea
                      value={editingBody}
                      onChange={(e) => setEditingBody(e.target.value)}
                    />
                    {editError && (
                      <p className="text-xs text-terra-deep">{editError}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(m.id)}
                        disabled={editBusy || !editingBody.trim()}
                        className="btn btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
                      >
                        {editBusy ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditingBody("");
                          setEditError("");
                        }}
                        disabled={editBusy}
                        className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="whitespace-pre-wrap text-sm text-ink">
                      {m.body}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(m.id);
                          setEditingBody(m.body);
                          setEditError("");
                        }}
                        className="btn btn-ghost whitespace-nowrap px-3 py-1 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMoment(m.id)}
                        className="btn btn-ghost whitespace-nowrap px-3 py-1 text-xs text-terra-deep"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={addMoment}
        className="space-y-2 border-t border-sand-deep pt-3"
      >
        <label className="block text-xs font-semibold">
          Add a moment
          <AutoGrowTextarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="e.g. a slow dinner on a terrace in Rome, the morning we found tide pools in Maine."
          />
        </label>
        {addError && <p className="text-xs text-terra-deep">{addError}</p>}
        <div>
          <button
            type="submit"
            disabled={addBusy || !newBody.trim()}
            className="btn btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
          >
            {addBusy ? "Saving..." : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
