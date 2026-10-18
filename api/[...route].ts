import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendJson } from "../server/lib/http";

type RouteHandler = (
  request: VercelRequest,
  response: VercelResponse,
) => Promise<void>;

type RouteModule = { default: RouteHandler };

/**
 * Vercel's free plan counts files under /api as serverless functions. Keep one
 * catch-all function here and load the route implementations from /server,
 * preserving the public URLs used by the React application.
 */
const routeLoaders: Record<string, () => Promise<RouteModule>> = {
  "admin-analyze": () => import("../server/routes/admin-analyze"),
  "admin-failures": () => import("../server/routes/admin-failures"),
  "admin-library": () => import("../server/routes/admin-library"),
  "admin-login": () => import("../server/routes/admin-login"),
  "admin-logout": () => import("../server/routes/admin-logout"),
  "admin-publish": () => import("../server/routes/admin-publish"),
  "admin-session": () => import("../server/routes/admin-session"),
  "admin-settings": () => import("../server/routes/admin-settings"),
  "admin-stats": () => import("../server/routes/admin-stats"),
  "admin-versions": () => import("../server/routes/admin-versions"),
  knowledge: () => import("../server/routes/knowledge"),
  "knowledge-event": () => import("../server/routes/knowledge-event"),
  "knowledge-failure": () => import("../server/routes/knowledge-failure"),
};

function routeFromRequest(request: VercelRequest): string {
  const supplied = request.query.route;
  if (Array.isArray(supplied)) return supplied.join("/");
  if (typeof supplied === "string") return supplied;
  const host = typeof request.headers.host === "string" ? request.headers.host : "localhost";
  const pathname = new URL(request.url ?? "/api", `https://${host}`).pathname;
  return pathname.replace(/^\/api\/?/, "");
}

export const config = { maxDuration: 60 };

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  const route = routeFromRequest(request);
  const load = routeLoaders[route];
  if (!load) {
    sendJson(response, 404, { error: "مسار API غير موجود." });
    return;
  }
  try {
    const module = await load();
    await module.default(request, response);
  } catch {
    // Never expose bundler or infrastructure details to a caller.
    sendJson(response, 503, { error: "تعذر تشغيل خدمة الإدارة الآن." });
  }
}
