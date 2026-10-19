import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminChatRequestSchema } from "../../src/admin/types.js";
import { requireAdmin, requireTrustedOrigin } from "../lib/auth.js";
import { respondToAdminChat } from "../lib/adminChat.js";
import { clientIp, methodNotAllowed, readJsonBody, sendJson } from "../lib/http.js";
import { consumeRateLimit, RedisKey } from "../lib/redis.js";

export const config = { maxDuration: 60 };

/** Administrative AI stays server-side, authenticated, rate-limited, and auditable. */
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!requireTrustedOrigin(request, response) || !(await requireAdmin(request, response))) return;

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    sendJson(response, 400, { error: "جسم طلب المحادثة ليس JSON صالحًا." });
    return;
  }
  const parsed = adminChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(response, 400, { error: "بيانات محادثة الإدارة غير مطابقة للمخطط الآمن." });
    return;
  }

  try {
    try {
      const rate = await consumeRateLimit(RedisKey.adminChatRate(clientIp(request)), 30, 5 * 60);
      if (!rate.allowed) {
        response.setHeader("Retry-After", String(rate.retryAfterSeconds));
        sendJson(response, 429, {
          error: "تجاوزت محادثة الإدارة حد الطلبات المؤقت. انتظر ثم أعد المحاولة.",
          retryAfterSeconds: rate.retryAfterSeconds,
        });
        return;
      }
    } catch {
      // Authenticated admin chat still runs when Redis is absent (Firestore-only).
    }
    sendJson(response, 200, await respondToAdminChat(parsed.data));
  } catch (error) {
    console.error("Admin chat route failed", { errorType: error instanceof Error ? error.name : typeof error });
    sendJson(response, 503, { error: "تعذر تشغيل محادثة الإدارة الآن؛ لم يُحفظ أي طلب أو نتيجة." });
  }
}
