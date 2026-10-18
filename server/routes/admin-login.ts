import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  adminConfigurationError,
  createAdminToken,
  passwordMatches,
  requireTrustedOrigin,
  setAdminCookie,
} from "../lib/auth.js";
import { clientIp, methodNotAllowed, readJsonBody, sendJson } from "../lib/http.js";
import {
  clearFailedLoginAttempts,
  failedLoginAttempt,
  loginBlocked,
  redis,
  redisConfigurationMessage,
} from "../lib/redis.js";

const loginSchema = z.object({ password: z.string().min(1).max(1_024) }).strict();

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!requireTrustedOrigin(request, response)) return;
  const adminConfiguration = adminConfigurationError();
  if (adminConfiguration) {
    sendJson(response, 503, { error: adminConfiguration });
    return;
  }
  if (!redis()) {
    sendJson(response, 503, {
      error:
        redisConfigurationMessage() ??
        "يلزم ربط Redis قبل فتح الإدارة كي يعمل حد محاولات الدخول بأمان.",
    });
    return;
  }
  let parsed: ReturnType<typeof loginSchema.safeParse>;
  try {
    parsed = loginSchema.safeParse(await readJsonBody(request));
  } catch {
    sendJson(response, 400, { error: "بيانات تسجيل الدخول غير صالحة." });
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
  } catch (error) {
    // Do not expose provider details or credentials, but retain a non-secret
    // error class in Vercel logs for operational diagnosis.
    console.error(
      "Admin login rate-limit or session issuance failed.",
      error instanceof Error ? error.name : "unknown-error",
    );
    const configurationError = adminConfigurationError();
    sendJson(response, 503, {
      error:
        configurationError ??
        "تعذر الاتصال الآمن بخدمة Redis للتحقق من محاولات الدخول. راجع اتصال Redis ورمز REST في إعدادات Vercel؛ لم تُفتح جلسة إدارة.",
    });
  }
}
