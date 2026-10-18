import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendJson } from "./http.js";

const COOKIE_NAME = "syrian_math_admin";
const SESSION_SECONDS = 8 * 60 * 60;

interface AdminTokenPayload {
  role: "admin";
  issuedAt: number;
  expiresAt: number;
}

function requiredSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("لم يُضبط ADMIN_SECRET بطول آمن في إعدادات Vercel.");
  return secret;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(value: string): string {
  return createHmac("sha256", requiredSecret()).update(value).digest("base64url");
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(";").reduce<Record<string, string>>((cookies, entry) => {
    const separator = entry.indexOf("=");
    if (separator > 0) {
      const name = entry.slice(0, separator).trim();
      const value = entry.slice(separator + 1).trim();
      if (name) cookies[name] = value;
    }
    return cookies;
  }, {});
}

export function createAdminToken(now = Date.now()): string {
  const payload: AdminTokenPayload = {
    role: "admin",
    issuedAt: Math.floor(now / 1000),
    expiresAt: Math.floor(now / 1000) + SESSION_SECONDS,
  };
  const body = base64Url(JSON.stringify(payload));
  return `v1.${body}.${sign(`v1.${body}`)}`;
}

function parseAdminToken(value: string): AdminTokenPayload | undefined {
  const [version, encodedPayload, signature, extra] = value.split(".");
  if (version !== "v1" || !encodedPayload || !signature || extra) return undefined;
  const expected = sign(`${version}.${encodedPayload}`);
  const suppliedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  )
    return undefined;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      (parsed as AdminTokenPayload).role !== "admin" ||
      typeof (parsed as AdminTokenPayload).issuedAt !== "number" ||
      typeof (parsed as AdminTokenPayload).expiresAt !== "number" ||
      !Number.isFinite((parsed as AdminTokenPayload).expiresAt) ||
      (parsed as AdminTokenPayload).expiresAt <= Math.floor(Date.now() / 1000)
    )
      return undefined;
    return parsed as AdminTokenPayload;
  } catch {
    return undefined;
  }
}

export function setAdminCookie(response: VercelResponse, token: string): void {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`,
  );
}

export function clearAdminCookie(response: VercelResponse): void {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  );
}

export function isAdminRequest(request: VercelRequest): boolean {
  try {
    const cookie = request.headers.cookie;
    const cookies = parseCookies(typeof cookie === "string" ? cookie : undefined);
    return Boolean(cookies[COOKIE_NAME] && parseAdminToken(cookies[COOKIE_NAME]));
  } catch {
    return false;
  }
}

export function requireAdmin(
  request: VercelRequest,
  response: VercelResponse,
): boolean {
  if (isAdminRequest(request)) return true;
  sendJson(response, 401, { error: "انتهت جلسة الإدارة أو لا تملك صلاحية الوصول." });
  return false;
}

/** SameSite cookies cover normal browser CSRF. Reject a mismatched Origin too. */
export function hasTrustedOrigin(request: VercelRequest): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return true;
  try {
    const parsed = new URL(origin);
    return parsed.host === host;
  } catch {
    return false;
  }
}

export function requireTrustedOrigin(
  request: VercelRequest,
  response: VercelResponse,
): boolean {
  if (hasTrustedOrigin(request)) return true;
  sendJson(response, 403, { error: "رفض الطلب من مصدر غير موثوق." });
  return false;
}

export function adminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SECRET);
}

export function passwordMatches(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const candidateBuffer = Buffer.from(candidate, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}
