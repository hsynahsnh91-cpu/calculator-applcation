import { createSign } from "node:crypto";
import {
  firebaseClientEmail,
  firebasePrivateKey,
  firebaseProjectId,
  firestoreConfigured,
  firestoreDatabaseId,
} from "./secrets.js";

const MAX_DOCUMENT_BYTES = 900_000;
const TOKEN_REFRESH_SKEW_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

export function firestoreAvailable(): boolean {
  return firestoreConfigured();
}

export function firestoreMaxBytes(): number {
  return MAX_DOCUMENT_BYTES;
}

function documentsRoot(): string {
  const project = firebaseProjectId();
  if (!project) throw new Error("لم يُضبط FIREBASE_PROJECT_ID.");
  const database = encodeURIComponent(firestoreDatabaseId());
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/${database}/documents`;
}

function documentName(path: string): string {
  return `${documentsRoot()}/${path.replace(/^\/+/, "")}`;
}

async function serviceAccountAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now())
    return cachedToken.accessToken;
  const email = firebaseClientEmail();
  const key = firebasePrivateKey();
  if (!email || !key) throw new Error("حساب خدمة Firebase غير مكتمل.");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: email,
      sub: email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/datastore",
    }),
  ).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const assertion = `${header}.${payload}.${signer.sign(key, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("تعذر الحصول على رمز الوصول إلى Firestore.");
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("access_token" in body) ||
    typeof (body as { access_token: unknown }).access_token !== "string"
  )
    throw new Error("استجابة رمز Firestore غير صالحة.");
  const expiresIn =
    "expires_in" in body && typeof (body as { expires_in: unknown }).expires_in === "number"
      ? (body as { expires_in: number }).expires_in
      : 3600;
  cachedToken = {
    accessToken: (body as { access_token: string }).access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
  };
  return cachedToken.accessToken;
}

async function firestoreFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await serviceAccountAccessToken();
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

function encodePayload(value: unknown): { fields: { payload: { stringValue: string } } } {
  const payload = JSON.stringify(value);
  if (Buffer.byteLength(payload, "utf8") > MAX_DOCUMENT_BYTES)
    throw new Error(
      `حجم وثيقة Firestore يتجاوز الحد ${Math.floor(MAX_DOCUMENT_BYTES / 1024)} كيلوبايت.`,
    );
  return { fields: { payload: { stringValue: payload } } };
}

function decodePayload(body: unknown): unknown {
  if (!body || typeof body !== "object" || !("fields" in body)) return undefined;
  const fields = (body as { fields?: unknown }).fields;
  if (!fields || typeof fields !== "object" || !("payload" in fields)) return undefined;
  const payload = (fields as { payload?: unknown }).payload;
  if (!payload || typeof payload !== "object" || !("stringValue" in payload)) return undefined;
  const raw = (payload as { stringValue?: unknown }).stringValue;
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function firestoreGet<T>(path: string): Promise<T | undefined> {
  const response = await firestoreFetch(documentName(path));
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("تعذر قراءة وثيقة Firestore.");
  const decoded = decodePayload(await response.json());
  return decoded as T | undefined;
}

export async function firestoreSet(path: string, value: unknown): Promise<void> {
  const response = await firestoreFetch(documentName(path), {
    method: "PATCH",
    body: JSON.stringify(encodePayload(value)),
  });
  if (!response.ok) throw new Error("تعذر كتابة وثيقة Firestore.");
}

export async function firestoreDelete(path: string): Promise<void> {
  const response = await firestoreFetch(documentName(path), { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error("تعذر حذف وثيقة Firestore.");
}

export async function firestoreList<T>(collection: string, pageSize = 100): Promise<T[]> {
  const url = `${documentsRoot()}/${collection}?pageSize=${Math.max(1, Math.min(pageSize, 300))}`;
  const response = await firestoreFetch(url);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error("تعذر سرد مجموعة Firestore.");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("documents" in body)) return [];
  const documents = (body as { documents?: unknown }).documents;
  if (!Array.isArray(documents)) return [];
  return documents.flatMap((document) => {
    const decoded = decodePayload(document);
    return decoded === undefined ? [] : [decoded as T];
  });
}


