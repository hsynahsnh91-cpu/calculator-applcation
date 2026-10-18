import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  failureRecordSchema,
  publicFailureRequestSchema,
} from "../src/admin/types";
import { canonicalizeQuestion, questionFingerprint } from "../src/admin/normalization";
import { clientIp, methodNotAllowed, readJsonBody, sendJson } from "./_lib/http";
import { RedisKey, redis } from "./_lib/redis";

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
  const client = redis();
  if (!client) {
    response.status(204).end();
    return;
  }
  try {
    const ip = clientIp(request);
    const rateKey = RedisKey.publicFailureRate(ip);
    const rate = await client.incr(rateKey);
    if (rate === 1) await client.expire(rateKey, 60);
    if (rate > RATE_LIMIT_PER_MINUTE) {
      response.status(204).end();
      return;
    }
    const canonicalQuestion = canonicalizeQuestion(parsed.data.question);
    const fingerprint = questionFingerprint(canonicalQuestion);
    const previous = failureRecordSchema.safeParse(
      await client.get<unknown>(RedisKey.failure(fingerprint)),
    );
    const record = failureRecordSchema.parse({
      fingerprint,
      canonicalQuestion,
      sampleQuestion: parsed.data.question,
      count: previous.success ? previous.data.count + 1 : 1,
      lastSeenAt: new Date().toISOString(),
      reason: parsed.data.reason,
    });
    await client.set(RedisKey.failure(fingerprint), record);
    await client.zadd(RedisKey.failureIndex, {
      score: Date.now(),
      member: fingerprint,
    });
    await client.incr(RedisKey.solveAttempts);
    sendJson(response, 202, { accepted: true });
  } catch {
    response.status(204).end();
  }
}
