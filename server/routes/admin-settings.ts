import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireAdmin, requireTrustedOrigin } from "../lib/auth.js";
import { methodNotAllowed, readJsonBody, sendJson } from "../lib/http.js";
import { getStoredAdminSettings, setStoredAdminSettings } from "../lib/knowledgeStore.js";

const settingsSchema = z.object({ prompt: z.string().trim().min(1).max(24_000).optional() }).strict();

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (!["GET", "PUT"].includes(request.method ?? ""))
    return methodNotAllowed(response, ["GET", "PUT"]);
  if (!(await requireAdmin(request, response))) return;
  if (request.method === "PUT" && !requireTrustedOrigin(request, response)) return;
  try {
    if (request.method === "GET") {
      sendJson(response, 200, await getStoredAdminSettings());
      return;
    }
    const parsed = settingsSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      sendJson(response, 400, { error: "إعداد البرومبت غير صالح." });
      return;
    }
    await setStoredAdminSettings(parsed.data);
    sendJson(response, 200, { saved: true });
  } catch (error) {
    console.error("Admin settings route failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    sendJson(response, 503, { error: "تعذّر حفظ إعدادات الإدارة." });
  }
}
