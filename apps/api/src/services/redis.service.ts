import Redis from "ioredis";
import { config } from "../config/index.js";

let redisClient: Redis | null = null;

/**
 * Get Redis client instance
 */
export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
    });

    redisClient.on("error", (err) => {
      console.error("Redis connection error:", err);
    });

    redisClient.on("connect", () => {
      console.log("Redis connected");
    });
  }

  return redisClient;
}

/**
 * Initialize Redis connection
 */
export async function initRedis(): Promise<void> {
  const client = getRedis();
  await client.connect();
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// ============================================
// CLI Session Management
// ============================================

interface CLISession {
  createdAt: number;
  authenticated: boolean;
  token?: string;
  walletAddress?: string;
}

const CLI_SESSION_PREFIX = "cli:session:";
const CLI_SESSION_TTL = 300; // 5 minutes

/**
 * Create a new CLI session
 */
export async function createCLISession(sessionId: string): Promise<void> {
  const redis = getRedis();
  const session: CLISession = {
    createdAt: Date.now(),
    authenticated: false,
  };

  await redis.setex(
    `${CLI_SESSION_PREFIX}${sessionId}`,
    CLI_SESSION_TTL,
    JSON.stringify(session)
  );
}

/**
 * Get CLI session
 */
export async function getCLISession(sessionId: string): Promise<CLISession | null> {
  const redis = getRedis();
  const data = await redis.get(`${CLI_SESSION_PREFIX}${sessionId}`);

  if (!data) return null;

  return JSON.parse(data) as CLISession;
}

/**
 * Update CLI session with authentication result
 */
export async function completeCLISession(
  sessionId: string,
  token: string,
  walletAddress: string
): Promise<boolean> {
  const redis = getRedis();
  const key = `${CLI_SESSION_PREFIX}${sessionId}`;

  const data = await redis.get(key);
  if (!data) return false;

  const session = JSON.parse(data) as CLISession;
  session.authenticated = true;
  session.token = token;
  session.walletAddress = walletAddress;

  // Keep session for a bit longer after auth (for polling)
  await redis.setex(key, 60, JSON.stringify(session)); // 1 minute

  return true;
}

/**
 * Delete CLI session
 */
export async function deleteCLISession(sessionId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${CLI_SESSION_PREFIX}${sessionId}`);
}

// ============================================
// Rate Limiting
// ============================================

const RATE_LIMIT_PREFIX = "ratelimit:";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check and update rate limit
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = getRedis();
  const fullKey = `${RATE_LIMIT_PREFIX}${key}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  // Use a Lua script for atomic operation
  const script = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window_start = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local window_seconds = tonumber(ARGV[4])

    -- Remove old entries
    redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

    -- Count current entries
    local count = redis.call('ZCARD', key)

    if count < limit then
      -- Add new entry
      redis.call('ZADD', key, now, now)
      redis.call('EXPIRE', key, window_seconds)
      return {1, limit - count - 1, now + window_seconds * 1000}
    else
      -- Get oldest entry for reset time
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local reset_at = oldest[2] and (tonumber(oldest[2]) + window_seconds * 1000) or (now + window_seconds * 1000)
      return {0, 0, reset_at}
    end
  `;

  const result = await redis.eval(
    script,
    1,
    fullKey,
    now.toString(),
    windowStart.toString(),
    limit.toString(),
    windowSeconds.toString()
  ) as [number, number, number];

  return {
    allowed: result[0] === 1,
    remaining: result[1],
    resetAt: result[2],
  };
}

// ============================================
// Cache
// ============================================

const CACHE_PREFIX = "cache:";

/**
 * Get cached value
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const data = await redis.get(`${CACHE_PREFIX}${key}`);

  if (!data) return null;

  return JSON.parse(data) as T;
}

/**
 * Set cached value
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  const redis = getRedis();
  await redis.setex(`${CACHE_PREFIX}${key}`, ttlSeconds, JSON.stringify(value));
}

/**
 * Delete cached value
 */
export async function deleteCache(key: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${CACHE_PREFIX}${key}`);
}

// ============================================
// API Stats
// ============================================

const STATS_PREFIX = "stats:";

/**
 * Increment API call counter
 */
export async function incrementAPIStats(
  apiId: string,
  date: string // YYYY-MM-DD
): Promise<void> {
  const redis = getRedis();
  const key = `${STATS_PREFIX}api:${apiId}:${date}`;

  await redis.incr(key);
  // Set TTL of 90 days for stats
  await redis.expire(key, 90 * 24 * 60 * 60);
}

/**
 * Get API stats for a date range
 */
export async function getAPIStats(
  apiId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, number>> {
  const redis = getRedis();
  const results: Record<string, number> = {};

  // Generate date range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const keys: string[] = [];

  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    keys.push(`${STATS_PREFIX}api:${apiId}:${dateStr}`);
  }

  if (keys.length === 0) return results;

  const values = await redis.mget(keys);

  keys.forEach((key, index) => {
    const date = key.split(":").pop()!;
    results[date] = parseInt(values[index] || "0", 10);
  });

  return results;
}
