// How each answer is marked. Pure functions, so they can be tested without
// asking any model anything. Every scorer returns { score, max, notes }.

const said = (v) => (v == null ? null : String(v).trim());

export function scoreFacts(text, facts, calls = []) {
  const notes = [];
  let score = 0;
  for (const re of facts) {
    if (re.test(text || "")) score++;
    else notes.push(`missing ${re.source.slice(0, 40)}`);
  }
  // A question answered with a tool call is the wrong answer to a question.
  if (!calls.length) score++;
  else notes.push(`called ${calls.map((c) => c.name).join(", ")}`);
  if (!String(text || "").trim()) notes.push("no text");
  return { score, max: facts.length + 1, notes };
}

/** Tool calls against a CHANGES case: right tools, right count, right args, no invented ids. */
export function scoreTools(calls = [], testCase, knownIds = []) {
  const names = calls.map((c) => c.name);
  const got = [...new Set(names)].sort();
  const want = [...testCase.want].sort();
  const notes = [];
  let score = 0;
  let max = 1;
  if (JSON.stringify(got) === JSON.stringify(want)) score++;
  else notes.push(`called ${got.join(", ") || "nothing"}, wanted ${want.join(", ") || "nothing"}`);
  for (const [name, n] of Object.entries(testCase.count || {})) {
    max++;
    const c = names.filter((x) => x === name).length;
    if (c === n) score++;
    else notes.push(`${name} ${c}x, wanted ${n}x`);
  }
  for (const [name, args] of Object.entries(testCase.args || {})) {
    for (const [k, v] of Object.entries(args)) {
      max++;
      const hit = calls.find((c) => c.name === name && String(c.args?.[k] ?? "") === v);
      if (hit) score++;
      else notes.push(`${name}.${k} wanted ${v}`);
    }
  }
  if (testCase.noInventedId) {
    max++;
    const known = new Set(knownIds);
    const invented = calls.flatMap((c) => Object.values(c.args || {})).find(
      (v) => typeof v === "string" && v.length > 20 && /^[0-9a-f-]+$/i.test(v) && !known.has(v),
    );
    if (!invented) score++;
    else notes.push(`invented an id ${invented.slice(0, 13)}…`);
  }
  return { score, max, notes };
}

export function scoreSearch(text, sources = [], facts = []) {
  const notes = [];
  let score = 0;
  if (sources.length) score++;
  else notes.push("no sources came back");
  const withLinks = `${text || ""}\n${sources.map((s) => `${s.url} ${s.title}`).join("\n")}`;
  for (const re of facts) {
    if (re.test(withLinks)) score++;
    else notes.push(`missing ${re.source.slice(0, 40)}`);
  }
  return { score, max: facts.length + 1, notes };
}

function matches(exp, got) {
  if (exp instanceof RegExp) return exp.test(String(got ?? ""));
  if (Array.isArray(exp)) return JSON.stringify([...(got || [])].sort()) === JSON.stringify([...exp].sort());
  if (typeof exp === "number") return Number(got) === exp;
  if (exp === null) return got == null || got === "";
  // Identifiers print with spaces, dashes or dots depending on the document
  // ("T492-118-305" on the card, T492118305 in the answer key); the characters
  // are what have to be right, not the separators.
  const bare = (v) => String(v ?? "").toUpperCase().replace(/[\s\-.\/]/g, "");
  return bare(said(got)) === bare(exp);
}

/** A document reading against its answer key, one point per field. */
export function scoreDoc(truth, got) {
  const notes = [];
  let score = 0;
  let max = 0;
  for (const [k, exp] of Object.entries(truth)) {
    max++;
    const g = got?.[k];
    const pass = k === "insured_names" ? (g || []).length === exp : matches(exp, g);
    if (pass) score++;
    else notes.push(`${k}=${JSON.stringify(g)?.slice(0, 40)}`);
  }
  return { score, max, notes };
}

/** An email reading against its answer key: kind, names, and each item's fields. */
export function scoreEmail(truth, got) {
  const notes = [];
  let score = 0;
  let max = 0;
  const point = (ok, label, g) => {
    max++;
    if (ok) score++;
    else notes.push(`${label}=${JSON.stringify(g)?.slice(0, 40)}`);
  };
  point(Array.isArray(truth.kind) ? truth.kind.includes(got?.kind) : got?.kind === truth.kind, "kind", got?.kind);
  if (truth.names) point((got?.passenger_names || []).length === truth.names, "names", got?.passenger_names);
  if (truth.items) {
    const items = got?.items || [];
    point(items.length === truth.items.length, "item count", items.length);
    truth.items.forEach((x, i) => {
      const g = items[i] || {};
      point(g.category === x.category, `#${i + 1} category`, g.category);
      point(g.item_date === x.date, `#${i + 1} date`, g.item_date);
      if (x.end) point(g.end_date === x.end, `#${i + 1} end`, g.end_date);
      if (x.time) point(g.start_time === x.time, `#${i + 1} time`, g.start_time);
      point(g.confirmation_number === x.conf, `#${i + 1} confirmation`, g.confirmation_number);
      if (x.has) point(x.has.test(`${g.title} ${g.location}`), `#${i + 1} title`, g.title);
      if (x.notes) point(x.notes.test(g.notes || ""), `#${i + 1} notes`, g.notes);
    });
  }
  if (truth.ins) {
    const g = got?.insurance || {};
    point(g.policy_number === truth.ins.policy, "policy", g.policy_number);
    point(g.coverage_start === truth.ins.start, "start", g.coverage_start);
    point(g.coverage_end === truth.ins.end, "end", g.coverage_end);
    point(Number(g.premium) === truth.ins.premium, "premium", g.premium);
    point(Number(g.medical_limit) === truth.ins.medical, "medical", g.medical_limit);
    point(Number(g.evacuation_limit) === truth.ins.evac, "evacuation", g.evacuation_limit);
    point(matches(truth.ins.covers, g.covers), "covers", g.covers);
  }
  return { score, max, notes };
}

/**
 * Fares: one point per expected fare that survived the app's own verifier, one
 * for leaving out the airports the household does not fly from, one for
 * returning nothing the verifier had to throw away.
 */
export function scoreFares({ returned = [], verified = [] }, truth, excluded = []) {
  const notes = [];
  let score = 0;
  const key = (f) => `${String(f.origin || "").toUpperCase()}-${String(f.destination_code || "").toUpperCase()}-${Number(f.price)}`;
  const kept = new Set(verified.map(key));
  for (const t of truth) {
    if (kept.has(key(t))) score++;
    else notes.push(`missed ${t.origin}→${t.destination_code} $${t.price}`);
  }
  const strays = returned.filter((f) => excluded.includes(String(f.origin || "").toUpperCase()));
  if (!strays.length) score++;
  else notes.push(`included ${strays.map((f) => f.origin).join(", ")}`);
  const thrown = returned.length - verified.length;
  if (thrown <= 0) score++;
  else notes.push(`${thrown} fare${thrown === 1 ? "" : "s"} failed verification`);
  return { score, max: truth.length + 2, notes };
}

/** JSON out of a model's text, tolerating a markdown fence. */
export function jsonOut(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}
