import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendJson } from "./http.js";
import { RedisKey, redis } from "./redis.js";

const COOKIE_NAME = "syrian_math_admin";
const SESSION_SECONDS = 8 * 60 * 60;

interface AdminTokenPayload {
  role: "admin";
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
  sessionGeneration: number;
}

function adminSecretConfigurationError(): string | undefined {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return "لم يُضبط ADMIN_SECRET في إعدادات Vercel بعد.";
  if (secret.length < 32)
    return "يجب أن يتكون ADMIN_SECRET من 32 محرفًا على الأقل في إعدادات Vercel.";
  return undefined;
}

function requiredSecret(): string {
  const error = adminSecretConfigurationError();
  if (error) throw new Error(error);
  return process.env.ADMIN_SECRET!;
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

/**
 * Kept synchronous for deterministic tests. Real logins use issueAdminSession
 * below so the opaque ID is also recorded in Redis.
 */
export function createAdminToken(
  now = Date.now(),
  sessionId = randomUUID(),
  sessionGeneration = 0,
): string {
  const payload: AdminTokenPayload = {
    role: "admin",
    issuedAt: Math.floor(now / 1000),
    expiresAt: Math.floor(now / 1000) + SESSION_SECONDS,
    sessionId,
    sessionGeneration,
  };
  const body = base64Url(JSON.stringify(payload));
  return `v2.${body}.${sign(`v2.${body}`)}`;
}

function parseAdminToken(value: string): AdminTokenPayload | undefined {
  const [version, encodedPayload, signature, extra] = value.split(".");
  if (version !== "v2" || !encodedPayload || !signature || extra) return undefined;
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
      typeof (parsed as AdminTokenPayload).sessionId !== "string" ||
      !/^[a-f0-9-]{20,}$/i.test((parsed as AdminTokenPayload).sessionId) ||
      typeof (parsed as AdminTokenPayload).sessionGeneration !== "number" ||
      !Number.isInteger((parsed as AdminTokenPayload).sessionGeneration) ||
      !Number.isFinite((parsed as AdminTokenPayload).expiresAt) ||
      (parsed as AdminTokenPayload).expiresAt <= Math.floor(Date.now() / 1000)
    )
      return undefined;
    return parsed as AdminTokenPayload;
  } catch {
    return undefined;
  }
}

function tokenFromRequest(request: VercelRequest): string | undefined {
  const cookie = request.headers.cookie;
  const cookies = parseCookies(typeof cookie === "string" ? cookie : undefined);
  return cookies[COOKIE_NAME];
}

function numberFromRedis(value: unknown): number {
  const raw = typeof value === "string" ? Number(value) : value;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

export async function issueAdminSession(now = Date.now()): Promise<string> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  const generation = numberFromRedis(
    await client.get<unknown>(RedisKey.adminSessionGeneration),
  );
  const sessionId = randomUUID();
  const token = createAdminToken(now, sessionId, generation);
  await client.set(RedisKey.adminSession(sessionId), String(generation), {
    ex: SESSION_SECONDS,
  });
  return token;
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

/** Requires both a valid HMAC and a non-revoked Redis session identifier. */
export async function isAdminRequest(request: VercelRequest): Promise<boolean> {
  try {
    const raw = tokenFromRequest(request);
    if (!raw) return false;
    const payload = parseAdminToken(raw);
    if (!payload) return false;
    const client = redis();
    if (!client) return false;
    const [storedGeneration, activeGeneration] = await client
      .pipeline()
      .get<unknown>(RedisKey.adminSession(payload.sessionId))
      .get<unknown>(RedisKey.adminSessionGeneration)
      .exec();
    return (
      String(storedGeneration) === String(payload.sessionGeneration) &&
      numberFromRedis(activeGeneration) === payload.sessionGeneration
    );
  } catch {
    return false;
  }
}

export async function revokeCurrentAdminSession(request: VercelRequest): Promise<void> {
  const raw = tokenFromRequest(request);
  const payload = raw ? parseAdminToken(raw) : undefined;
  const client = redis();
  if (payload && client) await client.del(RedisKey.adminSession(payload.sessionId));
}

/** Incrementing a generation invalidates every saved session immediately. */
export async function revokeAllAdminSessions(): Promise<void> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  await client.incr(RedisKey.adminSessionGeneration);
}

export async function requireAdmin(
  request: VercelRequest,
  response: VercelResponse,
): Promise<boolean> {
  if (await isAdminRequest(request)) return true;
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

export function adminConfigurationError(): string | undefined {
  if (!process.env.ADMIN_PASSWORD)
    return "لم يُضبط ADMIN_PASSWORD في إعدادات Vercel بعد.";
  return adminSecretConfigurationError();
}

export function adminPasswordConfigured(): boolean {
  return adminConfigurationError() === undefined;
}

/** Configuration booleans are safe for the authenticated admin health card. */
export function adminEnvironmentStatus(): {
  passwordConfigured: boolean;
  secretConfigured: boolean;
} {
  return {
    passwordConfigured: Boolean(process.env.ADMIN_PASSWORD),
    secretConfigured: adminSecretConfigurationError() === undefined,
  };
}

/** Hashing both values makes comparison fixed-size and hides password length. */
export function passwordMatches(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const candidateHash = createHash("sha256").update(candidate, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateHash, expectedHash);
}
