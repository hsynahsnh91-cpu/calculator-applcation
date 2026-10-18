import type { DrawMode } from "../utils/probabilityEngine.js";
import type { SolverResult } from "./types.js";

export type ProbabilityComparison = "eq" | "ge" | "gt" | "le" | "lt";
export interface UrnModel {
  colors: { name: string; count: number }[];
  count: number;
  mode: DrawMode;
  target?: string;
}
export interface DiscreteLaw {
  symbol: "X" | "Y";
  values: string[];
  probabilities: string[];
}
export interface StatisticsModel {
  values: number[];
  frequencies?: number[];
  exactValues?: string[];
}
export interface MixtureModel {
  weights: string[];
  conditionals: string[];
  labels?: string[];
}
export interface JointModel {
  x: string[];
  y: string[];
  matrix: string[][];
}
export interface BinomialModel {
  n: number;
  p: string;
}
export interface NormalModel {
  mu: number;
  sigma: number;
}
export interface ProbabilityContext {
  active:
    | "urn"
    | "law"
    | "events"
    | "statistics"
    | "mixture"
    | "joint"
    | "binomial"
    | "normal";
  urn?: UrnModel;
  urnQuery?: UrnQuery;
  law?: DiscreteLaw;
  statistics?: StatisticsModel;
  events?: Record<string, string>;
  mixture?: MixtureModel;
  joint?: JointModel;
  binomial?: BinomialModel;
  normal?: NormalModel;
  lastScalar?: number;
  lastScalarExact?: string;
}
export type UrnQuery = {
  type:
    | "count"
    | "law"
    | "same"
    | "different"
    | "all-distinct"
    | "all-events"
    | "color"
    | "ordered"
    | "composition";
  sequence?: string[];
  conditionalOn?: "first" | "second";
  composition?: { color: string; count: number }[];
  color?: string;
  k?: number;
  comparison?: ProbabilityComparison;
  complement?: boolean;
  first?: boolean;
  moment?: "mean" | "variance" | "sigma" | "second";
};
export type ProbabilityRequest =
  | {
      kind: "classical";
      total: string;
      favorable: string;
      event: string;
      complement?: boolean;
    }
  | { kind: "urn"; model: UrnModel; query: UrnQuery }
  | {
      kind: "law";
      model: DiscreteLaw;
      moment?: "mean" | "variance" | "sigma" | "second";
      transform?: string;
      generator?: boolean;
    }
  | {
      kind: "events";
      given: Record<string, string>;
      operation:
        | "union"
        | "intersection"
        | "conditional"
        | "complement"
        | "independence"
        | "axioms";
      first: string;
      second: string;
      assumption?: "independent" | "disjoint";
    }
  | { kind: "mixture"; model: MixtureModel; posterior?: number }
  | { kind: "joint"; model: JointModel }
  | {
      kind: "statistics";
      model: StatisticsModel;
      matrix?: boolean;
      metric?: "mean" | "median" | "variance" | "sigma" | "sum";
    }
  | {
      kind: "binomial";
      model: BinomialModel;
      k?: number;
      comparison: ProbabilityComparison;
      moment?: "mean" | "variance" | "sigma" | "second";
      generator?: boolean;
    }
  | {
      kind: "normal";
      model: NormalModel;
      x?: number;
      a?: number;
      b?: number;
      greater?: boolean;
      density?: boolean;
      point?: boolean;
      moment?: "mean" | "variance" | "sigma" | "second";
    }
  | {
      kind: "theorem";
      topic:
        | "counting"
        | "axioms"
        | "conditional"
        | "independence"
        | "tree"
        | "law";
    };
export type ProbabilityAnswer = Pick<
  SolverResult,
  | "title"
  | "finalLatex"
  | "decimal"
  | "steps"
  | "visuals"
  | "verification"
  | "contextPatch"
  | "note"
>;

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const arr = (v: unknown, limit: number, check: (v: unknown) => boolean) =>
  Array.isArray(v) && v.length > 0 && v.length <= limit && v.every(check);
const scalar = (v: unknown) =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 500 &&
  /^[0-9eE+*/^().%\s-]+$/.test(v);
const natural = (v: unknown): v is number =>
  finite(v) && Number.isSafeInteger(v) && v >= 0 && v <= 1000000;
export function isProbabilityContext(v: unknown): v is ProbabilityContext {
  if (
    !record(v) ||
    ![
      "urn",
      "law",
      "events",
      "statistics",
      "mixture",
      "joint",
      "binomial",
      "normal",
    ].includes(String(v.active))
  )
    return false;
  if (v.lastScalar !== undefined && !finite(v.lastScalar)) return false;
  if (
    v.lastScalarExact !== undefined &&
    (!scalar(v.lastScalarExact) || v.lastScalar === undefined)
  )
    return false;
  if (
    v.urn !== undefined &&
    (!record(v.urn) ||
      !natural(v.urn.count) ||
      v.urn.count < 1 ||
      v.urn.count > 32 ||
      ![
        "simultaneous",
        "successive_without_rep",
        "successive_with_rep",
      ].includes(String(v.urn.mode)) ||
      !arr(
        v.urn.colors,
        8,
        (c) =>
          record(c) &&
          typeof c.name === "string" &&
          c.name.length <= 40 &&
          natural(c.count),
      ) ||
      (v.urn.target !== undefined &&
        (typeof v.urn.target !== "string" || v.urn.target.length > 40)))
  )
    return false;
  if (
    v.law !== undefined &&
    (!record(v.law) ||
      !["X", "Y"].includes(String(v.law.symbol)) ||
      !arr(v.law.values, 100, scalar) ||
      !arr(v.law.probabilities, 100, scalar) ||
      (v.law.values as unknown[]).length !==
        (v.law.probabilities as unknown[]).length)
  )
    return false;
  if (
    v.statistics !== undefined &&
    (!record(v.statistics) ||
      !arr(v.statistics.values, 500, (n) => finite(n) && Math.abs(n) <= 1e12) ||
      (v.statistics.frequencies !== undefined &&
        (!arr(v.statistics.frequencies, 500, (n) => natural(n)) ||
          (v.statistics.values as unknown[]).length !==
            (v.statistics.frequencies as unknown[]).length)))
  )
    return false;
  if (
    v.statistics !== undefined &&
    record(v.statistics) &&
    v.statistics.exactValues !== undefined &&
    (!arr(v.statistics.exactValues, 500, scalar) ||
      (v.statistics.exactValues as unknown[]).length !==
        (v.statistics.values as unknown[]).length)
  )
    return false;
  if (
    v.events !== undefined &&
    (!record(v.events) ||
      Object.keys(v.events).length > 24 ||
      !Object.entries(v.events).every(
        ([key, value]) => /^[A-Z](?:[&|+][A-Z]|')?$/.test(key) && scalar(value),
      ))
  )
    return false;
  if (
    v.mixture !== undefined &&
    (!record(v.mixture) ||
      !arr(v.mixture.weights, 8, scalar) ||
      !arr(v.mixture.conditionals, 8, scalar) ||
      (v.mixture.weights as unknown[]).length !==
        (v.mixture.conditionals as unknown[]).length ||
      (v.mixture.labels !== undefined &&
        !arr(
          v.mixture.labels,
          8,
          (s) => typeof s === "string" && s.length <= 60,
        )))
  )
    return false;
  if (
    v.joint !== undefined &&
    (!record(v.joint) ||
      !arr(v.joint.x, 10, scalar) ||
      !arr(v.joint.y, 10, scalar) ||
      !arr(v.joint.matrix, 10, (row) => arr(row, 10, scalar)) ||
      (v.joint.matrix as unknown[]).length !==
        (v.joint.x as unknown[]).length ||
      !(v.joint.matrix as unknown[][]).every(
        (row) =>
          row.length ===
          ((v.joint as Record<string, unknown>).y as unknown[]).length,
      ))
  )
    return false;
  if (
    v.binomial !== undefined &&
    (!record(v.binomial) ||
      !natural(v.binomial.n) ||
      v.binomial.n > 1000 ||
      !scalar(v.binomial.p))
  )
    return false;
  if (
    v.normal !== undefined &&
    (!record(v.normal) ||
      !finite(v.normal.mu) ||
      !finite(v.normal.sigma) ||
      v.normal.sigma <= 0)
  )
    return false;
  if (
    v.urnQuery !== undefined &&
    (!record(v.urnQuery) ||
      ![
        "count",
        "law",
        "same",
        "different",
        "all-distinct",
        "all-events",
        "color",
        "ordered",
        "composition",
      ].includes(String(v.urnQuery.type)) ||
      (v.urnQuery.sequence !== undefined &&
        !arr(
          v.urnQuery.sequence,
          2,
          (s) => typeof s === "string" && s.length <= 40,
        )) ||
      (v.urnQuery.conditionalOn !== undefined &&
        !["first", "second"].includes(String(v.urnQuery.conditionalOn))) ||
      (v.urnQuery.composition !== undefined &&
        !arr(
          v.urnQuery.composition,
          8,
          (r) =>
            record(r) &&
            typeof r.color === "string" &&
            r.color.length <= 40 &&
            natural(r.count),
        )) ||
      (v.urnQuery.k !== undefined &&
        (!finite(v.urnQuery.k) || !Number.isSafeInteger(v.urnQuery.k))) ||
      (v.urnQuery.color !== undefined &&
        (typeof v.urnQuery.color !== "string" ||
          v.urnQuery.color.length > 40)) ||
      (v.urnQuery.comparison !== undefined &&
        !["eq", "ge", "gt", "le", "lt"].includes(
          String(v.urnQuery.comparison),
        )) ||
      ["first", "complement"].some(
        (k) =>
          v.urnQuery !== undefined &&
          record(v.urnQuery) &&
          v.urnQuery[k] !== undefined &&
          typeof v.urnQuery[k] !== "boolean",
      ) ||
      (v.urnQuery.moment !== undefined &&
        !["mean", "variance", "sigma", "second"].includes(
          String(v.urnQuery.moment),
        )))
  )
    return false;
  return record(v[String(v.active)]);
}
