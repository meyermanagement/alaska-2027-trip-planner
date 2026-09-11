"use client";

// The practice run: what a person typed while walking the practice chain,
// held in the browser so the next screen can pick it up.
//
// Practice screens deliberately write nothing to the database -- that is the
// whole point of a rehearsal -- which used to mean each screen started from
// nothing and the proof screen answered against a hard-coded family. So a
// person could type their real family into the practice welcome form and
// then watch Aly talk about somebody else's family two screens later.
//
// sessionStorage is the right shelf for this. It survives navigation between
// the practice screens, which is the only thing that has to work; it dies
// with the tab, so an abandoned rehearsal does not sit around; and it is
// per-tab, so two rehearsals in two tabs do not overwrite each other. It is
// not the database, which is exactly the property practice needs.
//
// Nothing here throws. sessionStorage is unavailable in a few real
// situations -- Safari private mode historically, storage-partitioned
// iframes, a full quota -- and a rehearsal is not worth breaking a screen
// over. Every read falls back to an empty run and every write fails quietly,
// which degrades practice to exactly the hard-coded-family behavior it had
// before this existed.

const KEY = "alyeska.practice.session.v1";

export const EMPTY_RUN = {
  familyName: "",
  home: "",
  people: [],
  pets: [],
  aboutMe: "",
  answers: [],
  startedAt: null,
};

function storage() {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readRun() {
  const store = storage();
  if (!store) return { ...EMPTY_RUN };
  try {
    const raw = store.getItem(KEY);
    if (!raw) return { ...EMPTY_RUN };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_RUN };
    // Spread over the empty run so a run written by an older build, missing
    // a field a newer screen reads, does not hand back undefined.
    return { ...EMPTY_RUN, ...parsed };
  } catch {
    return { ...EMPTY_RUN };
  }
}

export function writeRun(run) {
  const store = storage();
  if (!store) return false;
  try {
    const next = { ...run };
    if (!next.startedAt) next.startedAt = new Date().toISOString();
    store.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** Merge a few fields into the run without disturbing the rest of it. */
export function patchRun(patch) {
  const next = { ...readRun(), ...patch };
  writeRun(next);
  return next;
}

export function clearRun() {
  const store = storage();
  if (!store) return false;
  try {
    store.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/** True when the person has actually typed something into this rehearsal. */
export function runHasContent(run) {
  const r = run || readRun();
  return Boolean(
    (r.familyName || "").trim() ||
    (r.home || "").trim() ||
    (r.aboutMe || "").trim() ||
    (r.people || []).length ||
    (r.pets || []).length ||
    (r.answers || []).length,
  );
}

// The interview records an answer per question as { slot, label, picked,
// stored, whys, ownWords }, where `picked` is a chosen option's label, a typed
// sentence, or an array of favorite moments, and `stored` is the line a real
// save would have written. The prompts want preference
// lines. Flattening here rather than in each screen keeps the shape the
// endpoints see identical to the shape real preference rows produce.
function answerToPrefs(answer) {
  const slot = (answer?.slot || "").trim();
  const out = [];
  // `stored` is what a real save would have written -- the abstract sentence
  // where an option's label is only an illustration, and the same rank, multi
  // and band sentences the answer route composes. `picked` is the words on the
  // screen, which is right for the recap and wrong for a prompt: it would put
  // a kayak in the travel file of a family who never mentioned one.
  const stored = (answer?.stored || "").trim();
  const picked = answer?.picked;
  const pickedText = stored
    ? stored
    : Array.isArray(picked)
      ? picked.filter(Boolean).join("; ")
      : typeof picked === "string"
        ? picked.trim()
        : "";
  // Every answer to a question with options carries the question's own label,
  // the way the real answer route files them: on its own, "9:30 am to
  // midnight" or "The room" does not say what it is answering, and a prompt
  // reading it has no way to work that out. Moments and limits are already
  // whole statements and take no prefix.
  const prefixed = new Set(["band", "pets", "options", "multi", "rank"]);
  if (pickedText) {
    out.push({
      slot,
      body:
        prefixed.has(answer?.kind) && answer?.label
          ? `${answer.label}: ${pickedText}`
          : pickedText,
    });
  }
  // Whys and own-words are what the person added on top of the pick. Real
  // mode writes them as their own rows, so practice does too.
  for (const why of answer?.whys || []) {
    const body = (why || "").trim();
    if (body) out.push({ slot, body });
  }
  const own = (answer?.ownWords || "").trim();
  if (own) out.push({ slot, body: own });
  return out;
}

/**
 * Shape the run into the `standIn` an interview endpoint accepts. Returns
 * null when the run is empty, so callers can send a plain practice request
 * and get the built-in stand-in family.
 */
export function runToStandIn(run) {
  const r = run || readRun();
  if (!runHasContent(r)) return null;
  return {
    familyName: (r.familyName || "").trim(),
    home: (r.home || "").trim(),
    aboutMe: (r.aboutMe || "").trim(),
    people: (r.people || []).map((p) => ({
      name: p.name,
      date_of_birth: p.dob || p.date_of_birth || null,
    })),
    pets: (r.pets || []).map((p) => ({ name: p.name, species: p.species })),
    prefs: (r.answers || []).flatMap(answerToPrefs),
  };
}

/**
 * A short human summary of what the run holds, for the practice hub. Returns
 * an array of lines rather than a sentence so the hub can lay them out.
 */
export function describeRun(run) {
  const r = run || readRun();
  const lines = [];
  if ((r.familyName || "").trim()) lines.push(`Family: ${r.familyName.trim()}`);
  if ((r.home || "").trim()) lines.push(`Home: ${r.home.trim()}`);
  const people = (r.people || []).map((p) => p.name).filter(Boolean);
  if (people.length) lines.push(`People: ${people.join(", ")}`);
  const pets = (r.pets || []).map((p) => p.name).filter(Boolean);
  if (pets.length) lines.push(`Animals: ${pets.join(", ")}`);
  if ((r.aboutMe || "").trim()) lines.push("About you: written");
  const answers = (r.answers || []).length;
  if (answers) {
    lines.push(`Interview: ${answers} ${answers === 1 ? "answer" : "answers"}`);
  }
  return lines;
}
