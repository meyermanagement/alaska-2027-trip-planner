"use client";

// The model lab: pick models and kinds of request, run the same made-up tests
// against each, and see quality, time and cost side by side, with a
// recommendation per kind of request and the setting that would change it.
//
// Everything the page remembers (models already seen, price edits, past runs)
// lives in this browser. Nothing is written to the database.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SCENARIOS, scenarioById } from "@/lib/model-lab/scenarios";
import { aggregate, recommend, formatCost } from "@/lib/model-lab/recommend";
import { priceFor, costOf } from "@/lib/model-lab/prices";
import { defaultPicks } from "@/lib/model-lab/picks";
import ModelCheck from "./ModelCheck";

const SEEN_KEY = "model-lab:seen";
const PRICE_KEY = "model-lab:prices";
const RUNS_KEY = "model-lab:runs";
const KEEP_RUNS = 8;
const AT_ONCE = 4;

// Rough token counts for a request of each kind, used only for the estimate
// before a run when this browser has no past result to go on.
const TYPICAL = {
  ask: { inputTokens: 1500, outputTokens: 350 },
  tools: { inputTokens: 1800, outputTokens: 200 },
  search: { inputTokens: 400, outputTokens: 600, searches: 1 },
  email: { inputTokens: 4000, outputTokens: 900 },
  documents: { inputTokens: 2500, outputTokens: 500 },
  fares: { inputTokens: 3200, outputTokens: 1000 },
};

const load = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* full or blocked: the page still works, it just forgets */
  }
};

const pct = (q) => (q == null ? "—" : `${Math.round(q * 100)}%`);
const secs = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);

function Badge({ tone = "plain", children }) {
  const tones = {
    plain: "border-sand-deep/60 text-ink-soft",
    teal: "border-teal/40 bg-teal/5 text-ink",
    amber: "border-amber/40 bg-amber/5 text-ink",
    rose: "border-rose/30 bg-rose/5 text-ink",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

function Section({ title, children, aside }) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{title}</h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const quiet = "rounded-lg border border-ink-soft/30 px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-50";

function Issues({ notes }) {
  return (
    <details className="text-xs text-ink-soft">
      <summary className="cursor-pointer">
        {notes.length} issue{notes.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-1 list-disc pl-4">
        {notes.map((n) => (
          <li key={n} className="break-words">{n}</li>
        ))}
      </ul>
    </details>
  );
}

export default function ModelLab() {
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [seen, setSeen] = useState([]);
  const [picked, setPicked] = useState([]);
  const [types, setTypes] = useState(SCENARIOS.map((s) => s.id));
  const [effort, setEffort] = useState("low");
  const [overrides, setOverrides] = useState({});
  const [runs, setRuns] = useState([]);
  const [current, setCurrent] = useState(null); // { id, at, effort, results, total }
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/model-check/models", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setCatalog(json);
      const known = load(SEEN_KEY, []);
      setSeen(known);
      setPicked(defaultPicks(json.models, known));
    } catch (e) {
      setLoadError(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    setOverrides(load(PRICE_KEY, {}));
    const past = load(RUNS_KEY, []);
    setRuns(past);
    if (past[0]) setCurrent(past[0]);
    refresh();
  }, [refresh]);

  const models = catalog?.models || [];
  const unavailable = catalog?.unavailable || {};
  const seenSet = useMemo(() => new Set(seen), [seen]);
  const isNew = (id) => seen.length > 0 && !seenSet.has(id);
  const newCount = models.filter((m) => isNew(m.id)).length;

  const markSeen = () => {
    const all = [...new Set([...seen, ...models.map((m) => m.id)])];
    setSeen(all);
    save(SEEN_KEY, all);
  };

  // First visit: everything counts as seen, so "New" means new since today.
  useEffect(() => {
    if (catalog && !load(SEEN_KEY, null)) {
      const all = catalog.models.map((m) => m.id);
      setSeen(all);
      save(SEEN_KEY, all);
    }
  }, [catalog]);

  const activeTypes = types.filter((t) => !unavailable[t]);
  const queue = useMemo(() => {
    const q = [];
    for (const t of activeTypes)
      for (const c of scenarioById(t).cases) for (const m of picked) q.push({ model: m, scenario: t, caseId: c.id });
    return q;
  }, [activeTypes, picked]);

  // Past results in this browser beat the rough table for an estimate.
  const estimate = useMemo(() => {
    const history = runs.flatMap((r) => r.results).filter((r) => r.ok && r.effort === effort);
    let total = 0;
    const unpriced = new Set();
    for (const job of queue) {
      const price = priceFor(job.model, { overrides });
      if (!price) {
        unpriced.add(job.model);
        continue;
      }
      const like = history.filter((r) => r.model === job.model && r.scenario === job.scenario);
      const usage = like.length
        ? {
            inputTokens: like.reduce((a, r) => a + r.inputTokens, 0) / like.length,
            cachedTokens: 0,
            outputTokens: like.reduce((a, r) => a + r.outputTokens, 0) / like.length,
            searches: like.reduce((a, r) => a + (r.searches || 0), 0) / like.length,
          }
        : TYPICAL[job.scenario];
      total += costOf(usage, price) || 0;
    }
    return { total, unpriced: [...unpriced] };
  }, [queue, overrides, runs, effort]);

  async function run() {
    if (!queue.length) return;
    stop.current = false;
    setRunning(true);
    const id = new Date().toISOString();
    const state = { id, at: id, effort, total: queue.length, results: [] };
    setCurrent({ ...state });
    const jobs = [...queue];
    const worker = async () => {
      while (jobs.length && !stop.current) {
        const job = jobs.shift();
        let result;
        // A dropped connection ("Load failed" when a phone sleeps or switches
        // networks) says nothing about the model, so it is tried once more and,
        // if it drops again, marked as the connection's fault, not the model's.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch("/api/model-check/run", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ...job, effort }),
            });
            result = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
            if (!res.ok && result.ok !== false) result = { ok: false, error: result.error || `HTTP ${res.status}` };
            break;
          } catch (e) {
            result = { ok: false, network: true, error: String(e.message || e) };
            if (stop.current) break;
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
        state.results.push({ ...job, effort, ...result });
        setCurrent({ ...state, results: [...state.results] });
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, jobs.length) }, worker));
    const finished = { ...state, results: [...state.results], stopped: stop.current };
    setCurrent(finished);
    const next = [finished, ...runs.filter((r) => r.id !== id)].slice(0, KEEP_RUNS);
    setRuns(next);
    save(RUNS_KEY, next);
    setRunning(false);
  }

  const rows = useMemo(() => aggregate(current?.results || [], { overrides }), [current, overrides]);
  const picks = useMemo(() => recommend(rows), [rows]);
  const spent = useMemo(
    () => (current?.results || []).reduce((a, r) => a + (r.ok ? costOf(r, priceFor(r.model, { overrides })) || 0 : 0), 0),
    [current, overrides],
  );

  const download = () => {
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `model-lab-${current.id.slice(0, 16).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const setPrice = (model, field, value) => {
    const next = { ...overrides, [model]: { ...(overrides[model] || {}), [field]: value } };
    const o = next[model];
    if (!o.input && !o.output && !o.cached && !o.search) delete next[model];
    setOverrides(next);
    save(PRICE_KEY, next);
  };

  const resetPrice = (model) => {
    const next = { ...overrides };
    delete next[model];
    setOverrides(next);
    save(PRICE_KEY, next);
  };

  const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const done = current?.results.length || 0;

  return (
    <main className="screen px-5 py-8">
      <h1 className="text-2xl font-semibold text-ink">Model lab</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-soft">
        Run the same made-up requests against any model to compare quality, speed and cost, then change the setting for that kind of request.
      </p>

      {/* Models */}
      <Section
        title="Models"
        aside={
          <div className="flex flex-wrap gap-2">
            {newCount > 0 && (
              <button className={quiet} onClick={markSeen}>
                Mark {newCount} new as seen
              </button>
            )}
            <button className={quiet} onClick={() => setPicked(models.filter((m) => m.inUse).map((m) => m.id))} disabled={!models.length}>
              In use
            </button>
            <button className={quiet} onClick={() => setPicked(defaultPicks(models, seen))} disabled={!models.length}>
              Suggested
            </button>
            <button className={quiet} onClick={() => setPicked([])} disabled={!picked.length}>
              None
            </button>
            <button className={quiet} onClick={refresh}>
              Check for new models
            </button>
          </div>
        }
      >
        {loadError && <p className="rounded-lg border border-rose/30 bg-rose/5 p-3 text-sm text-ink">{loadError}</p>}
        {!catalog && !loadError && <p className="text-sm text-ink-soft">Asking Google and OpenAI which models they offer…</p>}
        {catalog?.errors?.map((e) => (
          <p key={e.vendor} className="mb-2 rounded-lg border border-amber/40 bg-amber/5 p-3 text-xs text-ink">
            {e.vendor === "openai" ? "OpenAI" : "Google"} list unavailable: {e.message}
          </p>
        ))}
        {["openai", "gemini"].map((vendor) => {
          const mine = models.filter((m) => m.vendor === vendor);
          if (!mine.length) return null;
          return (
            <div key={vendor} className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-ink">{vendor === "openai" ? "OpenAI" : "Google Gemini"}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {mine.map((m) => {
                  const on = picked.includes(m.id);
                  const priced = Boolean(priceFor(m.id, { overrides }));
                  return (
                    <label
                      key={m.id}
                      className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${on ? "border-teal/40 bg-teal/5" : "border-sand-deep/40"}`}
                    >
                      <input type="checkbox" className="mt-0.5" checked={on} onChange={() => toggle(picked, setPicked, m.id)} />
                      <span className="min-w-0">
                        <span className="block break-all font-medium text-ink">{m.id}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {m.inUse && <Badge tone="teal">In use</Badge>}
                          {isNew(m.id) && <Badge tone="amber">New</Badge>}
                          {m.preview && <Badge>Preview</Badge>}
                          {!priced && <Badge tone="rose">Price not set</Badge>}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Section>

      {/* Request types */}
      <Section title="Request types">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SCENARIOS.map((s) => {
            const off = unavailable[s.id];
            const on = types.includes(s.id) && !off;
            return (
              <label
                key={s.id}
                className={`flex min-h-11 items-start gap-2 rounded-lg border p-2.5 text-sm ${off ? "cursor-not-allowed border-sand-deep/40 opacity-60" : on ? "cursor-pointer border-teal/40 bg-teal/5" : "cursor-pointer border-sand-deep/40"}`}
              >
                <input type="checkbox" className="mt-0.5" disabled={Boolean(off)} checked={on} onChange={() => toggle(types, setTypes, s.id)} />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    {s.label} <span className="font-normal text-ink-faint">· {s.cases.length}</span>
                  </span>
                  <span className="block text-xs text-ink-soft">{off || s.blurb}</span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-soft">Thinking</span>
          <div className="inline-flex rounded-lg border border-sand-deep/60 p-0.5">
            {["low", "high"].map((e) => (
              <button
                key={e}
                onClick={() => setEffort(e)}
                className={`min-h-9 rounded-md px-3 text-xs font-medium ${effort === e ? "bg-teal text-on-accent" : "text-ink"}`}
              >
                {e === "low" ? "Low" : "High"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-sand-deep/40 p-3">
          <span className="text-sm text-ink">
            {queue.length} request{queue.length === 1 ? "" : "s"} · about {formatCost(estimate.total)} estimated
            {estimate.unpriced.length > 0 && <span className="text-ink-faint"> · {estimate.unpriced.length} without a price</span>}
          </span>
          {running ? (
            <button className="ml-auto rounded-lg border border-rose/40 px-4 py-2 text-sm font-medium text-ink" onClick={() => (stop.current = true)}>
              Stop
            </button>
          ) : (
            <button
              className="ml-auto rounded-lg bg-teal px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
              disabled={!queue.length}
              onClick={run}
            >
              Run tests
            </button>
          )}
        </div>
      </Section>

      {/* Results */}
      <Section
        title="Results"
        aside={
          current && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
              <span>
                {done} of {current.total} · {formatCost(spent)} estimated · thinking {current.effort}
                {current.stopped ? " · stopped" : ""}
              </span>
              {!running && done > 0 && (
                <button className={quiet} onClick={download}>
                  Download JSON
                </button>
              )}
            </div>
          )
        }
      >
        {running && (
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-sand-deep/40" role="progressbar" aria-valuenow={done} aria-valuemax={current?.total}>
            <div className="h-full bg-teal transition-all" style={{ width: `${(done / (current?.total || 1)) * 100}%` }} />
          </div>
        )}
        {!current && <p className="text-sm text-ink-soft">No runs yet in this browser.</p>}
        {SCENARIOS.filter((s) => rows.some((r) => r.scenario === s.id)).map((s) => {
          const mine = rows.filter((r) => r.scenario === s.id).sort((a, b) => b.quality - a.quality || (a.cost ?? 9) - (b.cost ?? 9));
          const rec = picks[s.id];
          const using = catalog?.inUse?.[s.uses];
          return (
            <div key={s.id} className="mb-5 rounded-lg border border-sand-deep/40 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-ink">{s.label}</h3>
                {using && (
                  <span className="text-xs text-ink-faint">
                    Now: {using.models.slice(0, 2).join(" → ")} · set by {using.setting}
                  </span>
                )}
              </div>
              {rec ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Pick label="Best answers" row={rec.best} detail={pct(rec.best.quality)} />
                  <Pick label="Cheapest, nearly as good" row={rec.cheapest} detail={rec.cheapest ? `${formatCost(rec.cheapest.cost)} each` : "no priced model"} />
                  <Pick label="Fastest, nearly as good" row={rec.fastest} detail={secs(rec.fastest?.ms)} />
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-rose/30 bg-rose/5 p-2.5 text-sm text-ink">Every model failed at least one request.</p>
              )}
              <div className="mt-3">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[44%] sm:w-[34%]" />
                    <col className="w-[19%] sm:w-[13%]" />
                    <col className="w-[16%] sm:w-[11%]" />
                    <col className="w-[21%] sm:w-[18%]" />
                    <col className="hidden sm:table-column" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-xs text-ink-faint">
                      <th className="py-1.5 pr-3 font-medium">Model</th>
                      <th className="py-1.5 pr-3 font-medium">Quality</th>
                      <th className="py-1.5 pr-3 font-medium">Time</th>
                      <th className="py-1.5 pr-3 font-medium"><span className="sm:hidden">Cost</span><span className="hidden sm:inline">Cost per request</span></th>
                      <th className="hidden py-1.5 font-medium sm:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((r) => (
                      <tr key={r.model} className="border-t border-sand-deep/40 align-top">
                        <td className="break-words py-2 pr-3 font-medium text-ink">
                          {r.model}
                          {using?.models?.[0] === r.model && <span className="ml-1.5 inline-block"><Badge tone="teal">In use</Badge></span>}
                          {r.notes.length > 0 && <div className="mt-1 font-normal sm:hidden"><Issues notes={r.notes} /></div>}
                        </td>
                        <td className="py-2 pr-3 text-ink">
                          {pct(r.quality)}
                          {r.failures > 0 && <span className="block text-xs text-ink-faint">{r.failures} failed</span>}
                          {r.dropped > 0 && <span className="block text-xs text-ink-faint">{r.dropped} lost connection</span>}
                        </td>
                        <td className="py-2 pr-3 text-ink">{secs(r.ms)}</td>
                        <td className="py-2 pr-3 text-ink">{r.priced ? formatCost(r.cost) : <span className="text-ink-faint">price not set</span>}</td>
                        <td className="hidden py-2 sm:table-cell">{r.notes.length ? <Issues notes={r.notes} /> : <span className="text-xs text-ink-soft">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {rows.length > 0 && <p className="text-xs text-ink-faint">Costs are estimates from the price table below and the token counts each vendor reported.</p>}
      </Section>

      {/* Prices */}
      <Section title="Prices per million tokens">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-faint">
                <th className="py-1.5 pr-3 font-medium">Model</th>
                <th className="py-1.5 pr-3 font-medium">Input</th>
                <th className="py-1.5 pr-3 font-medium">Cached</th>
                <th className="py-1.5 pr-3 font-medium">Output</th>
                <th className="py-1.5 pr-3 font-medium">Per search</th>
                <th className="py-1.5 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const p = priceFor(m.id, { overrides });
                const own = overrides[m.id] || {};
                const cell = (field) => (
                  <input
                    inputMode="decimal"
                    aria-label={`${m.id} ${field} price`}
                    className="w-20 rounded border border-sand-deep/60 bg-transparent px-1.5 py-1 text-sm text-ink"
                    placeholder={p ? String(p[field] ?? "") : "—"}
                    value={own[field] ?? ""}
                    onChange={(e) => setPrice(m.id, field, e.target.value)}
                  />
                );
                return (
                  <tr key={m.id} className="border-t border-sand-deep/40">
                    <td className="py-1.5 pr-3 text-ink">{m.id}</td>
                    <td className="py-1.5 pr-3">{cell("input")}</td>
                    <td className="py-1.5 pr-3">{cell("cached")}</td>
                    <td className="py-1.5 pr-3">{cell("output")}</td>
                    <td className="py-1.5 pr-3">{cell("search")}</td>
                    <td className="py-1.5 text-xs text-ink-soft">
                      {!p ? (
                        "price not set"
                      ) : p.overridden ? (
                        <button className="underline" onClick={() => resetPrice(m.id)}>
                          Yours · reset
                        </button>
                      ) : (
                        <a className="underline" href={p.source} target="_blank" rel="noreferrer">
                          {new URL(p.source).hostname.replace(/^www\./, "")}
                          {p.until ? ` · promo to ${p.until}` : ""}
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Past runs */}
      {runs.length > 0 && (
        <Section title="Past runs in this browser">
          <ul className="space-y-1.5">
            {runs.map((r) => {
              const models = [...new Set(r.results.map((x) => x.model))].length;
              const kinds = [...new Set(r.results.map((x) => x.scenario))].length;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <button className={`underline ${current?.id === r.id ? "font-semibold text-ink" : "text-ink-soft"}`} onClick={() => setCurrent(r)}>
                    {new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </button>
                  <span className="text-xs text-ink-faint">
                    {models} model{models === 1 ? "" : "s"} · {kinds} type{kinds === 1 ? "" : "s"} · thinking {r.effort}
                  </span>
                </li>
              );
            })}
          </ul>
          <button
            className={`${quiet} mt-3`}
            onClick={() => {
              setRuns([]);
              save(RUNS_KEY, []);
            }}
          >
            Clear past runs
          </button>
        </Section>
      )}

      <details className="mt-10 rounded-lg border border-sand-deep/40 p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">Search and quota diagnostics</summary>
        <ModelCheck embedded />
      </details>

      <Link href="/trips" className="mt-8 inline-block text-sm text-teal underline">
        Back to trips
      </Link>
    </main>
  );
}

function Pick({ label, row, detail }) {
  return (
    <div className="rounded-lg border border-teal/40 bg-teal/5 p-2.5">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="mt-0.5 break-all text-sm font-medium text-ink">{row?.model || "—"}</div>
      <div className="text-xs text-ink-faint">{detail}</div>
    </div>
  );
}
