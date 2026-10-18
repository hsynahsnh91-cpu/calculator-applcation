import { Redis } from "@upstash/redis";

let cachedRedis: Redis | null | undefined;

export function redis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  cachedRedis = url && token ? new Redis({ url, token }) : null;
  return cachedRedis;
}

export function redisIsRequired(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export const RedisKey = {
  currentVersion: "syrian-math:knowledge:current-version",
  version: (version: number): string => `syrian-math:knowledge:version:${version}`,
  versionIndex: "syrian-math:knowledge:versions",
  loginAttempts: (ip: string): string => `syrian-math:admin:login:${ip}`,
  failure: (fingerprint: string): string => `syrian-math:knowledge:failure:${fingerprint}`,
  failureIndex: "syrian-math:knowledge:failure-index",
  publicFailureRate: (ip: string): string => `syrian-math:knowledge:failure-rate:${ip}`,
  solveRate: (ip: string): string => `syrian-math:knowledge:solve-rate:${ip}`,
  solveAttempts: "syrian-math:stats:solve-attempts",
  solveSuccesses: "syrian-math:stats:solve-successes",
  adminSettings: "syrian-math:admin:settings",
} as const;

export async function failedLoginAttempt(ip: string): Promise<{
  blocked: boolean;
  retryAfterSeconds: number;
}> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  const key = RedisKey.loginAttempts(ip);
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, 15 * 60);
  const ttl = await client.ttl(key);
  return { blocked: count >= 5, retryAfterSeconds: Math.max(0, ttl) };
}

export async function loginBlocked(ip: string): Promise<{
  blocked: boolean;
  retryAfterSeconds: number;
}> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  const count = await client.get<number>(RedisKey.loginAttempts(ip));
  const ttl = await client.ttl(RedisKey.loginAttempts(ip));
  return {
    blocked: (count ?? 0) >= 5,
    retryAfterSeconds: Math.max(0, ttl),
  };
}

export async function clearFailedLoginAttempts(ip: string): Promise<void> {
  const client = redis();
  if (client) await client.del(RedisKey.loginAttempts(ip));
}
