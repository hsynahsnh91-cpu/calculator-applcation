import type { VercelRequest, VercelResponse } from "@vercel/node";
import { publishRequestSchema, type RegressionOutcome } from "../src/admin/types";
import { requireAdmin, requireTrustedOrigin } from "./_lib/auth";
import { methodNotAllowed, readJsonBody, sendJson } from "./_lib/http";
import { getCurrentSnapshot, publishSnapshot } from "./_lib/knowledgeStore";

export const config = { maxDuration: 30 };

function regressionFailures(
  previousItems: { id: string; type: string; approvedSolution?: unknown }[],
  outcomes: RegressionOutcome[],
): RegressionOutcome[] {
  const expected = previousItems.filter(
    (item) =>
      Boolean(item.approvedSolution) &&
      ["example", "exercise", "correction"].includes(item.type),
  );
  const received = new Map(outcomes.map((outcome) => [outcome.itemId, outcome]));
  return expected.flatMap((item) => {
    const result = received.get(item.id);
    if (!result)
      return [
        {
          itemId: item.id,
          passed: false,
          elapsedMs: 0,
          message: "لم يُشغّل هذا المثال المنشور ضمن اختبار الانحدار.",
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
    const failures = regressionFailures(previous?.items ?? [], parsed.data.regression);
    if (failures.length && !parsed.data.force) {
      sendJson(response, 409, {
        error: "أوقف اختبار الانحدار النشر لأن أمثلة منشورة لم تنجح أو لم تختبر.",
        failures,
        canForce: true,
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
      forcedDespiteRegression: failures.length > 0,
      regressionFailures: failures,
    });
  } catch (error) {
    sendJson(response, 503, {
      error: error instanceof Error ? error.message : "تعذّر النشر ولم تتغير النسخة الحالية.",
    });
  }
}
