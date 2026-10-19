import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  clearAdminCookie,
  requireAdmin,
  requireTrustedOrigin,
  revokeAllAdminSessions,
} from "../lib/auth.js";
import { methodNotAllowed, sendJson } from "../lib/http.js";

/** Invalidates every Redis-backed admin session, including the caller's. */
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!requireTrustedOrigin(request, response) || !(await requireAdmin(request, response))) return;
  try {
    await revokeAllAdminSessions();
    clearAdminCookie(response);
    sendJson(response, 200, { authenticated: false, allDevicesSignedOut: true });
  } catch (error) {
    console.error("Admin logout-all failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    sendJson(response, 503, { error: "تعذر إنهاء الجلسات الآن." });
  }
}
