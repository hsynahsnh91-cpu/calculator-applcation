import { failureRecordSchema, type FailureRecord } from "../../src/admin/types.js";
import { RedisKey, redis } from "./redis.js";

export async function listedFailures(limit = 100): Promise<FailureRecord[]> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
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
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
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
