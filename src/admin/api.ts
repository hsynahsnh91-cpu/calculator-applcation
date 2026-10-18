import {
  analysisResponseSchema,
  failureRecordSchema,
  knowledgeSnapshotSchema,
  publishRequestSchema,
  versionSummarySchema,
  type AnalysisResponse,
  type FailureRecord,
  type KnowledgeSnapshot,
  type PublishRequest,
  type VersionSummary,
} from "./types";

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function responseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return text || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorText(body: unknown, fallback: string): string {
  if (isRecord(body) && typeof body.error === "string") return body.error;
  return fallback;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await responseBody(response);
  if (!response.ok)
    throw new AdminApiError(
      errorText(body, `تعذر تنفيذ الطلب (${response.status}).`),
      response.status,
      body,
    );
  return body;
}

export async function checkAdminSession(): Promise<boolean> {
  const body = await request("/api/admin-session");
  return Boolean(
    body &&
      typeof body === "object" &&
      "authenticated" in body &&
      body.authenticated === true,
  );
}

export async function adminLogin(password: string): Promise<void> {
  await request("/api/admin-login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function adminLogout(): Promise<void> {
  await request("/api/admin-logout", { method: "POST", body: "{}" });
}

export async function analyzeRemote(input: {
  text: string;
  source: string;
  pageHints: number[];
}): Promise<AnalysisResponse> {
  const body = await request("/api/admin-analyze", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return analysisResponseSchema.parse(body);
}

export async function publishedLibrary(): Promise<KnowledgeSnapshot | null> {
  const body = await request("/api/admin-library");
  if (!body || typeof body !== "object" || !("snapshot" in body) || body.snapshot === null)
    return null;
  return knowledgeSnapshotSchema.parse(body.snapshot);
}

export async function publishKnowledge(input: PublishRequest): Promise<{
  version: number;
  itemCount: number;
  elapsedMs: number;
  forcedDespiteRegression: boolean;
}> {
  const body = await request("/api/admin-publish", {
    method: "POST",
    body: JSON.stringify(publishRequestSchema.parse(input)),
  });
  if (
    !isRecord(body) ||
    typeof body.version !== "number" ||
    typeof body.itemCount !== "number" ||
    typeof body.elapsedMs !== "number" ||
    typeof body.forcedDespiteRegression !== "boolean"
  )
    throw new Error("استجاب النشر ببيانات غير متوقعة.");
  return {
    version: body.version,
    itemCount: body.itemCount,
    elapsedMs: body.elapsedMs,
    forcedDespiteRegression: body.forcedDespiteRegression,
  };
}

export async function getVersions(): Promise<VersionSummary[]> {
  const body = await request("/api/admin-versions");
  if (!body || typeof body !== "object" || !("versions" in body) || !Array.isArray(body.versions))
    throw new Error("قائمة النسخ غير صالحة.");
  return body.versions.map((version) => versionSummarySchema.parse(version));
}

export async function rollbackVersion(version: number): Promise<void> {
  await request("/api/admin-versions", {
    method: "POST",
    body: JSON.stringify({ version }),
  });
}

export interface AdminStatistics {
  approvedItems: number;
  corrections: number;
  solveAttempts: number;
  solveSuccesses: number;
  solveRate: number | null;
  mostFailingSections: { section: string; count: number }[];
}

export async function getAdminStatistics(): Promise<AdminStatistics> {
  const body = await request("/api/admin-stats");
  if (!body || typeof body !== "object") throw new Error("إحصاءات اللوحة غير صالحة.");
  const sections =
    "mostFailingSections" in body && Array.isArray(body.mostFailingSections)
      ? body.mostFailingSections
          .filter(
            (entry): entry is { section: string; count: number } =>
              Boolean(
                entry &&
                  typeof entry === "object" &&
                  "section" in entry &&
                  typeof entry.section === "string" &&
                  "count" in entry &&
                  typeof entry.count === "number",
              ),
          )
      : [];
  return {
    approvedItems:
      "approvedItems" in body && typeof body.approvedItems === "number" ? body.approvedItems : 0,
    corrections:
      "corrections" in body && typeof body.corrections === "number" ? body.corrections : 0,
    solveAttempts:
      "solveAttempts" in body && typeof body.solveAttempts === "number" ? body.solveAttempts : 0,
    solveSuccesses:
      "solveSuccesses" in body && typeof body.solveSuccesses === "number" ? body.solveSuccesses : 0,
    solveRate:
      "solveRate" in body && typeof body.solveRate === "number" ? body.solveRate : null,
    mostFailingSections: sections,
  };
}

export async function getFailures(): Promise<FailureRecord[]> {
  const body = await request("/api/admin-failures");
  if (!body || typeof body !== "object" || !("failures" in body) || !Array.isArray(body.failures))
    throw new Error("سجل الإخفاقات غير صالح.");
  return body.failures.map((failure) => failureRecordSchema.parse(failure));
}

export async function removeFailure(fingerprint: string): Promise<void> {
  await request("/api/admin-failures", {
    method: "DELETE",
    body: JSON.stringify({ fingerprint }),
  });
}

export async function getServerPrompt(): Promise<string | undefined> {
  const body = await request("/api/admin-settings");
  return body && typeof body === "object" && "prompt" in body && typeof body.prompt === "string"
    ? body.prompt
    : undefined;
}

export async function saveServerPrompt(prompt: string): Promise<void> {
  await request("/api/admin-settings", {
    method: "PUT",
    body: JSON.stringify({ prompt }),
  });
}
