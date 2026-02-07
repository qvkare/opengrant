import { eq, sql } from "drizzle-orm";
import { db, testConnection } from "../db/index.js";
import { apis } from "@opengrant/database";
import { getRedis } from "./redis.service.js";
import { getBlockNumber } from "./blockchain.service.js";
import { config } from "../config/index.js";

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    blockchain: ServiceHealth;
  };
}

export interface ServiceHealth {
  status: "up" | "down" | "degraded";
  latency?: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface APIHealthCheckResult {
  apiId: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  responseTime?: number;
  lastCheck: Date;
  error?: string;
}

const startTime = Date.now();

/**
 * Check database health
 */
async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();

  try {
    const isConnected = await testConnection();

    if (!isConnected) {
      return {
        status: "down",
        error: "Connection test failed",
      };
    }

    // Test a simple query
    await db.execute(sql`SELECT 1`);

    return {
      status: "up",
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "down",
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check Redis health
 */
async function checkRedis(): Promise<ServiceHealth> {
  const start = Date.now();

  try {
    const redis = getRedis();
    await redis.ping();

    const info = await redis.info("server");
    const versionMatch = info.match(/redis_version:(\S+)/);

    return {
      status: "up",
      latency: Date.now() - start,
      details: {
        version: versionMatch?.[1] || "unknown",
      },
    };
  } catch (error) {
    return {
      status: "down",
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check blockchain RPC health
 */
async function checkBlockchain(): Promise<ServiceHealth> {
  const start = Date.now();

  try {
    const blockNumber = await getBlockNumber();

    return {
      status: "up",
      latency: Date.now() - start,
      details: {
        chainId: config.blockchain.chainId,
        blockNumber: blockNumber.toString(),
      },
    };
  } catch (error) {
    return {
      status: "down",
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get overall system health status
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const [database, redis, blockchain] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkBlockchain(),
  ]);

  // Determine overall status
  const services = { database, redis, blockchain };
  const statuses = Object.values(services).map((s) => s.status);

  let overallStatus: "healthy" | "degraded" | "unhealthy";
  if (statuses.every((s) => s === "up")) {
    overallStatus = "healthy";
  } else if (statuses.some((s) => s === "down")) {
    overallStatus = "unhealthy";
  } else {
    overallStatus = "degraded";
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    services,
  };
}

/**
 * Check health of an individual API
 */
export async function checkAPIHealth(apiId: string): Promise<APIHealthCheckResult> {
  const start = Date.now();

  try {
    // Get API info
    const [api] = await db
      .select({
        id: apis.id,
        baseUrl: apis.baseUrl,
        status: apis.status,
      })
      .from(apis)
      .where(eq(apis.id, apiId))
      .limit(1);

    if (!api) {
      return {
        apiId,
        status: "unknown",
        lastCheck: new Date(),
        error: "API not found",
      };
    }

    if (api.status !== "active") {
      return {
        apiId,
        status: "down",
        lastCheck: new Date(),
        error: `API status is ${api.status}`,
      };
    }

    // Try to reach the API's health endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${api.baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseTime = Date.now() - start;

      if (response.ok) {
        return {
          apiId,
          status: responseTime > 5000 ? "degraded" : "healthy",
          responseTime,
          lastCheck: new Date(),
        };
      } else {
        return {
          apiId,
          status: "degraded",
          responseTime,
          lastCheck: new Date(),
          error: `HTTP ${response.status}`,
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return {
      apiId,
      status: "down",
      responseTime: Date.now() - start,
      lastCheck: new Date(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update API health status in database
 */
export async function updateAPIHealthStatus(
  apiId: string,
  status: "healthy" | "degraded" | "down" | "unknown",
  responseTimeMs?: number
): Promise<void> {
  await db
    .update(apis)
    .set({
      healthStatus: status,
      avgResponseTimeMs: responseTimeMs,
      lastHealthCheck: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(apis.id, apiId));
}

/**
 * Run health checks for all active APIs
 */
export async function runAPIHealthChecks(): Promise<{
  checked: number;
  healthy: number;
  degraded: number;
  down: number;
}> {
  // Get all active APIs
  const activeApis = await db
    .select({ id: apis.id })
    .from(apis)
    .where(eq(apis.status, "active"));

  let healthy = 0;
  let degraded = 0;
  let down = 0;

  for (const api of activeApis) {
    const result = await checkAPIHealth(api.id);

    await updateAPIHealthStatus(
      api.id,
      result.status,
      result.responseTime
    );

    switch (result.status) {
      case "healthy":
        healthy++;
        break;
      case "degraded":
        degraded++;
        break;
      case "down":
      case "unknown":
        down++;
        break;
    }
  }

  return {
    checked: activeApis.length,
    healthy,
    degraded,
    down,
  };
}

/**
 * Simple liveness check (for Kubernetes)
 */
export function isAlive(): boolean {
  return true;
}

/**
 * Readiness check (for Kubernetes)
 */
export async function isReady(): Promise<boolean> {
  const database = await checkDatabase();
  const redis = await checkRedis();

  return database.status === "up" && redis.status !== "down";
}
