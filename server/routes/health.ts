import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminEnvironmentStatus, isAdminRequest } from "../lib/auth.js";
import { methodNotAllowed, sendJson } from "../lib/http.js";
import { redis, redisConfigurationMessage } from "../lib/redis.js";
import { firestoreConfigured } from "../lib/secrets.js";

/** Lightweight operational health endpoint; secrets and URLs never leave it. */
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const client = redis();
  let redisReachable = false;
  if (client) {
    try {
      await client.ping();
      redisReachable = true;
    } catch {
      redisReachable = false;
    }
  }
  const authenticated = await isAdminRequest(request);
  const durableOk = redisReachable || firestoreConfigured();
  response.setHeader("Cache-Control", "no-store");
  sendJson(response, 200, {
    status: durableOk ? "ok" : "degraded",
    redis: { configured: Boolean(client), reachable: redisReachable },
    ...(authenticated
      ? { admin: adminEnvironmentStatus() }
      : {
          admin: {
            passwordConfigured: null,
            secretConfigured: null,
            googleAuthConfigured: null,
            geminiConfigured: null,
            firestoreConfigured: null,
          },
        }),
    ...(redisReachable || !authenticated
      ? {}
      : { message: redisConfigurationMessage() ?? "تعذر الوصول إلى Redis." }),
  });
}
