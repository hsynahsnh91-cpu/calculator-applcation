import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireAdmin, requireTrustedOrigin } from "./_lib/auth";
import { methodNotAllowed, readJsonBody, sendJson } from "./_lib/http";
import { listVersions, rollbackToVersion } from "./_lib/knowledgeStore";

const rollbackSchema = z.object({ version: z.number().int().positive() }).strict();

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (!["GET", "POST"].includes(request.method ?? ""))
    return methodNotAllowed(response, ["GET", "POST"]);
  if (!requireAdmin(request, response)) return;
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
    sendJson(response, 503, {
      error: error instanceof Error ? error.message : "تعذر التراجع إلى النسخة المطلوبة.",
    });
  }
}
