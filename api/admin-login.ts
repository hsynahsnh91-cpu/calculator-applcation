import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  adminPasswordConfigured,
  createAdminToken,
  passwordMatches,
  requireTrustedOrigin,
  setAdminCookie,
} from "./_lib/auth";
import { clientIp, methodNotAllowed, readJsonBody, sendJson } from "./_lib/http";
import { clearFailedLoginAttempts, failedLoginAttempt, loginBlocked, redis } from "./_lib/redis";

const loginSchema = z.object({ password: z.string().min(1).max(1_024) }).strict();

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!requireTrustedOrigin(request, response)) return;
  if (!adminPasswordConfigured()) {
    sendJson(response, 503, {
      error: "لم تُضبط متغيرات حماية الإدارة في Vercel بعد.",
    });
    return;
  }
  if (!redis()) {
    sendJson(response, 503, {
      error: "يلزم ربط Redis قبل فتح الإدارة كي يعمل حد محاولات الدخول بأمان.",
    });
    return;
  }
  const ip = clientIp(request);
  try {
    const blocked = await loginBlocked(ip);
    if (blocked.blocked) {
      response.setHeader("Retry-After", String(blocked.retryAfterSeconds));
      sendJson(response, 429, {
        error: "تجاوزت الحد المسموح لمحاولات الدخول. أعد المحاولة لاحقًا.",
        retryAfterSeconds: blocked.retryAfterSeconds,
      });
      return;
    }
    const parsed = loginSchema.safeParse(await readJsonBody(request));
    if (!parsed.success || !passwordMatches(parsed.data.password)) {
      const attempt = await failedLoginAttempt(ip);
      if (attempt.blocked) response.setHeader("Retry-After", String(attempt.retryAfterSeconds));
      sendJson(response, attempt.blocked ? 429 : 401, {
        error: attempt.blocked
          ? "تجاوزت الحد المسموح لمحاولات الدخول. أعد المحاولة لاحقًا."
          : "كلمة المرور غير صحيحة.",
        ...(attempt.blocked ? { retryAfterSeconds: attempt.retryAfterSeconds } : {}),
      });
      return;
    }
    await clearFailedLoginAttempts(ip);
    setAdminCookie(response, createAdminToken());
    sendJson(response, 200, { authenticated: true, expiresInSeconds: 8 * 60 * 60 });
  } catch {
    sendJson(response, 503, {
      error: "تعذّر التحقق الآمن من الدخول الآن. لم تُفتح جلسة إدارة.",
    });
  }
}
