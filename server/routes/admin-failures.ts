import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireAdmin, requireTrustedOrigin } from "../lib/auth";
import { listedFailures, removeFailure } from "../lib/failures";
import { methodNotAllowed, readJsonBody, sendJson } from "../lib/http";

const deleteSchema = z.object({ fingerprint: z.string().trim().min(6).max(160) }).strict();

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (!["GET", "DELETE"].includes(request.method ?? ""))
    return methodNotAllowed(response, ["GET", "DELETE"]);
  if (!requireAdmin(request, response)) return;
  if (request.method === "DELETE" && !requireTrustedOrigin(request, response)) return;
  try {
    if (request.method === "GET") {
      sendJson(response, 200, { failures: await listedFailures() });
      return;
    }
    const parsed = deleteSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      sendJson(response, 400, { error: "معرف الإخفاق غير صالح." });
      return;
    }
    await removeFailure(parsed.data.fingerprint);
    sendJson(response, 200, { removed: true });
  } catch (error) {
    sendJson(response, 503, {
      error: error instanceof Error ? error.message : "تعذر الوصول إلى سجل الإخفاقات.",
    });
  }
}
