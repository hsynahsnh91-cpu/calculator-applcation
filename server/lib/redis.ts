import { Redis } from "@upstash/redis";

export type RedisCredentialSource = "upstash" | "vercel-kv";

export interface RedisCredentials {
  source: RedisCredentialSource;
  url: string;
  token: string;
}

export type RedisConfiguration =
  | { available: true; credentials: RedisCredentials }
  | { available: false; message: string };

type Environment = Readonly<Record<string, string | undefined>>;

let cachedRedis: Redis | null | undefined;
let cachedConfiguration: RedisConfiguration | undefined;

function valueFrom(environment: Environment, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}

function isSafeRestUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

interface CredentialCandidate {
  source: RedisCredentialSource;
  url?: string;
  token?: string;
}

/** Resolve complete URL/token pairs together, never a mixed stale pair. */
export function resolveRedisConfiguration(
  environment: Environment = process.env,
): RedisConfiguration {
  const candidates: CredentialCandidate[] = [
    {
      source: "upstash",
      url: valueFrom(environment, "UPSTASH_REDIS_REST_URL"),
      token: valueFrom(environment, "UPSTASH_REDIS_REST_TOKEN"),
    },
    {
      source: "vercel-kv",
      url: valueFrom(environment, "KV_REST_API_URL"),
      token: valueFrom(environment, "KV_REST_API_TOKEN"),
    },
  ];

  for (const candidate of candidates) {
    if (candidate.url && candidate.token && isSafeRestUrl(candidate.url))
      return {
        available: true,
        credentials: {
          source: candidate.source,
          url: candidate.url,
          token: candidate.token,
        },
      };
  }

  const hasIncompletePair = candidates.some(
    (candidate) => Boolean(candidate.url) !== Boolean(candidate.token),
  );
  if (hasIncompletePair)
    return {
      available: false,
      message:
        "إعداد Redis غير مكتمل: اضبط زوجًا كاملًا فقط من UPSTASH_REDIS_REST_URL وUPSTASH_REDIS_REST_TOKEN، أو من KV_REST_API_URL وKV_REST_API_TOKEN.",
    };

  const hasInvalidUrl = candidates.some((candidate) =>
    Boolean(candidate.url && candidate.token && !isSafeRestUrl(candidate.url)),
  );
  if (hasInvalidUrl)
    return {
      available: false,
      message:
        "عنوان Redis غير صالح أو غير آمن. استخدم عنوان REST يبدأ بـ https:// من Upstash أو Vercel KV.",
    };

  return {
    available: false,
    message:
      "يلزم ربط Redis قبل فتح الإدارة كي يعمل حد محاولات الدخول والجلسات بأمان.",
  };
}

function configuredRedis(): RedisConfiguration {
  if (!cachedConfiguration) cachedConfiguration = resolveRedisConfiguration();
  return cachedConfiguration;
}

export function redis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const configuration = configuredRedis();
  if (!configuration.available) {
    cachedRedis = null;
    return cachedRedis;
  }
  try {
    cachedRedis = new Redis({
      url: configuration.credentials.url,
      token: configuration.credentials.token,
    });
  } catch {
    cachedConfiguration = {
      available: false,
      message:
        "تعذر تهيئة عميل Redis. تحقق من عنوان REST ورمز الوصول في إعدادات Vercel.",
    };
    cachedRedis = null;
  }
  return cachedRedis;
}

/** A safe message for an administrator; never exposes a URL or token. */
export function redisConfigurationMessage(): string | undefined {
  const configuration = configuredRedis();
  return configuration.available ? undefined : configuration.message;
}

export function redisIsRequired(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export const RedisKey = {
  currentVersion: "syrian-math:knowledge:current-version",
  versionSequence: "syrian-math:knowledge:version-sequence",
  version: (version: number): string => `syrian-math:knowledge:version:${version}`,
  versionSummary: (version: number): string =>
    `syrian-math:knowledge:version-summary:${version}`,
  versionIndex: "syrian-math:knowledge:versions",
  loginAttempts: (ip: string): string => `syrian-math:admin:login:${ip}`,
  adminSession: (sessionId: string): string =>
    `syrian-math:admin:session:${sessionId}`,
  adminSessionGeneration: "syrian-math:admin:session-generation",
  failure: (fingerprint: string): string => `syrian-math:knowledge:failure:${fingerprint}`,
  failureIndex: "syrian-math:knowledge:failure-index",
  publicFailureRate: (ip: string): string => `syrian-math:knowledge:failure-rate:${ip}`,
  publicEventRate: (ip: string): string => `syrian-math:knowledge:event-rate:${ip}`,
  solveRate: (ip: string): string => `syrian-math:knowledge:solve-rate:${ip}`,
  adminChatRate: (ip: string): string => `syrian-math:admin:chat-rate:${ip}`,
  solveAttempts: "syrian-math:stats:solve-attempts",
  solveSuccesses: "syrian-math:stats:solve-successes",
  adminSettings: "syrian-math:admin:settings",
  regressionFingerprint: (fingerprint: string): string =>
    `syrian-math:regression:passed:${fingerprint}`,
} as const;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  count: number;
}

/** Atomic fixed-window limiter shared by unauthenticated write endpoints. */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  const [count, , ttl] = await client
    .multi()
    .incr(key)
    .expire(key, windowSeconds, "NX")
    .ttl(key)
    .exec();
  return {
    allowed: count <= limit,
    count,
    retryAfterSeconds: Math.max(0, ttl),
  };
}

export async function failedLoginAttempt(ip: string): Promise<{
  blocked: boolean;
  retryAfterSeconds: number;
}> {
  const result = await consumeRateLimit(RedisKey.loginAttempts(ip), 5, 15 * 60);
  return { blocked: result.count >= 5, retryAfterSeconds: result.retryAfterSeconds };
}

export async function loginBlocked(ip: string): Promise<{
  blocked: boolean;
  retryAfterSeconds: number;
}> {
  const client = redis();
  if (!client) throw new Error("قاعدة Redis غير مربوطة بعد.");
  const key = RedisKey.loginAttempts(ip);
  const [count, ttl] = await client.pipeline().get<number>(key).ttl(key).exec();
  return {
    blocked: (count ?? 0) >= 5,
    retryAfterSeconds: Math.max(0, ttl),
  };
}

export async function clearFailedLoginAttempts(ip: string): Promise<void> {
  const client = redis();
  if (client) await client.del(RedisKey.loginAttempts(ip));
}
