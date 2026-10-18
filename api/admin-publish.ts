import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  publishRequestSchema,
  type KnowledgeItem,
  type RegressionOutcome,
} from "../src/admin/types";
import { requireAdmin, requireTrustedOrigin } from "./_lib/auth";
import { methodNotAllowed, readJsonBody, sendJson } from "./_lib/http";
import { getCurrentSnapshot, publishSnapshot } from "./_lib/knowledgeStore";
import { runServerRegression } from "./_lib/regression";

export const config = { maxDuration: 60 };

type RegressionCandidate = Pick<
  KnowledgeItem,
  | "id"
  | "type"
  | "approvedSolution"
  | "originalText"
  | "structured"
  | "unit"
  | "lesson"
>;

function requiresRegression(item: RegressionCandidate): boolean {
  return ["example", "exercise", "correction"].includes(item.type);
}

function expectedRegressionItems(
  publishable: RegressionCandidate[],
  previousItems: RegressionCandidate[],
): RegressionCandidate[] {
  const expected = new Map<string, RegressionCandidate>();
  // The incoming version wins for a changed item. A missing old item remains
  // expected so silently removing a previously approved example cannot skip it.
  [...previousItems, ...publishable]
    .filter(requiresRegression)
    .forEach((item) => expected.set(item.id, item));
  return [...expected.values()];
}

/**
 * Browser outcomes prove the administrator saw a fresh comprehensive test;
 * server outcomes below independently run the same unified orchestrator before
 * the Redis pointer can be changed.
 */
function reportedRegressionFailures(
  expected: RegressionCandidate[],
  outcomes: RegressionOutcome[],
): RegressionOutcome[] {
  const received = new Map<string, RegressionOutcome>();
  const duplicateIds = new Set<string>();
  outcomes.forEach((outcome) => {
    if (received.has(outcome.itemId)) duplicateIds.add(outcome.itemId);
    received.set(outcome.itemId, outcome);
  });

  return expected.flatMap((item) => {
    if (!item.approvedSolution)
      return [
        {
          itemId: item.id,
          passed: false,
          elapsedMs: 0,
          message: `العنصر المعتمد «${item.originalText.slice(0, 120)}» لا يحتوي حلًا معتمدًا صالحًا لاختبار الانحدار.`,
        },
      ];
    if (duplicateIds.has(item.id))
      return [
        {
          itemId: item.id,
          passed: false,
          elapsedMs: 0,
          message: "وردت نتيجة اختبار مكررة لهذا العنصر؛ رُفض النشر حفاظًا على سلامة الاختبار.",
        },
      ];
    const result = received.get(item.id);
    if (!result)
      return [
        {
          itemId: item.id,
          passed: false,
          elapsedMs: 0,
          message: "لم يُشغّل هذا العنصر المعتمد ضمن اختبار الانحدار الإلزامي في اللوحة.",
        },
      ];
    return result.passed ? [] : [result];
  });
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!requireTrustedOrigin(request, response) || !requireAdmin(request, response)) return;
  const started = Date.now();
  try {
    const parsed = publishRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      sendJson(response, 400, { error: "بيانات النشر غير مطابقة للمخطط الآمن." });
      return;
    }
    const publishable = parsed.data.items.filter(
      (item) => item.status === "approved" || item.status === "published",
    );
    if (!publishable.length) {
      sendJson(response, 400, { error: "لا توجد عناصر معتمدة صالحة للنشر." });
      return;
    }

    const previous = await getCurrentSnapshot();
    const expected = expectedRegressionItems(publishable, previous?.items ?? []);
    const reportedFailures = reportedRegressionFailures(expected, parsed.data.regression);
    if (reportedFailures.length) {
      sendJson(response, 409, {
        error:
          "أوقف اختبار الانحدار الإلزامي النشر. أصلح كل الإخفاقات وشغّل الاختبار الشامل مجددًا؛ لا يوجد تجاوز لهذا الحاجز.",
        failures: reportedFailures,
      });
      return;
    }

    // This second, server-side pass prevents a forged or stale browser report
    // from publishing a regression. The immutable Redis version is untouched
    // unless all cases pass here as well.
    const serverOutcomes = await runServerRegression(expected, parsed.data.settings);
    const serverFailures = serverOutcomes.filter((outcome) => !outcome.passed);
    if (serverFailures.length) {
      sendJson(response, 409, {
        error:
          "أوقف الخادم النشر لأن تشغيل المحرك الموحد كشف انحدارًا. أصلح العناصر وأعد الاختبار؛ لا يوجد تجاوز لهذا الحاجز.",
        failures: serverFailures,
      });
      return;
    }

    const saved = await publishSnapshot(parsed.data.items, parsed.data.settings);
    sendJson(response, 200, {
      version: saved.snapshot.version,
      itemCount: saved.snapshot.items.length,
      publishedAt: saved.snapshot.publishedAt,
      elapsedMs: Date.now() - started,
      bytes: saved.bytes,
      regressionPassed: true,
      testedItemCount: expected.length,
    });
  } catch (error) {
    sendJson(response, 503, {
      error: error instanceof Error ? error.message : "تعذّر النشر ولم تتغير النسخة الحالية.",
    });
  }
}
