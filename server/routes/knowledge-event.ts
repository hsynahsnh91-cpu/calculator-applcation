import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { clientIp, methodNotAllowed, readJsonBody, sendJson } from "../lib/http.js";
import { RedisKey, redis } from "../lib/redis.js";

const eventSchema = z.object({ solved: z.boolean() }).strict();

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
    const client = redis();
    if (!client) {
      response.status(204).end();
      return;
    }
    const key = RedisKey.solveRate(clientIp(request));
    const rate = await client.incr(key);
    if (rate === 1) await client.expire(key, 60);
    if (rate <= 60) {
      await client.incr(RedisKey.solveAttempts);
      if (parsed.data.solved) await client.incr(RedisKey.solveSuccesses);
    }
    sendJson(response, 202, { accepted: true });
  } catch {
    response.status(204).end();
  }
}
