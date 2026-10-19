import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  googleAuthConfigured,
  googleOAuthClientId,
  googleOAuthClientSecret,
  isAllowlistedAdminEmail,
} from "./secrets.js";

const STATE_COOKIE = "syrian_math_oauth";
const STATE_SECONDS = 10 * 60;

function requiredCookieSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 32) throw new Error("يلزم ADMIN_SECRET بطول 32 محرفًا على الأقل لتوقيع جلسة الإدارة.");
  return secret;
}

export function publicOrigin(request: VercelRequest): string {
  const forwarded = request.headers["x-forwarded-proto"];
  const first =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]
        : undefined;
  const proto = first === "http" ? "http" : "https";
  const host = typeof request.headers.host === "string" ? request.headers.host : "localhost";
  return `${proto}://${host}`;
}

export function googleCallbackUrl(request: VercelRequest): string {
  return `${publicOrigin(request)}/api/admin-google`;
}

function signState(nonce: string, issuedAt: number): string {
  const body = `${nonce}.${issuedAt}`;
  return `${body}.${createHmac("sha256", requiredCookieSecret()).update(body).digest("base64url")}`;
}

function parseState(value: string): boolean {
  const [nonce, issuedAtRaw, signature, extra] = value.split(".");
  if (!nonce || !issuedAtRaw || !signature || extra) return false;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isInteger(issuedAt) || Date.now() - issuedAt > STATE_SECONDS * 1000) return false;
  const expected = createHmac("sha256", requiredCookieSecret())
    .update(`${nonce}.${issuedAtRaw}`)
    .digest("base64url");
  const left = Buffer.from(signature, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
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

export function googleAuthConfigurationError(): string | undefined {
  if (!googleAuthConfigured())
    return "دخول Google غير مكتمل: اضبط GOOGLE_CLIENT_ID وGOOGLE_CLIENT_SECRET وADMIN_EMAILS في Secrets.";
  if (!process.env.ADMIN_SECRET || process.env.ADMIN_SECRET.length < 32)
    return "يلزم ADMIN_SECRET بطول 32 محرفًا على الأقل لتوقيع كوكي الجلسة.";
  return undefined;
}

export function beginGoogleLogin(request: VercelRequest, response: VercelResponse): void {
  const configuration = googleAuthConfigurationError();
  if (configuration) {
    response.redirect(302, `/Admin?auth_error=${encodeURIComponent(configuration)}`);
    return;
  }
  const nonce = randomBytes(16).toString("hex");
  const state = signState(nonce, Date.now());
  response.setHeader(
    "Set-Cookie",
    `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_SECONDS}`,
  );
  const params = new URLSearchParams({
    client_id: googleOAuthClientId()!,
    redirect_uri: googleCallbackUrl(request),
    response_type: "code",
    scope: "openid email",
    state,
    prompt: "select_account",
  });
  response.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function completeGoogleLogin(request: VercelRequest): Promise<
  { ok: true; email: string } | { ok: false; error: string }
> {
  const configuration = googleAuthConfigurationError();
  if (configuration) return { ok: false, error: configuration };
  const host = typeof request.headers.host === "string" ? request.headers.host : "localhost";
  const url = new URL(request.url ?? "/api/admin-google", `https://${host}`);
  const error = url.searchParams.get("error");
  if (error) return { ok: false, error: "أُلغي دخول Google أو رُفض." };
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(
    typeof request.headers.cookie === "string" ? request.headers.cookie : undefined,
  );
  if (!code || !state || cookies[STATE_COOKIE] !== state || !parseState(state))
    return { ok: false, error: "انتهت صلاحية طلب الدخول أو لم يُتحقق منه. أعد المحاولة." };
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleOAuthClientId()!,
      client_secret: googleOAuthClientSecret()!,
      redirect_uri: googleCallbackUrl(request),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return { ok: false, error: "تعذر تبادل رمز دخول Google." };
  const tokenBody: unknown = await tokenResponse.json();
  const idToken =
    tokenBody &&
    typeof tokenBody === "object" &&
    "id_token" in tokenBody &&
    typeof (tokenBody as { id_token: unknown }).id_token === "string"
      ? (tokenBody as { id_token: string }).id_token
      : undefined;
  if (!idToken) return { ok: false, error: "لم يُرجع Google معرّفًا صالحًا." };
  const infoResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );
  if (!infoResponse.ok) return { ok: false, error: "تعذر التحقق من معرّف Google." };
  const info: unknown = await infoResponse.json();
  if (!info || typeof info !== "object") return { ok: false, error: "استجابة التحقق من Google غير صالحة." };
  const record = info as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email : "";
  const verified = record.email_verified === true || record.email_verified === "true";
  const audience = typeof record.aud === "string" ? record.aud : "";
  if (!verified || !email) return { ok: false, error: "حساب Google بلا بريد موثّق." };
  if (audience !== googleOAuthClientId()) return { ok: false, error: "معرّف Google لا يطابق تطبيق الإدارة." };
  if (!isAllowlistedAdminEmail(email))
    return { ok: false, error: "هذا البريد غير مدرج في قائمة مديري النظام." };
  return { ok: true, email };
}

export function clearGoogleStateCookie(): string {
  return `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
