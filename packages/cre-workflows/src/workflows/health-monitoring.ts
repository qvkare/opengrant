/**
 * Health Monitoring Workflow
 *
 * This CRE workflow monitors the health of registered APIs.
 * It runs every minute to check API availability and response times.
 *
 * Flow:
 * 1. Fetch list of active APIs from registry
 * 2. Ping each API's health endpoint
 * 3. Update health status in database
 * 4. Auto-deactivate APIs that fail repeatedly
 */

import type { APIHealthCheck, HealthReport } from "../types";

// Configuration
const OPENGRANT_API_URL = process.env.OPENGRANT_API_URL || "https://api.opengrant.io";
const HEALTH_CHECK_TIMEOUT_MS = 5000;
const DEGRADED_THRESHOLD_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Check health of a single API endpoint
 */
async function checkAPIHealth(
  apiId: string,
  baseUrl: string,
  httpClient: {
    get: (url: string, options?: { timeout?: number }) => Promise<{
      status: number;
      body: string;
    }>;
  }
): Promise<APIHealthCheck> {
  const startTime = Date.now();
  const healthEndpoint = `${baseUrl}/health`;

  try {
    const response = await httpClient.get(healthEndpoint, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });

    const responseTimeMs = Date.now() - startTime;
    let status: "healthy" | "degraded" | "down";

    if (response.status >= 200 && response.status < 300) {
      status = responseTimeMs > DEGRADED_THRESHOLD_MS ? "degraded" : "healthy";
    } else if (response.status >= 500) {
      status = "down";
    } else {
      status = "degraded";
    }

    return {
      apiId,
      endpoint: healthEndpoint,
      status,
      responseTimeMs,
      statusCode: response.status,
      checkedAt: Date.now(),
    };
  } catch (error) {
    return {
      apiId,
      endpoint: healthEndpoint,
      status: "down",
      responseTimeMs: Date.now() - startTime,
      statusCode: 0,
      error: error instanceof Error ? error.message : "Health check failed",
      checkedAt: Date.now(),
    };
  }
}

/**
 * Fetch active APIs from registry
 */
async function fetchActiveAPIs(
  httpClient: {
    get: (url: string, options?: { headers?: Record<string, string> }) => Promise<{
      status: number;
      body: string;
    }>;
  },
  apiKey: string
): Promise<Array<{ id: string; baseUrl: string; consecutiveFailures: number }>> {
  const response = await httpClient.get(`${OPENGRANT_API_URL}/internal/active-apis`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.status !== 200) {
    throw new Error(`Failed to fetch active APIs: ${response.status}`);
  }

  const data = JSON.parse(response.body);
  return data.apis || [];
}

/**
 * Update health status in database
 */
async function updateHealthStatus(
  httpClient: {
    post: (url: string, options: { body: string; headers?: Record<string, string> }) => Promise<{
      status: number;
      body: string;
    }>;
  },
  checks: APIHealthCheck[],
  apiKey: string
): Promise<void> {
  await httpClient.post(`${OPENGRANT_API_URL}/internal/health-report`, {
    body: JSON.stringify({
      checks,
      reportedAt: Date.now(),
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Auto-deactivate APIs that have failed too many times
 */
async function deactivateUnhealthyAPIs(
  httpClient: {
    post: (url: string, options: { body: string; headers?: Record<string, string> }) => Promise<{
      status: number;
      body: string;
    }>;
  },
  checks: APIHealthCheck[],
  apiFailureCounts: Map<string, number>,
  apiKey: string
): Promise<string[]> {
  const toDeactivate: string[] = [];

  for (const check of checks) {
    if (check.status === "down") {
      const failures = (apiFailureCounts.get(check.apiId) || 0) + 1;
      apiFailureCounts.set(check.apiId, failures);

      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        toDeactivate.push(check.apiId);
      }
    } else {
      // Reset failure count on successful check
      apiFailureCounts.set(check.apiId, 0);
    }
  }

  if (toDeactivate.length > 0) {
    await httpClient.post(`${OPENGRANT_API_URL}/internal/deactivate-apis`, {
      body: JSON.stringify({
        apiIds: toDeactivate,
        reason: "Automatic deactivation due to repeated health check failures",
        deactivatedAt: Date.now(),
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  return toDeactivate;
}

/**
 * Main workflow handler
 */
export async function monitorHealth(
  httpClient: {
    get: (url: string, options?: { headers?: Record<string, string>; timeout?: number }) => Promise<{
      status: number;
      body: string;
    }>;
    post: (url: string, options: { body: string; headers?: Record<string, string> }) => Promise<{
      status: number;
      body: string;
    }>;
  },
  secrets: {
    OPENGRANT_API_KEY: string;
  },
  // State persisted between invocations (in actual CRE, this would be workflow state)
  state?: {
    failureCounts: Map<string, number>;
  }
): Promise<HealthReport> {
  const failureCounts = state?.failureCounts || new Map<string, number>();
  const timestamp = Date.now();

  // Step 1: Fetch active APIs
  const activeAPIs = await fetchActiveAPIs(httpClient, secrets.OPENGRANT_API_KEY);

  if (activeAPIs.length === 0) {
    return {
      totalChecked: 0,
      healthy: 0,
      degraded: 0,
      down: 0,
      checks: [],
      reportedAt: timestamp,
    };
  }

  // Step 2: Check health of each API (in parallel for efficiency)
  const checkPromises = activeAPIs.map((api) =>
    checkAPIHealth(api.id, api.baseUrl, httpClient)
  );

  const checks = await Promise.all(checkPromises);

  // Step 3: Update health status in database
  await updateHealthStatus(httpClient, checks, secrets.OPENGRANT_API_KEY);

  // Step 4: Auto-deactivate unhealthy APIs
  await deactivateUnhealthyAPIs(httpClient, checks, failureCounts, secrets.OPENGRANT_API_KEY);

  // Aggregate results
  const healthy = checks.filter((c) => c.status === "healthy").length;
  const degraded = checks.filter((c) => c.status === "degraded").length;
  const down = checks.filter((c) => c.status === "down").length;

  return {
    totalChecked: checks.length,
    healthy,
    degraded,
    down,
    checks,
    reportedAt: timestamp,
  };
}

/**
 * CRE Workflow Configuration
 *
 * This config defines the workflow for the Chainlink CRE SDK.
 * Trigger: Cron (every minute)
 * Handler: monitorHealth function
 */
export const workflowConfig = {
  name: "health-monitoring",
  trigger: {
    type: "cron" as const,
    schedule: "*/1 * * * *",
  },
  handler: monitorHealth,
};
