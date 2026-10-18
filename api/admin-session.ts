import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdminRequest } from "./_lib/auth";
import { methodNotAllowed, sendJson } from "./_lib/http";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  response.setHeader("Cache-Control", "no-store");
  sendJson(response, 200, { authenticated: isAdminRequest(request) });
}
