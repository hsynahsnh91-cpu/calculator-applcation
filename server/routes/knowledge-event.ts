import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { firestoreAvailable } from "../lib/firestore.js";
import { incrementSolveCounters } from "../lib/knowledgeStore.js";
import { clientIp, methodNotAllowed, readJsonBody, sendJson } from "../lib/http.js";
import { consumeRateLimit, RedisKey, redis } from "../lib/redis.js";

const eventSchema = z.object({ solved: z.boolean() }).strict();
const RATE_LIMIT_PER_MINUTE = 60;

/** Aggregated counters only: successful questions never send their text to Redis. */
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  try {
    const parsed = eventSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      sendJson(response, 400, { error: "حدث الحل غير صالح." });
      return;
    }
    if (!firestoreAvailable() && !redis()) {
      response.status(204).end();
      return;
    }
    if (redis()) {
      const rate = await consumeRateLimit(
        RedisKey.publicEventRate(clientIp(request)),
        RATE_LIMIT_PER_MINUTE,
        60,
      );
      if (!rate.allowed) {
        response.setHeader("Retry-After", String(rate.retryAfterSeconds));
        sendJson(response, 429, {
          error: "تجاوز حدث الحل الحد المسموح مؤقتًا.",
          retryAfterSeconds: rate.retryAfterSeconds,
        });
        return;
      }
    }
    await incrementSolveCounters(parsed.data.solved);
    sendJson(response, 202, { accepted: true });
  } catch (error) {
    console.error("Knowledge event route failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    response.status(204).end();
  }
}
