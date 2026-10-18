import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../lib/auth.js";
import { failureSection, listedFailures } from "../lib/failures.js";
import { methodNotAllowed, sendJson } from "../lib/http.js";
import { getCurrentSnapshot } from "../lib/knowledgeStore.js";
import { RedisKey, redis } from "../lib/redis.js";

function finiteCounter(value: unknown): number {
  const result = typeof value === "string" ? Number(value) : value;
  return typeof result === "number" && Number.isFinite(result) && result >= 0 ? result : 0;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  if (!requireAdmin(request, response)) return;
  try {
    const client = redis();
    if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
    const [snapshot, failures, attemptsRaw, successesRaw] = await Promise.all([
      getCurrentSnapshot(),
      listedFailures(100),
      client.get<unknown>(RedisKey.solveAttempts),
      client.get<unknown>(RedisKey.solveSuccesses),
    ]);
    const attempts = finiteCounter(attemptsRaw);
    const successes = finiteCounter(successesRaw);
    const sectionCounts = new Map<string, number>();
    failures.forEach((failure) => {
      const section = failureSection(failure.sampleQuestion);
      sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + failure.count);
    });
    sendJson(response, 200, {
      approvedItems: snapshot?.items.length ?? 0,
      corrections: snapshot?.items.filter((item) => item.type === "correction").length ?? 0,
      solveAttempts: attempts,
      solveSuccesses: successes,
      solveRate: attempts ? successes / attempts : null,
      mostFailingSections: [...sectionCounts.entries()]
        .map(([section, count]) => ({ section, count }))
        .sort((first, second) => second.count - first.count)
        .slice(0, 5),
    });
  } catch (error) {
    sendJson(response, 503, {
      error: error instanceof Error ? error.message : "تعذر تجميع إحصاءات اللوحة.",
    });
  }
}
