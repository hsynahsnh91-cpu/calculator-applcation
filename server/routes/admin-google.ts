import type { VercelRequest, VercelResponse } from "@vercel/node";
import { issueAdminSession, setAdminCookie } from "../lib/auth.js";
import {
  beginGoogleLogin,
  clearGoogleStateCookie,
  completeGoogleLogin,
} from "../lib/googleAuth.js";
import { methodNotAllowed } from "../lib/http.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const host = typeof request.headers.host === "string" ? request.headers.host : "localhost";
  const url = new URL(request.url ?? "/api/admin-google", `https://${host}`);
  if (!url.searchParams.get("code") && !url.searchParams.get("error")) {
    beginGoogleLogin(request, response);
    return;
  }
  try {
    const result = await completeGoogleLogin(request);
    response.setHeader("Set-Cookie", clearGoogleStateCookie());
    if (!result.ok) {
      response.redirect(302, `/Admin?auth_error=${encodeURIComponent(result.error)}`);
      return;
    }
    setAdminCookie(response, await issueAdminSession());
    response.redirect(302, "/Admin");
  } catch (error) {
    console.error("Admin Google login failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    response.redirect(
      302,
      `/Admin?auth_error=${encodeURIComponent("تعذر إكمال دخول Google. لم تُفتح جلسة.")}`,
    );
  }
}
