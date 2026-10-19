import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  clearAdminCookie,
  requireAdmin,
  requireTrustedOrigin,
  revokeCurrentAdminSession,
} from "../lib/auth.js";
import { methodNotAllowed, sendJson } from "../lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!requireTrustedOrigin(request, response) || !(await requireAdmin(request, response))) return;
  await revokeCurrentAdminSession(request).catch((error: unknown) => {
    console.error("Admin logout session revocation failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
  });
  clearAdminCookie(response);
  sendJson(response, 200, { authenticated: false });
}
