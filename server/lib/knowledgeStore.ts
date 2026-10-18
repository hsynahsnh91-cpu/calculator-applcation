import {
  knowledgeSnapshotSchema,
  solverSettingsSchema,
  type KnowledgeItem,
  type KnowledgeSnapshot,
  type SolverSettings,
  type VersionSummary,
  versionSummarySchema,
} from "../../src/admin/types";
import { RedisKey, redis } from "./redis";

const MAX_SNAPSHOT_BYTES = 2_000_000;
const MAX_VERSION_LIST = 100;

function parseStored<T>(value: unknown): T | undefined {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T | undefined;
}

function asVersion(value: unknown): number | undefined {
  const raw = typeof value === "string" ? Number(value) : value;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
}

export async function getCurrentVersion(): Promise<number | undefined> {
  const client = redis();
  if (!client) return undefined;
  return asVersion(await client.get<unknown>(RedisKey.currentVersion));
}

export async function getSnapshot(version: number): Promise<KnowledgeSnapshot | undefined> {
  const client = redis();
  if (!client) return undefined;
  const parsed = knowledgeSnapshotSchema.safeParse(
    parseStored<unknown>(await client.get<unknown>(RedisKey.version(version))),
  );
  if (!parsed.success) return undefined;
  return parsed.data;
}

export async function getCurrentSnapshot(): Promise<KnowledgeSnapshot | undefined> {
  const version = await getCurrentVersion();
  return version === undefined ? undefined : getSnapshot(version);
}

function publishedItems(items: KnowledgeItem[], version: number, now: string): KnowledgeItem[] {
  return items
    .filter((item) => item.status === "approved" || item.status === "published")
    .map((item) => ({
      ...item,
      status: "published" as const,
      version,
      updatedAt: now,
    }));
}

export interface PublishStoredResult {
  snapshot: KnowledgeSnapshot;
  bytes: number;
}

/**
 * The snapshot is written under its new immutable version first.  The single
 * SET of `current-version` is the visibility switch, so visitors never see a
 * partly-written version.
 */
export async function publishSnapshot(
  items: KnowledgeItem[],
  settings: SolverSettings,
): Promise<PublishStoredResult> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  const version = await client.incr("syrian-math:knowledge:version-sequence");
  const now = new Date().toISOString();
  const snapshot = knowledgeSnapshotSchema.parse({
    version,
    publishedAt: now,
    items: publishedItems(items, version, now),
    settings: solverSettingsSchema.parse(settings),
  });
  const bytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
  if (bytes > MAX_SNAPSHOT_BYTES)
    throw new Error(
      `حجم نسخة المعرفة ${Math.ceil(bytes / 1024)} كيلوبايت ويتجاوز الحد الآمن ${Math.floor(MAX_SNAPSHOT_BYTES / 1024)} كيلوبايت. قسّم النشر إلى وحدات أصغر.`,
    );
  await client.set(RedisKey.version(version), snapshot);
  await client.set(RedisKey.currentVersion, version);
  return { snapshot, bytes };
}

export async function listVersions(): Promise<VersionSummary[]> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  const current = await client.get<unknown>("syrian-math:knowledge:version-sequence");
  const last = asVersion(current) ?? 0;
  const versions: VersionSummary[] = [];
  for (let version = last; version > 0 && versions.length < MAX_VERSION_LIST; version--) {
    const snapshot = await getSnapshot(version);
    if (!snapshot) continue;
    const summary = versionSummarySchema.safeParse({
      version: snapshot.version,
      publishedAt: snapshot.publishedAt,
      itemCount: snapshot.items.length,
    });
    if (summary.success) versions.push(summary.data);
  }
  return versions;
}

export async function rollbackToVersion(version: number): Promise<KnowledgeSnapshot> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  const snapshot = await getSnapshot(version);
  if (!snapshot) throw new Error("لم تُعثر على النسخة المطلوبة للتراجع.");
  await client.set(RedisKey.currentVersion, version);
  return snapshot;
}

interface StoredAdminSettings {
  prompt?: string;
}

export async function getStoredAdminSettings(): Promise<StoredAdminSettings> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  const value = parseStored<unknown>(
    await client.get<unknown>(RedisKey.adminSettings),
  );
  if (
    value !== null &&
    typeof value === "object" &&
    ("prompt" in value) &&
    (typeof (value as StoredAdminSettings).prompt === "string" ||
      (value as StoredAdminSettings).prompt === undefined)
  )
    return value as StoredAdminSettings;
  return {};
}

export async function setStoredAdminSettings(value: StoredAdminSettings): Promise<void> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  const prompt = value.prompt?.trim();
  if (prompt && prompt.length > 24_000) throw new Error("البرومبت أطول من الحد المسموح.");
  await client.set(RedisKey.adminSettings, prompt ? { prompt } : {});
}
