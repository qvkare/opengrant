import { Request, Response, NextFunction, RequestHandler } from "express";
import Redis from "ioredis";
import { config } from "../config/index.js";

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key prefix for Redis */
  keyPrefix?: string;
  /** Function to extract identifier (default: IP) */
  keyGenerator?: (req: Request) => string;
  /** Skip rate limiting for this request */
  skip?: (req: Request) => boolean;
  /** Custom handler when rate limit is exceeded */
  handler?: (req: Request, res: Response, next: NextFunction) => void;
}

/**
 * Token bucket rate limiter using Redis
 */
export class TokenBucketRateLimiter {
  private redis: Redis;
  private config: Required<RateLimitConfig>;

  constructor(redis: Redis, rateLimitConfig: RateLimitConfig) {
    this.redis = redis;
    this.config = {
      limit: rateLimitConfig.limit,
      windowSeconds: rateLimitConfig.windowSeconds,
      keyPrefix: rateLimitConfig.keyPrefix || "ratelimit",
      keyGenerator: rateLimitConfig.keyGenerator || ((req) => req.ip || "unknown"),
      skip: rateLimitConfig.skip || (() => false),
      handler:
        rateLimitConfig.handler ||
        ((req, res) => {
          res.status(429).json({
            error: "Too Many Requests",
            message: "Rate limit exceeded. Please try again later.",
            retryAfter: this.config.windowSeconds,
          });
        }),
    };
  }

  /**
   * Check if request is allowed and consume a token
   */
  async consume(key: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }> {
    const now = Date.now();
    const windowStart = now - this.config.windowSeconds * 1000;

    const redisKey = `${this.config.keyPrefix}:${key}`;

    // Use Redis transaction for atomic operations
    const results = await this.redis
      .multi()
      // Remove old entries outside the window
      .zremrangebyscore(redisKey, 0, windowStart)
      // Count current requests in window
      .zcard(redisKey)
      // Add current request
      .zadd(redisKey, now, `${now}-${Math.random()}`)
      // Set expiry
      .expire(redisKey, this.config.windowSeconds)
      .exec();

    if (!results) {
      // Transaction failed, allow request but don't guarantee rate limit
      return {
        allowed: true,
        remaining: this.config.limit - 1,
        resetAt: now + this.config.windowSeconds * 1000,
      };
    }

    const currentCount = (results[1][1] as number) || 0;
    const allowed = currentCount < this.config.limit;
    const remaining = Math.max(0, this.config.limit - currentCount - 1);
    const resetAt = now + this.config.windowSeconds * 1000;

    // If not allowed, remove the request we just added
    if (!allowed) {
      await this.redis.zremrangebyscore(redisKey, now, now);
    }

    return { allowed, remaining, resetAt };
  }

  /**
   * Create Express middleware
   */
  middleware(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Check if should skip
      if (this.config.skip(req)) {
        return next();
      }

      const key = this.config.keyGenerator(req);
      const result = await this.consume(key);

      // Set rate limit headers
      res.set({
        "X-RateLimit-Limit": this.config.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString(),
      });

      if (!result.allowed) {
        res.set("Retry-After", this.config.windowSeconds.toString());
        this.config.handler(req, res, next);
        return;
      }

      next();
    };
  }
}

// Create Redis client
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error("Redis connection failed after 3 retries");
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    redisClient.on("error", (err) => {
      console.error("Redis error:", err);
    });

    redisClient.on("connect", () => {
      console.log("Redis connected");
    });
  }
  return redisClient;
}

/**
 * Create rate limit middleware with default configuration
 */
export function createRateLimitMiddleware(
  rateLimitConfig?: Partial<RateLimitConfig>
): RequestHandler {
  const redis = getRedisClient();
  const limiter = new TokenBucketRateLimiter(redis, {
    limit: rateLimitConfig?.limit || 100,
    windowSeconds: rateLimitConfig?.windowSeconds || 60,
    ...rateLimitConfig,
  });
  return limiter.middleware();
}

/**
 * Create per-wallet rate limiter
 */
export function createWalletRateLimitMiddleware(
  limit: number = 1000,
  windowSeconds: number = 3600
): RequestHandler {
  const redis = getRedisClient();
  const limiter = new TokenBucketRateLimiter(redis, {
    limit,
    windowSeconds,
    keyPrefix: "ratelimit:wallet",
    keyGenerator: (req) => {
      // Extract wallet from x402 payment or API key
      const payment = (req as any).x402Payment;
      if (payment?.payer) {
        return payment.payer.toLowerCase();
      }
      // Fall back to API key or IP
      const apiKey = req.headers["x-api-key"] as string;
      if (apiKey) {
        return `apikey:${apiKey.substring(0, 8)}`;
      }
      return `ip:${req.ip || "unknown"}`;
    },
  });
  return limiter.middleware();
}

/**
 * Create per-endpoint rate limiter
 */
export function createEndpointRateLimitMiddleware(
  endpointLimits: Record<string, { limit: number; windowSeconds: number }>
): RequestHandler {
  const redis = getRedisClient();
  const limiters = new Map<string, TokenBucketRateLimiter>();

  // Create a limiter for each endpoint
  for (const [endpoint, limits] of Object.entries(endpointLimits)) {
    limiters.set(
      endpoint,
      new TokenBucketRateLimiter(redis, {
        ...limits,
        keyPrefix: `ratelimit:endpoint:${endpoint.replace(/\//g, "-")}`,
      })
    );
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const routeKey = `${req.method} ${req.path}`;
    const limiter = limiters.get(routeKey);

    if (!limiter) {
      return next();
    }

    const key = req.ip || "unknown";
    const result = await limiter["consume"](key);

    res.set({
      "X-RateLimit-Limit": endpointLimits[routeKey].limit.toString(),
      "X-RateLimit-Remaining": result.remaining.toString(),
      "X-RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString(),
    });

    if (!result.allowed) {
      res.set("Retry-After", endpointLimits[routeKey].windowSeconds.toString());
      res.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded for this endpoint.",
      });
      return;
    }

    next();
  };
}
