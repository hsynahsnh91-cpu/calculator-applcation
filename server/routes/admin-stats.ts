import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../lib/auth.js";
import { failureSection, listedFailures } from "../lib/failures.js";
import { methodNotAllowed, sendJson } from "../lib/http.js";
import { getCurrentSnapshot, getSolveCounters } from "../lib/knowledgeStore.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  if (!(await requireAdmin(request, response))) return;
  try {
    const [snapshot, failures, counters] = await Promise.all([
      getCurrentSnapshot(),
      listedFailures(100),
      getSolveCounters(),
    ]);
    const sectionCounts = new Map<string, number>();
    failures.forEach((failure) => {
      const section = failureSection(failure.sampleQuestion);
      sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + failure.count);
    });
    sendJson(response, 200, {
      approvedItems: snapshot?.items.length ?? 0,
      corrections: snapshot?.items.filter((item) => item.type === "correction").length ?? 0,
      solveAttempts: counters.attempts,
      solveSuccesses: counters.successes,
      solveRate: counters.attempts ? counters.successes / counters.attempts : null,
      mostFailingSections: [...sectionCounts.entries()]
        .map(([section, count]) => ({ section, count }))
        .sort((first, second) => second.count - first.count)
        .slice(0, 5),
    });
  } catch (error) {
    console.error("Admin stats route failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    sendJson(response, 503, { error: "تعذر تجميع إحصاءات اللوحة." });
  }
}
