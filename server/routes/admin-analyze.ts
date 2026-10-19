import type { VercelRequest, VercelResponse } from "@vercel/node";
import { analyzeRequestSchema } from "../../src/admin/types.js";
import { requireAdmin, requireTrustedOrigin } from "../lib/auth.js";
import { analyzeDocument } from "../lib/analysis.js";
import { methodNotAllowed, readJsonBody, sendJson } from "../lib/http.js";

export const config = { maxDuration: 30 };

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!requireTrustedOrigin(request, response) || !(await requireAdmin(request, response))) return;
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    sendJson(response, 400, { error: "جسم طلب التحليل ليس JSON صالحًا." });
    return;
  }
  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(response, 400, { error: "بيانات الوثيقة غير صالحة للتحليل." });
    return;
  }
  try {
    const analysis = await analyzeDocument(parsed.data);
    sendJson(response, 200, analysis);
  } catch (error) {
    sendJson(response, 502, {
      error:
        error instanceof Error
          ? error.message
          : "تعذر تحليل الوثيقة دون حفظ نتائج غير متحقق منها.",
    });
  }
}
