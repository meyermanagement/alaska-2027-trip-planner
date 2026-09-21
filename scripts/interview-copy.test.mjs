import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const {
  INTERVIEW_QUESTIONS: questions,
  questionFor,
  questionsFor,
  optionsFor,
  optionForAnswer,
  isInterviewBaseRow,
  multiSentence,
  rankSentence,
} = jiti("../lib/travelers/interview.js");
const { reasonSuggestions, whysAfterUntick, chipSignature } = jiti(
  "../lib/travelers/interviewChips.js",
);
const { personalizeReasons } = jiti("../lib/travelers/interviewPersonalize.js");
const { inferAnswer, priorAnswersFrom } = jiti(
  "../lib/travelers/interviewInference.js",
);
const { summaryForAnswer } = jiti("../lib/travelers/runningSummary.js");
const oldLabels = jiti("../lib/travelers/interviewLegacyLabels.json");
const oldChips = jiti("../lib/travelers/interviewLegacyChips.json");
const contexts = [
  { solo: true, hasKids: false, kidNames: [] },
  { solo: false, hasKids: false, kidNames: [] },
  { solo: false, hasKids: true, kidNames: ["Riley"] },
  { solo: false, hasKids: true, kidNames: ["Riley", "Casey"] },
  { solo: false, hasKids: null, kidNames: [] },
];

function combinations(values, max) {
  return values
    .reduce(
      (sets, value) => [
        ...sets,
        ...sets.filter((s) => s.length < max).map((s) => [...s, value]),
      ],
      [[]],
    )
    .filter((s) => s.length);
}

test("all eleven questions have clear prompts and retain stable answer values", () => {
  assert.equal(questions.length, 11);
  assert.equal(questionsFor({ hasPets: false }).length, 10);
  assert.equal(questionsFor({ hasPets: true }).length, 11);
  for (const q of questions) {
    assert.ok(q.prompt.endsWith("?"), q.slot);
    assert.deepEqual(
      (q.options || []).map((o) => o.value),
      Object.keys(oldLabels[q.slot].options),
    );
    for (const o of q.options || []) {
      assert.ok(o.label && o.detail);
      assert.equal(
        optionForAnswer(q, oldLabels[q.slot].options[o.value])?.value,
        o.value,
      );
    }
  }
});

test("all allowed combinations offer every relevant detail without duplicates or opposing-option chips", () => {
  let checked = 0;
  for (const ctx of contexts)
    for (const original of questions) {
      const q = optionsFor(original, ctx);
      if (!q.options?.some((o) => o.reasons)) continue;
      for (const choices of combinations(
        q.options.map((o) => o.value),
        q.kind === "multi" ? q.max : 1,
      )) {
        const { primary, more } = reasonSuggestions({
          question: q,
          choices,
          context: ctx,
        });
        const actual = [...primary, ...more].map(chipSignature);
        const expected = [
          ...choices.flatMap((value) => {
            const opt = q.options.find((o) => o.value === value);
            return personalizeReasons(
              [...(opt.reasons || []), ...(opt.more || [])],
              ctx,
            );
          }),
          ...personalizeReasons(q.otherReasons || [], ctx),
        ].map(chipSignature);
        assert.ok(primary.length <= 6);
        assert.equal(actual.length, new Set(actual).size);
        assert.deepEqual(
          new Set(actual),
          new Set(expected),
          `${q.slot}: ${choices}`,
        );
        if (ctx.solo)
          assert.ok(
            !/\b(we|us|our|kids|children)\b/i.test(
              [...primary, ...more].join(" "),
            ),
          );
        assert.ok(
          !/\bRiley (do|are|have|eat|like|need)\b/.test(
            [...primary, ...more].join(" "),
          ),
        );
        checked++;
      }
    }
  console.log(`Checked ${checked} question/choice/household combinations.`);
});

test("historical details stay visible verbatim and can be removed with their option", () => {
  for (const q of questions)
    for (const o of q.options || []) {
      for (const old of oldChips[q.slot]?.[o.value] || []) {
        const rows = reasonSuggestions({
          question: q,
          choices: [o.value],
          whys: [old],
        });
        assert.ok([...rows.primary, ...rows.more, ...rows.saved].includes(old));
        assert.deepEqual(
          whysAfterUntick({
            question: q,
            removed: o.value,
            remaining: [],
            whys: [old],
          }),
          [],
        );
      }
    }
});

test("removing a multi-select option preserves the remaining option and neutral reasons", () => {
  const q = questionFor("staying");
  const hotel = q.options.find((o) => o.value === "hotel").reasons[0];
  const rental = q.options.find((o) => o.value === "rental").more[0];
  const neutral = q.otherReasons[0];
  assert.deepEqual(
    whysAfterUntick({
      question: q,
      removed: "hotel",
      remaining: ["rental"],
      whys: [hotel, rental, neutral],
    }),
    [rental, neutral],
  );
});

test("switching a single answer drops its reasons but preserves neutral details", () => {
  const q = questionFor("pace");
  const own = q.options[0].reasons[0];
  const extra = q.options[0].more[0];
  const neutral = q.otherReasons[0];
  assert.deepEqual(
    whysAfterUntick({
      question: q,
      removed: "packed",
      remaining: ["one_thing"],
      whys: [own, extra, neutral],
    }),
    [neutral],
  );
});

test("deduplication does not collapse opposite preferences", () => {
  assert.notEqual(
    chipSignature("We always drive."),
    chipSignature("We never drive."),
  );
  assert.notEqual(
    chipSignature("We like crowds."),
    chipSignature("We do not like crowds."),
  );
});

test("old and new base rows are not mistaken for additional reasons", () => {
  for (const q of questions) {
    assert.ok(isInterviewBaseRow(q, `${oldLabels[q.slot].label}: old answer`));
    assert.ok(isInterviewBaseRow(q, `${q.label}: new answer`));
  }
  const prior = priorAnswersFrom({
    slots: [
      { slot: "food", status: "settled", note: "The place with the line" },
    ],
    preferences: [
      {
        slot: "food",
        body: "What you will actually eat: the local place with the line.",
      },
      { slot: "food", body: "The hard reservation before the flights." },
    ],
  });
  assert.equal(prior.food.value, "line");
  assert.deepEqual(prior.food.whys, [
    "The hard reservation before the flights.",
  ]);
});

test("inferences require relevant evidence and accept revised and historic reasons", () => {
  for (const value of ["dawn", "morning", "evening"]) {
    assert.equal(
      inferAnswer("crowds", { day_shape: { value, whys: [] } }),
      null,
    );
  }
  assert.equal(
    inferAnswer("crowds", { food: { value: "quiet", whys: [] } }).strength,
    "likely",
  );
  for (const why of [
    "The hard reservation before the flights.",
    "Plan around a hard-to-get restaurant reservation.",
  ]) {
    assert.equal(
      inferAnswer("money", { food: { value: "line", whys: [why] } }).value,
      "meals",
    );
    assert.equal(
      inferAnswer("money", { food: { value: "line", whys: [why] } }).strength,
      "likely",
    );
  }
  assert.equal(
    inferAnswer("money", {
      food: {
        value: "line",
        whys: ["Plan around a hard-to-get restaurant reservation."],
      },
      getting_around: {
        value: "car",
        whys: ["We will pay more for accommodation with parking included."],
      },
    }),
    null,
  );
  const mixed = priorAnswersFrom({
    slots: [
      {
        slot: "food",
        status: "settled",
        note: "Sought-after restaurants; Quiet, relaxed restaurants",
      },
    ],
  });
  assert.equal(mixed.food.value, null);
  assert.equal(inferAnswer("crowds", mixed), null);
});

test("saved sentences and summaries match the choices rather than adding assumptions", () => {
  for (const q of questions)
    for (const o of q.options || []) {
      const answer = {
        slot: q.slot,
        kind: q.kind,
        picked: ["multi", "rank"].includes(q.kind) ? [o.label] : o.label,
      };
      const summary = summaryForAnswer(answer, "Maui");
      assert.ok(summary?.includes("Maui"), `${q.slot}/${o.value}`);
      assert.ok(
        !/25-minute|three or four|I'll price|I'll book|trim the rest/.test(
          summary,
        ),
      );
    }
  assert.match(
    summaryForAnswer({
      slot: "pace",
      kind: "options",
      picked: "One main activity",
    }),
    /one main activity/,
  );
  assert.match(
    summaryForAnswer({
      slot: "food",
      kind: "multi",
      picked: ["Cooking in", "Markets and casual food"],
    }),
    /cooking in; markets and casual food/,
  );
  assert.match(
    summaryForAnswer({
      slot: "animals",
      kind: "pets",
      picked: "Scout stays home.",
    }),
    /Scout stays home/,
  );
  assert.match(
    summaryForAnswer({
      slot: "day_shape",
      kind: "band",
      picked: "8 am to 9 pm",
    }),
    /between 8 am and 9 pm/,
  );
  assert.equal(summaryForAnswer({ slot: "pace", action: "skip" }), null);
  assert.match(rankSentence(questionFor("money"), ["room"]), /unranked/);
  assert.match(
    multiSentence(questionFor("staying"), ["hotel", "rental"]),
    /not ruled out/,
  );
});
