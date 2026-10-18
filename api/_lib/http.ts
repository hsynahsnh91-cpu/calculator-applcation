import type { VercelRequest, VercelResponse } from "@vercel/node";

export function sendJson(
  response: VercelResponse,
  status: number,
  body: unknown,
): void {
  response.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.json(body);
}

export function methodNotAllowed(
  response: VercelResponse,
  allowed: string[],
): void {
  response.setHeader("Allow", allowed.join(", "));
  sendJson(response, 405, { error: "الطريقة غير مسموحة." });
}

export function clientIp(request: VercelRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() || "unknown";
  if (Array.isArray(forwarded)) return forwarded[0]?.split(",")[0]?.trim() || "unknown";
  const realIp = request.headers["x-real-ip"];
  if (typeof realIp === "string") return realIp.trim() || "unknown";
  return "unknown";
}

export async function readJsonBody(request: VercelRequest): Promise<unknown> {
  const supplied = request.body;
  if (supplied !== undefined && supplied !== null) {
    if (typeof supplied === "string") return JSON.parse(supplied);
    if (Buffer.isBuffer(supplied)) return JSON.parse(supplied.toString("utf8"));
    return supplied;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2_500_000) throw new Error("الطلب أكبر من الحد المسموح.");
    chunks.push(buffer);
  }
  const source = Buffer.concat(chunks).toString("utf8").trim();
  return source ? JSON.parse(source) : {};
}

export function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
