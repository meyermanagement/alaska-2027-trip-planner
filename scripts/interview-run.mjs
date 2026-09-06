// One real interview, run against the real family's data and a real model.
//
// Not a test: it drives lib/agent/context.js, the ledger and the live Gemini
// ladder the app itself uses, with Veda's actual record and eleven empty slots,
// and prints every tool call so the saved rows can be read rather than trusted.
// The answers are typed by whoever runs it.

import { createInterface } from "node:readline";
import { createJiti } from "jiti";

// Node's own fetch ignores HTTPS_PROXY, and the model key in this sandbox is
// injected by that proxy rather than held here, so requests go out through curl.
// Only this script does it: the app itself runs where the key is an env var.
import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";

globalThis.fetch = async (url, opts = {}) => {
  const out = `/tmp/fetch-${process.pid}-${Math.random().toString(36).slice(2)}`;
  const args = [
    "-s",
    "-o",
    out,
    "-w",
    "%{http_code}",
    "-X",
    opts.method || "GET",
    String(url),
  ];
  for (const [k, v] of Object.entries(opts.headers || {}))
    args.push("-H", `${k}: ${v}`);
  if (opts.body) args.push("--data-binary", "@-");
  const code = execFileSync("curl", args, {
    input: opts.body || undefined,
    maxBuffer: 8 * 1024 * 1024,
    encoding: "utf8",
  });
  const body = readFileSync(out, "utf8");
  unlinkSync(out);
  const status = Number(code) || 502;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    text: async () => body,
    json: async () => JSON.parse(body),
  };
};

const ROOT = "/home/user/workspace/app-src";
const jiti = createJiti(import.meta.url, { alias: { "@": ROOT } });

const context = await jiti.import(`${ROOT}/lib/agent/context.js`);
const toolset = await jiti.import(`${ROOT}/lib/agent/toolset.js`);
const llm = await jiti.import(`${ROOT}/lib/agent/llm.js`);
const rehearse = await jiti.import(`${ROOT}/lib/travelers/rehearse.js`);
// The app's own idea of silence, so the harness cannot report a printed tool call
// as though it were a question.
const { saidNothing } = await jiti.import(`${ROOT}/lib/agent/asked.js`);

const data = JSON.parse(
  await (await import("node:fs/promises")).readFile("/tmp/family.json", "utf8"),
);
const VEDA = "9ef2580f-d697-47f9-9879-11f0311351d1";
const travelers = data.travelers;
const preferences = data.prefs;
const facts = [];
// The animals, because one blank only exists when the family has one and because
// an interview that cannot see Storm tries to add him again.
const pets = data.pets || [];

const FOCUS = `interview:${VEDA}`;
const messages = [];

// Answers can come from the command line, one per turn, so the whole interview
// runs unattended when it is being demonstrated rather than conducted.
const scripted = process.argv.slice(2);
const canned = scripted.length > 0;
const rl = canned
  ? null
  : createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => {
  if (canned) {
    const next = scripted.shift() || "";
    if (next) console.log(`${q}${next}`);
    return Promise.resolve(next);
  }
  return new Promise((res) => rl.question(q, res));
};

function build(said) {
  const ctx = context.buildContext({
    trips: data.trips || [],
    travelers,
    preferences: run.state.preferences,
    facts: run.state.facts,
    slots: run.state.slots,
    pets,
    focus: FOCUS,
    message: said,
    userName: "Mark",
    home: { home_address: "908 Windsor Ct, Webster Groves, MO 63119, USA" },
  });
  const system = context.buildSystemPrompt(ctx.text, FOCUS, ctx.focusTripName, {
    people: ctx.travelerNames,
    intervieweeName: ctx.intervieweeName,
    petNames: [],
  });
  return { ctx, system };
}

function show() {
  const at = run.standing();
  console.log(
    `  ledger: ${at.known}% known | settled ${at.settled.join(",") || "-"} | asking ${
      at.asking.join(",") || "-"
    } | skipped ${at.skipped.join(",") || "-"}`,
  );
}

// The rehearsal engine the app's own /interview-check page runs on: the same
// in-memory apply, the same refusal to retire an unasked question, the same rule
// about what counts as a question. Shared rather than reimplemented, so a run
// here and a run in the browser cannot disagree about what would be saved.
const run = rehearse.rehearsal(VEDA, {
  preferences,
  facts,
  pets,
  people: travelers,
});

let said = await ask("You (as Veda) > ");
while (said && said.trim() && said.trim() !== "quit") {
  const { ctx, system } = build(said);
  show();
  messages.push({ role: "user", text: said });
  const tools = toolset.toolsForRequest({ focus: FOCUS, message: said });
  const started = Date.now();
  const out = await llm.generate({
    system,
    messages,
    tools,
    temperature: 0.7,
    deadline: Date.now() + 60000,
  });
  console.log(
    `\n[${out.model || "?"} · ${((Date.now() - started) / 1000).toFixed(1)}s · ${
      ctx.text.length
    } chars of context · ${tools.length} tools]`,
  );
  // The route's own second pass: a turn that saved something and said nothing
  // owes the person a sentence and the next question. Tools taken away, or it
  // answers by calling one again.
  // saidNothing, the same helper the route uses: a reply that is really a tool
  // call typed out as prose counts as silence here too, or the harness prints
  // add_pet(name='Storm') as if it were a question and the run looks fine.
  if (saidNothing(out.text)) {
    const again = await llm.generate({
      system: [
        system,
        "You are getting to know somebody, and you have just saved what they told you. Say in one line what you took from it, then put the one question the context hands you next, in words. Do not describe the card.",
      ].join("\n\n"),
      messages,
      tools: [],
      temperature: 0.7,
      deadline: Date.now() + 40000,
      avoid: out.model ? [out.model] : [],
    });
    if ((again?.text || "").trim()) {
      console.log("  (asked again for words)");
      out.text = again.text;
    }
  }
  console.log(`\nAly: ${out.text}\n`);
  for (const call of out.calls || []) {
    console.log(`  → ${call.name} ${JSON.stringify(call.args)}`);
    const result = run.apply(call);
    if (result?.refused) console.log(`    (refused: ${result.refused})`);
  }
  // The adapter takes user/assistant only, and the app stores the reply's words
  // rather than its calls, so the transcript here matches what the route keeps.
  messages.push({ role: "assistant", text: out.text });
  run.noteAsked(ctx.interviewSlot, out.text || "");
  said = await ask("\nYou (as Veda) > ");
}
if (rl) rl.close();
console.log("\nFinal ledger:");
show();
console.log(JSON.stringify(run.written(), null, 2));
