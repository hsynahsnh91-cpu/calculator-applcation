/**
 * Server-only configuration. Names may appear in health booleans; values never
 * leave this module in API responses or client bundles.
 */

function trimmed(name: string, environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}

export function parseAdminEmails(
  raw: string | undefined = process.env.ADMIN_EMAILS,
): string[] {
  if (!raw) return [];
  const emails = raw
    .split(/[,;\n]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.includes("@") && entry.length <= 320 && !entry.includes(" "));
  return [...new Set(emails)];
}

export function isAllowlistedAdminEmail(
  email: string,
  allowlist = parseAdminEmails(),
): boolean {
  return allowlist.includes(email.trim().toLowerCase());
}

export function adminEmailsConfigured(): boolean {
  return parseAdminEmails().length > 0;
}

export function geminiApiKey(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return trimmed("GEMINI_API_KEY", environment) ?? trimmed("AI_API_KEY", environment);
}

export function aiModel(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return trimmed("GEMINI_MODEL", environment) ?? trimmed("AI_MODEL", environment);
}

export function aiCompatUrl(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return trimmed("AI_API_URL", environment);
}

export type AiProviderKind = "gemini" | "openai-compat" | "none";

export interface AiProviderConfig {
  kind: AiProviderKind;
  apiKey?: string;
  model?: string;
  url?: string;
}

/** Gemini is the phase-4 default; an explicit AI_API_URL keeps the old compatible endpoint. */
export function resolveAiProvider(environment: NodeJS.ProcessEnv = process.env): AiProviderConfig {
  const apiKey = geminiApiKey(environment);
  const model = aiModel(environment);
  const url = aiCompatUrl(environment);
  if (!apiKey || !model) return { kind: "none" };
  if (url)
    return { kind: "openai-compat", apiKey, model, url };
  if (trimmed("GEMINI_API_KEY", environment) || !trimmed("AI_API_KEY", environment))
    return { kind: "gemini", apiKey, model };
  return {
    kind: "openai-compat",
    apiKey,
    model,
    url: "https://api.openai.com/v1/chat/completions",
  };
}

export function googleOAuthClientId(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return trimmed("GOOGLE_CLIENT_ID", environment);
}

export function googleOAuthClientSecret(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return trimmed("GOOGLE_CLIENT_SECRET", environment);
}

export function googleAuthConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    googleOAuthClientId(environment) &&
      googleOAuthClientSecret(environment) &&
      adminEmailsConfigured(),
  );
}

export function firebaseProjectId(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return trimmed("FIREBASE_PROJECT_ID", environment);
}

export function firestoreDatabaseId(environment: NodeJS.ProcessEnv = process.env): string {
  return trimmed("FIRESTORE_DATABASE_ID", environment) ?? "(default)";
}

export function firebaseClientEmail(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return trimmed("FIREBASE_CLIENT_EMAIL", environment);
}

export function firebasePrivateKey(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = environment.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  return raw || undefined;
}

export function firestoreConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    firebaseProjectId(environment) &&
      firebaseClientEmail(environment) &&
      firebasePrivateKey(environment),
  );
}
