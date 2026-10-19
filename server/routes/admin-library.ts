import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "../lib/auth.js";
import { methodNotAllowed, sendJson } from "../lib/http.js";
import { getCurrentSnapshot } from "../lib/knowledgeStore.js";

/**
 * Drafts deliberately stay in IndexedDB. This endpoint exposes the immutable,
 * server-side published library to an authenticated administrator for merging
 * it into a local workspace; edits become local drafts until the next publish.
 */
export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  if (!(await requireAdmin(request, response))) return;
  try {
    const snapshot = await getCurrentSnapshot();
    sendJson(response, 200, { snapshot: snapshot ?? null });
  } catch {
    sendJson(response, 503, { error: "تعذر الوصول إلى مكتبة المعرفة المنشورة." });
  }
}
