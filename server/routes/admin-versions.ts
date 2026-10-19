import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireAdmin, requireTrustedOrigin } from "../lib/auth.js";
import { methodNotAllowed, readJsonBody, sendJson } from "../lib/http.js";
import { listVersions, rollbackToVersion } from "../lib/knowledgeStore.js";

const rollbackSchema = z.object({ version: z.number().int().positive() }).strict();

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (!["GET", "POST"].includes(request.method ?? ""))
    return methodNotAllowed(response, ["GET", "POST"]);
  if (!(await requireAdmin(request, response))) return;
  if (request.method === "POST" && !requireTrustedOrigin(request, response)) return;
  try {
    if (request.method === "GET") {
      sendJson(response, 200, { versions: await listVersions() });
      return;
    }
    const parsed = rollbackSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      sendJson(response, 400, { error: "رقم النسخة غير صالح." });
      return;
    }
    const snapshot = await rollbackToVersion(parsed.data.version);
    sendJson(response, 200, {
      version: snapshot.version,
      itemCount: snapshot.items.length,
      publishedAt: snapshot.publishedAt,
    });
  } catch (error) {
    console.error("Admin versions route failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    sendJson(response, 503, { error: "تعذر التراجع إلى النسخة المطلوبة." });
  }
}
