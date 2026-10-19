import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendJson } from "../server/lib/http.js";

type RouteHandler = (
  request: VercelRequest,
  response: VercelResponse,
) => Promise<void>;

type RouteModule = { default: RouteHandler };

/**
 * Vercel's free plan counts files under /api as serverless functions. Keep one
 * catch-all function here and load the route implementations from /server,
 * preserving the public URLs used by the React application.
 *
 * The Node builder emits TypeScript source as ESM `.js` files. Keep explicit
 * `.js` runtime specifiers throughout this server dependency graph: Vite and
 * TypeScript resolve them to source during development, while Vercel resolves
 * the emitted files without an extensionless-import startup failure.
 */
const routeLoaders: Record<string, () => Promise<RouteModule>> = {
  "admin-analyze": () => import("../server/routes/admin-analyze.js"),
  "admin-chat": () => import("../server/routes/admin-chat.js"),
  "admin-failures": () => import("../server/routes/admin-failures.js"),
  "admin-library": () => import("../server/routes/admin-library.js"),
  "admin-google": () => import("../server/routes/admin-google.js"),
  "admin-login": () => import("../server/routes/admin-login.js"),
  "admin-logout": () => import("../server/routes/admin-logout.js"),
  "admin-logout-all": () => import("../server/routes/admin-logout-all.js"),
  "admin-publish": () => import("../server/routes/admin-publish.js"),
  "admin-session": () => import("../server/routes/admin-session.js"),
  "admin-settings": () => import("../server/routes/admin-settings.js"),
  "admin-stats": () => import("../server/routes/admin-stats.js"),
  "admin-versions": () => import("../server/routes/admin-versions.js"),
  health: () => import("../server/routes/health.js"),
  knowledge: () => import("../server/routes/knowledge.js"),
  "knowledge-event": () => import("../server/routes/knowledge-event.js"),
  "knowledge-failure": () => import("../server/routes/knowledge-failure.js"),
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
  } catch (error) {
    // Keep Vercel diagnostics actionable without serializing request data,
    // credentials, or an error stack back to the browser.
    console.error("API route failed", {
      route,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    sendJson(response, 503, { error: "تعذر تشغيل خدمة الإدارة الآن." });
  }
}
