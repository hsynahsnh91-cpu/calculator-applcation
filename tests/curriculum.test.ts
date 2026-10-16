import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import katex from "katex";
import { solvePrompt } from "../src/solver/orchestrator";
import { isConversationTurn } from "../src/solver/validation";
import { math } from "../src/solver/math";
import type { SolverAnswer } from "../src/solver/types";
interface Case {
  id: string;
  chapter: string;
  prompt: string;
  expect: {
    clarify?: boolean;
    results?: number;
    scalar?: string;
    scalars?: Record<string, string>;
    contains?: string[];
    exponential?: boolean;
    proof?: boolean;
    induction?: boolean;
    unique?: boolean;
    partial?: boolean;
    reset?: boolean;
    label?: string;
  };
}
const cases = JSON.parse(
  readFileSync("tests/fixtures/curriculum.json", "utf8"),
) as Case[];
let passed = 0,
  failed = 0;
const records: unknown[] = [];
function validate(answer: SolverAnswer) {
  assert(
    isConversationTurn(
      JSON.parse(
        JSON.stringify({
          id: "curriculum",
          question: answer.question,
          answer,
          createdAt: 1,
        }),
      ),
    ),
    "persistence guard",
  );
  for (const r of answer.results) {
    for (const latex of [
      r.finalLatex,
      ...r.steps.map((s) => s.latex),
      ...r.visuals.flatMap((v) =>
        v.kind === "table"
          ? [v.latex]
          : v.kind === "formula-cards"
            ? v.cards.map((c) => c.latex)
            : [],
      ),
    ])
      katex.renderToString(latex, { throwOnError: true, strict: "ignore" });
    if (r.verification.passed) {
      assert(r.verification.method.trim());
      assert(
        r.verification.maxError === undefined ||
          Number.isFinite(r.verification.maxError),
      );
    }
  }
}
const scalar = (answer: SolverAnswer, index: number, expected: string) => {
  const actual = answer.results[index].decimal;
  const n = typeof actual === "number" ? actual : Number(actual),
    want = Number(math.evaluate(expected));
  assert(
    Number.isFinite(n) &&
      Math.abs(n - want) <= 1e-8 * Math.max(1, Math.abs(want)),
    `result ${index}: ${actual} != ${expected}`,
  );
};
for (const c of cases) {
  let answer: SolverAnswer | undefined;
  try {
    answer = await solvePrompt(c.prompt, { angleMode: "DEG" });
    validate(answer);
    const e = c.expect;
    if (e.clarify) {
      assert.equal(
        answer.results.length,
        0,
        "unsupported/missing data must not get a fabricated answer",
      );
      assert(answer.unsolved.length > 0);
    } else {
      if (e.partial) assert(answer.unsolved.length > 0);
      else
        assert.equal(
          answer.unsolved.length,
          0,
          JSON.stringify(answer.unsolved),
        );
      if (e.results !== undefined)
        assert.equal(answer.results.length, e.results);
      if (e.scalar) scalar(answer, answer.results.length - 1, e.scalar);
      for (const [i, v] of Object.entries(e.scalars || {}))
        scalar(answer, Number(i), v);
      const text = answer.results
        .map((r) => [r.finalLatex, ...r.steps.map((s) => s.latex)].join("\n"))
        .join("\n");
      for (const needle of e.contains || [])
        assert(text.includes(needle), `missing ${needle}`);
      if (e.exponential)
        assert(
          answer.results.some(
            (r) =>
              r.steps.some((s) =>
                /أسي|اسي|موافر|الصيغة الأسية|ديموافر/.test(s.title + s.text),
              ) && r.steps.some((s) => s.latex.includes("e^")),
          ),
          "requested exponential method must really appear",
        );
      if (e.proof)
        assert(
          answer.results.some((r) => r.steps.length >= 3),
          "a verdict alone is not a proof",
        );
      if (e.induction) {
        const prose = answer.results
          .flatMap((r) => r.steps)
          .map((s) => s.title + " " + s.text)
          .join(" ");
        assert(
          /بداية|الابتدائية/.test(prose) &&
            /فرض|افتراض/.test(prose) &&
            /انتقال|n\+1|خطوة/.test(prose),
          "induction needs base, hypothesis and transfer",
        );
      }
      if (e.unique) {
        const prose = answer.results
          .flatMap((r) => r.steps)
          .map((s) => s.title + " " + s.text)
          .join(" ");
        assert(
          /استمرار|مستمر/.test(prose) &&
            /متوسطة|المتوسطة/.test(prose) &&
            /رتابة|رتيب|متناقص|متزايد/.test(prose),
          "uniqueness requires continuity, IVT and monotonicity, not root probes",
        );
      }
      if (e.reset) {
        assert.equal(answer.context.probability?.urn?.count, 2);
        assert.equal(answer.context.probability?.urn?.mode, "simultaneous");
        assert.equal(
          answer.context.probability?.urn?.colors.reduce(
            (s, c) => s + c.count,
            0,
          ),
          5,
        );
      }
    }
    passed++;
    console.log("PASS", c.id, c.chapter);
    records.push({
      id: c.id,
      chapter: c.chapter,
      passed: true,
      results: answer.results.map((r) => ({
        title: r.title,
        latex: r.finalLatex,
        decimal: r.decimal,
      })),
      unsolved: answer.unsolved,
    });
  } catch (error) {
    failed++;
    console.error("FAIL", c.id, c.chapter, String(error));
    records.push({
      id: c.id,
      chapter: c.chapter,
      passed: false,
      error: String(error),
      results: answer?.results.map((r) => ({
        title: r.title,
        latex: r.finalLatex,
        decimal: r.decimal,
      })),
      unsolved: answer?.unsolved,
    });
  }
}
mkdirSync(".arena/qa", { recursive: true });
writeFileSync(
  process.env.CURRICULUM_REPORT || ".arena/qa/curriculum-cases.json",
  JSON.stringify({ passed, failed, cases: records }, null, 2) + "\n",
);
console.log(`\nCurriculum: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
