import { failureRecordSchema, type FailureRecord } from "../../src/admin/types.js";
import { firestoreAvailable, firestoreDelete, firestoreGet, firestoreList, firestoreSet } from "./firestore.js";
import { RedisKey, redis } from "./redis.js";

export async function loadFailure(fingerprint: string): Promise<FailureRecord | undefined> {
  if (firestoreAvailable()) {
    const parsed = failureRecordSchema.safeParse(
      await firestoreGet<unknown>(`failures/${encodeURIComponent(fingerprint)}`),
    );
    return parsed.success ? parsed.data : undefined;
  }
  const client = redis();
  if (!client) return undefined;
  const parsed = failureRecordSchema.safeParse(
    await client.get<unknown>(RedisKey.failure(fingerprint)),
  );
  return parsed.success ? parsed.data : undefined;
}

export async function saveFailure(record: FailureRecord): Promise<void> {
  if (firestoreAvailable()) {
    await firestoreSet(`failures/${encodeURIComponent(record.fingerprint)}`, record);
    return;
  }
  const client = redis();
  if (!client) throw new Error("لا توجد قاعدة معرفة مربوطة (Firestore أو Redis).");
  await client.set(RedisKey.failure(record.fingerprint), record);
  await client.zadd(RedisKey.failureIndex, {
    score: Date.now(),
    member: record.fingerprint,
  });
}

export async function listedFailures(limit = 100): Promise<FailureRecord[]> {
  if (firestoreAvailable()) {
    const loaded = (await firestoreList<unknown>("failures", Math.max(1, Math.min(limit, 500))))
      .map((value) => failureRecordSchema.safeParse(value))
      .filter((record) => record.success)
      .map((record) => record.data);
    return loaded.sort(
      (first, second) =>
        second.count - first.count || second.lastSeenAt.localeCompare(first.lastSeenAt),
    );
  }
  const client = redis();
  if (!client) throw new Error("لا توجد قاعدة معرفة مربوطة (Firestore أو Redis).");
  const members = await client.zrange<string[]>(
    RedisKey.failureIndex,
    0,
    Math.max(0, Math.min(limit, 500) - 1),
    { rev: true },
  );
  const loaded = await Promise.all(
    members.map(async (fingerprint) =>
      failureRecordSchema.safeParse(
        await client.get<unknown>(RedisKey.failure(fingerprint)),
      ),
    ),
  );
  return loaded
    .filter((record) => record.success)
    .map((record) => record.data)
    .sort(
      (first, second) =>
        second.count - first.count || second.lastSeenAt.localeCompare(first.lastSeenAt),
    );
}

export async function removeFailure(fingerprint: string): Promise<void> {
  if (firestoreAvailable()) {
    await firestoreDelete(`failures/${encodeURIComponent(fingerprint)}`);
    return;
  }
  const client = redis();
  if (!client) throw new Error("لا توجد قاعدة معرفة مربوطة (Firestore أو Redis).");
  await client.del(RedisKey.failure(fingerprint));
  await client.zrem(RedisKey.failureIndex, fingerprint);
}

export function failureSection(question: string): string {
  if (/تكامل|مشتق|نهاية|دالة|منحنى/.test(question)) return "التفاضل والتكامل";
  if (/احتمال|توزيع|كرات|إحصاء|احصاء/.test(question)) return "الاحتمالات والإحصاء";
  if (/مصفوف|محدد|مقلوب/.test(question)) return "المصفوفات";
  if (/عقدي|اويلر|مرافق|ديموافر/.test(question)) return "الأعداد العقدية";
  if (/متتالي|حدودها|أساسها|اساسها/.test(question)) return "المتتاليات";
  if (/مستوي|نقطة|مستقيم|متجه|هندسة/.test(question)) return "الهندسة";
  if (/معادلة|جذور|مجهول/.test(question)) return "المعادلات";
  return "أخرى";
}
