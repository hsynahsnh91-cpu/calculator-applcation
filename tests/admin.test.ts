import assert from "node:assert/strict";
import {
  adminConfigurationError,
  adminPasswordConfigured,
  createAdminToken,
} from "../server/lib/auth.js";
import { resolveRedisConfiguration } from "../server/lib/redis.js";

let passed = 0;
let failed = 0;

function test(name: string, run: () => void): void {
  try {
    run();
    passed++;
    console.log("PASS", name);
  } catch (error) {
    failed++;
    console.error("FAIL", name, error);
  }
}

test("Redis uses a complete Upstash URL/token pair and trims pasted whitespace", () => {
  const configuration = resolveRedisConfiguration({
    UPSTASH_REDIS_REST_URL: "  https://safe-db.upstash.io/  ",
    UPSTASH_REDIS_REST_TOKEN: "  upstash-token  ",
    KV_REST_API_URL: "https://other-db.upstash.io",
    KV_REST_API_TOKEN: "other-token",
  });
  assert.equal(configuration.available, true);
  if (!configuration.available) return;
  assert.equal(configuration.credentials.source, "upstash");
  assert.equal(configuration.credentials.url, "https://safe-db.upstash.io/");
  assert.equal(configuration.credentials.token, "upstash-token");
});

test("a stale partial Upstash configuration cannot be mixed with Vercel KV", () => {
  const configuration = resolveRedisConfiguration({
    UPSTASH_REDIS_REST_URL: "https://stale-db.upstash.io",
    KV_REST_API_URL: "https://current-db.upstash.io",
    KV_REST_API_TOKEN: "current-token",
  });
  assert.equal(configuration.available, true);
  if (!configuration.available) return;
  assert.equal(configuration.credentials.source, "vercel-kv");
  assert.equal(configuration.credentials.url, "https://current-db.upstash.io");
  assert.equal(configuration.credentials.token, "current-token");
});

test("an incomplete Redis pair returns a safe actionable configuration error", () => {
  const configuration = resolveRedisConfiguration({
    KV_REST_API_URL: "https://current-db.upstash.io",
  });
  assert.equal(configuration.available, false);
  if (configuration.available) return;
  assert.match(configuration.message, /غير مكتمل/);
  assert(!configuration.message.includes("https://current-db.upstash.io"));
});

test("an invalid complete Redis URL falls back to a valid complete Vercel KV pair", () => {
  const configuration = resolveRedisConfiguration({
    UPSTASH_REDIS_REST_URL: "redis://unsafe-db:6379",
    UPSTASH_REDIS_REST_TOKEN: "stale-token",
    KV_REST_API_URL: "https://current-db.upstash.io",
    KV_REST_API_TOKEN: "current-token",
  });
  assert.equal(configuration.available, true);
  if (!configuration.available) return;
  assert.equal(configuration.credentials.source, "vercel-kv");
});

const originalPassword = process.env.ADMIN_PASSWORD;
const originalSecret = process.env.ADMIN_SECRET;

try {
  test("a too-short ADMIN_SECRET is rejected before a login can reach token issuance", () => {
    process.env.ADMIN_PASSWORD = "test-password";
    process.env.ADMIN_SECRET = "x".repeat(31);
    assert.equal(adminPasswordConfigured(), false);
    assert.match(adminConfigurationError() ?? "", /32 محرفًا/);
  });

  test("a valid ADMIN_SECRET permits token issuance", () => {
    process.env.ADMIN_PASSWORD = "test-password";
    process.env.ADMIN_SECRET = "x".repeat(32);
    assert.equal(adminPasswordConfigured(), true);
    assert.match(createAdminToken(), /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
} finally {
  if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalPassword;
  if (originalSecret === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = originalSecret;
}

console.log(`\nAdmin API regression: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
