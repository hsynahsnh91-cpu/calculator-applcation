import { isProbabilityContext } from "./probabilityTypes";
import { ENGINE_LABELS, type ConversationTurn } from "./types";
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const text = (value: unknown, limit = 8000): value is string =>
  typeof value === "string" && value.length <= limit;
const strings = (value: unknown, limit = 32): value is string[] =>
  Array.isArray(value) &&
  value.length <= limit &&
  value.every((item: unknown) => text(item));
const engine = (value: unknown) =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(ENGINE_LABELS, value);
const matrix = (value: unknown) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 6 &&
  value.every(
    (row: unknown) =>
      Array.isArray(row) &&
      row.length > 0 &&
      row.length <= 6 &&
      row.every(finite),
  );
function context(value: unknown, partial = false): boolean {
  if (!record(value)) return false;
  const assignments = value.assignments;
  return (
    ((partial && assignments === undefined) ||
      (record(assignments) &&
        Object.keys(assignments).length <= 26 &&
        Object.entries(assignments).every(
          ([key, entry]) => /^[a-z]$/.test(key) && finite(entry),
        ))) &&
    ["expression", "variable", "derivative", "lastPrompt"].every(
      (key) => value[key] === undefined || text(value[key]),
    ) &&
    (value.solutions === undefined ||
      (record(value.solutions) &&
        Object.keys(value.solutions).length <= 3 &&
        Object.entries(value.solutions).every(
          ([key, entry]) => /^[xyz]$/.test(key) && finite(entry),
        ))) &&
    (value.complex === undefined ||
      (record(value.complex) &&
        record(value.complex.values) &&
        Object.keys(value.complex.values).length <= 12 &&
        Object.entries(value.complex.values).every(
          ([key, v]) =>
            /^(?:z(?:_[A-Z]|[1-9])?|omega|[abcdw])$/.test(key) && text(v, 900),
        ) &&
        (value.complex.current === undefined ||
          text(value.complex.current, 900)) &&
        (value.complex.pointNames === undefined ||
          (strings(value.complex.pointNames, 12) &&
            value.complex.pointNames.every((name) => /^[A-Z]$/.test(name)))) &&
        (value.complex.ambiguous === undefined ||
          typeof value.complex.ambiguous === "boolean"))) &&
    (value.probability === undefined ||
      isProbabilityContext(value.probability)) &&
    (value.lastEngine === undefined || engine(value.lastEngine)) &&
    (value.matrix === undefined || matrix(value.matrix))
  );
}
function tree(
  value: unknown,
  depth: number,
  budget: { remaining: number },
): boolean {
  if (
    !record(value) ||
    depth > 8 ||
    --budget.remaining < 0 ||
    !text(value.label, 200) ||
    !text(value.probability, 1000)
  )
    return false;
  return (
    value.children === undefined ||
    (Array.isArray(value.children) &&
      value.children.length <= 12 &&
      value.children.every((child: unknown) => tree(child, depth + 1, budget)))
  );
}
function visual(value: unknown): boolean {
  if (!record(value) || !text(value.title, 500)) return false;
  if (value.kind === "histogram")
    return (
      Array.isArray(value.bins) &&
      value.bins.length > 0 &&
      value.bins.length <= 100 &&
      value.bins.every(
        (bin: unknown) =>
          record(bin) &&
          text(bin.label, 120) &&
          finite(bin.value) &&
          bin.value >= 0 &&
          ((bin.start === undefined && bin.end === undefined) ||
            (finite(bin.start) && finite(bin.end) && bin.end > bin.start)),
      ) &&
      (value.discrete === undefined || typeof value.discrete === "boolean") &&
      (value.density === undefined || typeof value.density === "boolean") &&
      (value.color === undefined ||
        (typeof value.color === "string" &&
          /^#[0-9a-f]{6}$/i.test(value.color))) &&
      (value.note === undefined || text(value.note, 1000))
    );
  if (value.kind === "table") return text(value.latex, 50000);
  if (value.kind === "formula-cards")
    return (
      Array.isArray(value.cards) &&
      value.cards.length <= 8 &&
      value.cards.every(
        (card: unknown) =>
          record(card) &&
          text(card.label, 200) &&
          text(card.latex, 8000) &&
          (card.caption === undefined || text(card.caption, 1000)),
      )
    );
  if (value.kind === "tree") return tree(value.root, 0, { remaining: 200 });
  if (value.kind === "complex")
    return (
      Array.isArray(value.points) &&
      value.points.length <= 64 &&
      value.points.every(
        (point: unknown) =>
          record(point) &&
          finite(point.re) &&
          finite(point.im) &&
          text(point.label, 200),
      ) &&
      (value.circle === undefined ||
        (record(value.circle) &&
          finite(value.circle.re) &&
          finite(value.circle.im) &&
          finite(value.circle.radius) &&
          value.circle.radius >= 0)) &&
      (value.connections === undefined ||
        (Array.isArray(value.connections) &&
          value.connections.length <= 128 &&
          value.connections.every(
            (line: unknown) =>
              record(line) &&
              finite(line.from) &&
              Number.isInteger(line.from) &&
              line.from >= 0 &&
              line.from < (value.points as unknown[]).length &&
              finite(line.to) &&
              Number.isInteger(line.to) &&
              line.to >= 0 &&
              line.to < (value.points as unknown[]).length &&
              (line.arrow === undefined || typeof line.arrow === "boolean") &&
              (line.label === undefined || text(line.label, 100)),
          )))
    );
  if (value.kind === "curve")
    return (
      Array.isArray(value.series) &&
      value.series.length <= 8 &&
      value.series.every(
        (series: unknown) =>
          record(series) &&
          text(series.label, 300) &&
          (series.dots === undefined || typeof series.dots === "boolean") &&
          (series.color === undefined ||
            (typeof series.color === "string" &&
              /^#[0-9a-f]{3,8}$/i.test(series.color))) &&
          Array.isArray(series.points) &&
          series.points.length <= 2500 &&
          series.points.every(
            (point: unknown) =>
              record(point) &&
              finite(point.x) &&
              (point.y === null || finite(point.y)),
          ),
      )
    );
  return false;
}
function knowledge(value: unknown): boolean {
  if (!record(value) || (value.source !== "approved" && value.source !== "engine")) return false;
  return (
    (value.itemId === undefined || text(value.itemId, 200)) &&
    (value.matchScore === undefined ||
      (finite(value.matchScore) && value.matchScore >= 0 && value.matchScore <= 1)) &&
    (value.relatedRules === undefined ||
      (Array.isArray(value.relatedRules) &&
        value.relatedRules.length <= 5 &&
        value.relatedRules.every(
          (rule: unknown) =>
            record(rule) &&
            text(rule.id, 200) &&
            text(rule.text, 8000) &&
            (rule.latex === undefined || text(rule.latex, 8000)) &&
            finite(rule.confidence) &&
            rule.confidence >= 0 &&
            rule.confidence <= 1,
        )))
  );
}
function result(value: unknown): boolean {
  if (
    !record(value) ||
    !text(value.id, 200) ||
    !engine(value.engine) ||
    !Array.isArray(value.engines) ||
    value.engines.length > 13 ||
    !value.engines.every(engine)
  )
    return false;
  const verification = value.verification;
  return (
    typeof value.mode === "string" &&
    [
      "scientific",
      "equations",
      "sequences",
      "calculus",
      "integration",
      "limits",
      "geometry",
      "probability",
      "matrices",
      "complex",
    ].includes(value.mode) &&
    text(value.title, 1000) &&
    text(value.finalLatex, 50000) &&
    (value.decimal === undefined ||
      finite(value.decimal) ||
      text(value.decimal, 3000)) &&
    Array.isArray(value.steps) &&
    value.steps.length <= 150 &&
    value.steps.every(
      (step: unknown) =>
        record(step) &&
        text(step.title, 1000) &&
        text(step.latex, 50000) &&
        (step.text === undefined || text(step.text)),
    ) &&
    Array.isArray(value.visuals) &&
    value.visuals.length <= 12 &&
    value.visuals.every(visual) &&
    record(verification) &&
    typeof verification.passed === "boolean" &&
    text(verification.method) &&
    (verification.samples === undefined ||
      (finite(verification.samples) && verification.samples >= 0)) &&
    (verification.maxError === undefined ||
      (finite(verification.maxError) && verification.maxError >= 0)) &&
    (value.contextPatch === undefined || context(value.contextPatch, true)) &&
    (value.note === undefined || text(value.note))
  );
}
/** Validate persisted display trees before they reach React, SVG, or the solver. */
export function isConversationTurn(value: unknown): value is ConversationTurn {
  if (
    !record(value) ||
    !text(value.id, 200) ||
    !text(value.question, 7000) ||
    !finite(value.createdAt) ||
    !record(value.answer)
  )
    return false;
  if (
    value.image !== undefined &&
    !(
      typeof value.image === "string" &&
      value.image.length <= 160000 &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value.image)
    )
  )
    return false;
  const answer = value.answer;
  return (
    text(answer.id, 200) &&
    text(answer.question, 7000) &&
    text(answer.intro, 2000) &&
    Array.isArray(answer.results) &&
    answer.results.length <= 60 &&
    answer.results.every(result) &&
    Array.isArray(answer.unsolved) &&
    answer.unsolved.length <= 60 &&
    answer.unsolved.every(
      (part: unknown) =>
        record(part) &&
        text(part.request) &&
        text(part.message) &&
        strings(part.choices) &&
        (part.engine === undefined || engine(part.engine)),
    ) &&
    strings(answer.suggestions) &&
    context(answer.context) &&
    finite(answer.elapsedMs) &&
    answer.elapsedMs >= 0 &&
    (answer.knowledge === undefined || knowledge(answer.knowledge)) &&
    Array.isArray(answer.candidates) &&
    answer.candidates.length <= 13 &&
    answer.candidates.every(
      (candidate: unknown) =>
        record(candidate) &&
        engine(candidate.engine) &&
        finite(candidate.confidence) &&
        candidate.confidence >= 0 &&
        candidate.confidence <= 1 &&
        text(candidate.reason),
    )
  );
}
