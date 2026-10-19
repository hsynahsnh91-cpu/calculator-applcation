import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  failureRecordSchema,
  publicFailureRequestSchema,
} from "../../src/admin/types.js";
import { canonicalizeQuestion, questionFingerprint } from "../../src/admin/normalization.js";
import { firestoreAvailable } from "../lib/firestore.js";
import { loadFailure, saveFailure } from "../lib/failures.js";
import { incrementSolveCounters } from "../lib/knowledgeStore.js";
import { clientIp, methodNotAllowed, readJsonBody, sendJson } from "../lib/http.js";
import { consumeRateLimit, RedisKey, redis } from "../lib/redis.js";

const RATE_LIMIT_PER_MINUTE = 20;

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    sendJson(response, 400, { error: "جسم طلب الإخفاق ليس JSON صالحًا." });
    return;
  }
  const parsed = publicFailureRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(response, 400, { error: "بيانات الإخفاق غير صالحة." });
    return;
  }
  const durable = firestoreAvailable() || Boolean(redis());
  if (!durable) {
    response.status(204).end();
    return;
  }
  try {
    if (redis()) {
      const rate = await consumeRateLimit(
        RedisKey.publicFailureRate(clientIp(request)),
        RATE_LIMIT_PER_MINUTE,
        60,
      );
      if (!rate.allowed) {
        response.setHeader("Retry-After", String(rate.retryAfterSeconds));
        sendJson(response, 429, {
          error: "تجاوز بلاغ الإخفاق الحد المسموح مؤقتًا.",
          retryAfterSeconds: rate.retryAfterSeconds,
        });
        return;
      }
    }
    const canonicalQuestion = canonicalizeQuestion(parsed.data.question);
    const fingerprint = questionFingerprint(canonicalQuestion);
    const previous = await loadFailure(fingerprint);
    const record = failureRecordSchema.parse({
      fingerprint,
      canonicalQuestion,
      sampleQuestion: parsed.data.question,
      count: previous ? previous.count + 1 : 1,
      lastSeenAt: new Date().toISOString(),
      reason: parsed.data.reason,
    });
    await saveFailure(record);
    await incrementSolveCounters(false);
    sendJson(response, 202, { accepted: true });
  } catch (error) {
    console.error("Knowledge failure route failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    response.status(204).end();
  }
}
