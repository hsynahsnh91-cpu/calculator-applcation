import { createHash } from "node:crypto";
import {
  type KnowledgeItem,
  type RegressionOutcome,
  type SolverSettings,
} from "../../src/admin/types.js";
import {
  approvedSolutionFromAnswer,
  approvedSolutionsMatch,
  isRegressionKnowledgeItem,
} from "../../src/core/knowledge/regression.js";
import { solvePrompt } from "../../src/core/solver/orchestrator.js";
import { emptyContext } from "../../src/core/solver/types.js";
import { RedisKey, redis } from "./redis.js";

type RegressionCandidate = Pick<
  KnowledgeItem,
  "id" | "type" | "approvedSolution" | "originalText" | "structured" | "unit" | "lesson"
>;

const PARALLELISM = 4;
// Bump this only when a solver/runtime change can alter old answers. It makes
// every affected cached case rerun without trusting a stale result.
const ENGINE_REGRESSION_REVISION = "2026-10-18";
const SUCCESS_TTL_SECONDS = 90 * 24 * 60 * 60;

class RegressionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`انتهت مهلة الاختبار الخادمي (${Math.ceil(timeoutMs / 1000)} ثوانٍ) قبل اكتمال المحرك.`);
    this.name = "RegressionTimeoutError";
  }
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RegressionTimeoutError(timeoutMs)), timeoutMs);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function regressionFingerprint(item: RegressionCandidate, settings: SolverSettings): string {
  const payload = JSON.stringify({
    revision: ENGINE_REGRESSION_REVISION,
    item: {
      id: item.id,
      type: item.type,
      originalText: item.originalText,
      structured: item.structured,
      approvedSolution: item.approvedSolution,
    },
    // Settings can turn an engine off or shorten a deadline, so they are part
    // of the cache identity rather than a guess about which engine ran.
    settings,
  });
  return createHash("sha256").update(payload).digest("hex");
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  work: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await work(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function runOneRegression(
  item: RegressionCandidate,
  settings: SolverSettings,
): Promise<RegressionOutcome> {
  const started = Date.now();
  if (!item.approvedSolution)
    return {
      itemId: item.id,
      passed: false,
      elapsedMs: 0,
      message: "العنصر المعتمد لا يحمل حلًا معتمدًا صالحًا للمقارنة.",
    };
  try {
    const answer = await withTimeout(
      solvePrompt(
        item.structured || item.originalText,
        {
          angleMode: "DEG",
          context: emptyContext(),
          disabledEngines: settings.disabledEngines,
          timeoutMs: settings.timeoutMs,
        },
      ),
      settings.timeoutMs,
    );
    const actual = approvedSolutionFromAnswer(answer);
    const passed = Boolean(
      actual?.verification?.passed && approvedSolutionsMatch(actual, item.approvedSolution),
    );
    return {
      itemId: item.id,
      passed,
      elapsedMs: Date.now() - started,
      message: passed
        ? `نجح: ${item.unit} — ${item.lesson}`
        : "اختلفت نتيجة المحرك الخادمي أو صيغتها عن الحل المعتمد.",
    };
  } catch (error) {
    return {
      itemId: item.id,
      passed: false,
      elapsedMs: Date.now() - started,
      message:
        error instanceof Error
          ? error.message
          : "تعذر تشغيل المحرك الموحد على هذا المثال.",
    };
  }
}

/**
 * Runs a clean unified orchestrator for changed cases, at most four at once.
 * A successful immutable fingerprint is reusable only while its item, settings,
 * and explicit engine revision all match. Failures are never cached.
 */
export async function runServerRegression(
  items: RegressionCandidate[],
  settings: SolverSettings,
): Promise<RegressionOutcome[]> {
  const candidates = items.filter(isRegressionKnowledgeItem);
  const client = redis();
  return mapWithConcurrency(candidates, PARALLELISM, async (item) => {
    const fingerprint = regressionFingerprint(item, settings);
    try {
      if (client && (await client.get<unknown>(RedisKey.regressionFingerprint(fingerprint))))
        return {
          itemId: item.id,
          passed: true,
          elapsedMs: 0,
          message: `نجح سابقًا دون تغيير: ${item.unit} — ${item.lesson}`,
        };
    } catch {
      // Cache trouble must make the case run, never silently pass it.
    }

    const outcome = await runOneRegression(item, settings);
    if (outcome.passed && client)
      await client
        .set(RedisKey.regressionFingerprint(fingerprint), "1", {
          ex: SUCCESS_TTL_SECONDS,
        })
        .catch(() => undefined);
    return outcome;
  });
}
