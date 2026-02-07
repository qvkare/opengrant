import { Request, Response, NextFunction, RequestHandler } from "express";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { db } from "../db/index.js";
import { consumers, apiKeys } from "@opengrant/database";
import { eq } from "drizzle-orm";

/**
 * JWT payload structure
 */
export interface JWTPayload {
  sub: string;
  wallet: string;
  type: "consumer" | "publisher";
  iat?: number;
  exp?: number;
}

/**
 * Extended request with user info
 */
export interface AuthRequest extends Request {
  user?: JWTPayload;
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new API key
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = "og_live_";
  const secret = randomBytes(24).toString("hex");
  const key = `${prefix}${secret}`;
  const hash = hashApiKey(key);

  return { key, prefix: key.slice(0, 12), hash };
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as JWTPayload;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Authentication middleware
 * Supports both API key and JWT token authentication
 */
export const authMiddleware: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Check for API key first (X-API-Key header or Authorization Bearer for API keys)
  const apiKeyHeader = req.headers["x-api-key"] as string | undefined;
  const authHeader = req.headers["authorization"] as string | undefined;

  // Try API key authentication
  const apiKeyValue = apiKeyHeader ||
    (authHeader?.startsWith("Bearer og_") ? authHeader.slice(7) : undefined);

  if (apiKeyValue?.startsWith("og_")) {
    try {
      const keyHash = hashApiKey(apiKeyValue);

      const keyRecord = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.keyHash, keyHash),
      });

      if (!keyRecord || !keyRecord.isActive) {
        res.status(401).json({ error: "Invalid API key" });
        return;
      }

      // Check expiration
      if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
        res.status(401).json({ error: "API key expired" });
        return;
      }

      // Get consumer
      const consumer = await db.query.consumers.findFirst({
        where: eq(consumers.id, keyRecord.consumerId),
      });

      if (!consumer) {
        res.status(401).json({ error: "Consumer not found" });
        return;
      }

      req.user = {
        sub: consumer.id,
        wallet: consumer.walletAddress,
        type: "consumer",
      };

      // Update last used timestamp (fire and forget)
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, keyRecord.id))
        .catch(() => {});

      return next();
    } catch (error) {
      console.error("API key auth error:", error);
      res.status(500).json({ error: "Authentication error" });
      return;
    }
  }

  // Try JWT authentication
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (payload) {
      req.user = payload;
      return next();
    }

    res.status(401).json({ error: "Invalid token" });
    return;
  }

  res.status(401).json({
    error: "Authentication required",
    message: "Provide API key via X-API-Key header or JWT token via Authorization header",
  });
};

/**
 * Optional authentication middleware
 * Allows requests without authentication but attaches user if present
 */
export const optionalAuthMiddleware: RequestHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers["authorization"] as string | undefined;
  const apiKeyHeader = req.headers["x-api-key"] as string | undefined;

  // Try to authenticate but don't fail if not provided
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    if (token.startsWith("og_")) {
      // API key
      const keyHash = hashApiKey(token);
      const keyRecord = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.keyHash, keyHash),
      });

      if (keyRecord?.isActive) {
        const consumer = await db.query.consumers.findFirst({
          where: eq(consumers.id, keyRecord.consumerId),
        });

        if (consumer) {
          req.user = {
            sub: consumer.id,
            wallet: consumer.walletAddress,
            type: "consumer",
          };
        }
      }
    } else {
      // JWT token
      const payload = verifyToken(token);
      if (payload) {
        req.user = payload;
      }
    }
  } else if (apiKeyHeader?.startsWith("og_")) {
    const keyHash = hashApiKey(apiKeyHeader);
    const keyRecord = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyHash, keyHash),
    });

    if (keyRecord?.isActive) {
      const consumer = await db.query.consumers.findFirst({
        where: eq(consumers.id, keyRecord.consumerId),
      });

      if (consumer) {
        req.user = {
          sub: consumer.id,
          wallet: consumer.walletAddress,
          type: "consumer",
        };
      }
    }
  }

  next();
};

/**
 * Require specific user type
 */
export function requireType(type: "consumer" | "publisher"): RequestHandler {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (req.user.type !== type) {
      res.status(403).json({ error: `${type} access required` });
      return;
    }

    next();
  };
}

/**
 * Require consumer access
 */
export const requireConsumer = requireType("consumer");

/**
 * Require publisher access
 */
export const requirePublisher = requireType("publisher");

/**
 * Generate JWT token
 */
export function generateToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
  });
}

/**
 * Decode JWT token without verification (for inspection)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}
