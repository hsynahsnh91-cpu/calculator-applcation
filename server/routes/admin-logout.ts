import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearAdminCookie, requireAdmin, requireTrustedOrigin } from "../lib/auth.js";
import { methodNotAllowed, sendJson } from "../lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!requireTrustedOrigin(request, response) || !requireAdmin(request, response)) return;
  clearAdminCookie(response);
  sendJson(response, 200, { authenticated: false });
}
