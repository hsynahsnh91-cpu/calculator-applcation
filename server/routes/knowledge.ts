import type { VercelRequest, VercelResponse } from "@vercel/node";
import { methodNotAllowed, sendJson } from "../lib/http";
import { getCurrentSnapshot } from "../lib/knowledgeStore";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  try {
    const snapshot = await getCurrentSnapshot();
    if (!snapshot) {
      response.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
      response.status(204).end();
      return;
    }
    const publishedOnly = {
      ...snapshot,
      items: snapshot.items.filter((item) => item.status === "published"),
    };
    const etag = `W/"knowledge-${publishedOnly.version}-${publishedOnly.publishedAt}"`;
    response.setHeader("ETag", etag);
    response.setHeader(
      "Cache-Control",
      "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
    );
    const ifNoneMatch = request.headers["if-none-match"];
    if (
      (typeof ifNoneMatch === "string" && ifNoneMatch === etag) ||
      (Array.isArray(ifNoneMatch) && ifNoneMatch.includes(etag))
    ) {
      response.status(304).end();
      return;
    }
    sendJson(response, 200, publishedOnly);
  } catch {
    // A failed optional knowledge store must be distinguishable from an empty one.
    sendJson(response, 503, { error: "خدمة المعرفة غير متاحة حاليًا." });
  }
}
