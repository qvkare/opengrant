/**
 * Health Monitoring Workflow
 *
 * Monitors the health of registered APIs by checking their availability
 * and response times. Runs every minute.
 *
 * Flow:
 * 1. HTTP GET /internal/active-apis
 * 2. For each API, HTTP GET its base URL /health with timeout
 * 3. Build health report
 * 4. HTTP POST /internal/health-report
 * 5. If any API has 5+ consecutive failures, HTTP POST /internal/deactivate-apis
 */

import {
  Runner,
  cre,
  consensusIdenticalAggregation,
  ok,
  json,
  type Runtime,
  type HTTPSendRequester,
  type CronPayload,
} from "@chainlink/cre-sdk";

interface Config {
  schedule: string;
  apiUrl: string;
  healthCheckTimeoutMs: number;
  degradedThresholdMs: number;
  maxConsecutiveFailures: number;
}

interface ActiveAPI {
  id: string;
  baseUrl: string;
  consecutiveFailures: number;
}

interface HealthCheck {
  apiId: string;
  status: "healthy" | "degraded" | "down";
  responseTimeMs: number;
  statusCode: number;
  error?: string;
}

interface HealthReport {
  totalChecked: number;
  healthy: number;
  degraded: number;
  down: number;
  checks: HealthCheck[];
  apisToDeactivate: string[];
}

const fetchActiveApis = (
  sendRequester: HTTPSendRequester,
  apiUrl: string,
  apiKey: string
) => {
  const resp = sendRequester
    .sendRequest({
      url: apiUrl + "/internal/active-apis",
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
    })
    .result();

  if (!ok(resp)) {
    throw new Error(`Failed to fetch active APIs: ${resp.statusCode}`);
  }

  return json(resp) as { apis: ActiveAPI[] };
};

const checkApisHealth = (
  sendRequester: HTTPSendRequester,
  apis: ActiveAPI[],
  timeoutMs: number,
  degradedMs: number
) => {
  const results: HealthCheck[] = [];

  for (const api of apis) {
    const startMs = performance.now();
    try {
      const resp = sendRequester
        .sendRequest({
          url: api.baseUrl + "/health",
          method: "GET",
          timeout: `${Math.floor(timeoutMs / 1000)}s`,
        })
        .result();

      const elapsed = Math.round(performance.now() - startMs);
      let status: "healthy" | "degraded" | "down";

      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        status = elapsed > degradedMs ? "degraded" : "healthy";
      } else if (resp.statusCode >= 500) {
        status = "down";
      } else {
        status = "degraded";
      }

      results.push({
        apiId: api.id,
        status,
        responseTimeMs: elapsed,
        statusCode: resp.statusCode,
      });
    } catch (err) {
      const elapsed = Math.round(performance.now() - startMs);
      results.push({
        apiId: api.id,
        status: "down",
        responseTimeMs: elapsed,
        statusCode: 0,
        error:
          err instanceof Error ? err.message : "Health check failed",
      });
    }
  }

  return results;
};

const submitReport = (
  sendRequester: HTTPSendRequester,
  apiUrl: string,
  apiKey: string,
  report: HealthReport
) => {
  const resp = sendRequester
    .sendRequest({
      url: apiUrl + "/internal/health-report",
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: btoa(JSON.stringify(report)),
    })
    .result();

  return ok(resp);
};

const deactivateApis = (
  sendRequester: HTTPSendRequester,
  apiUrl: string,
  apiKey: string,
  apiIds: string[]
) => {
  const resp = sendRequester
    .sendRequest({
      url: apiUrl + "/internal/deactivate-apis",
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: btoa(
        JSON.stringify({
          apiIds,
          reason:
            "Automatic deactivation due to repeated health check failures",
        })
      ),
    })
    .result();

  return ok(resp);
};

const onCronTrigger = (
  runtime: Runtime<Config>,
  _payload: CronPayload
): string => {
  const apiKey = runtime
    .getSecret({ id: "OPENGRANT_API_KEY" })
    .result().value;

  const httpClient = new cre.capabilities.HTTPClient();

  // Step 1: Fetch active APIs
  const activeApis = httpClient
    .sendRequest(runtime, fetchActiveApis, consensusIdenticalAggregation())(
      runtime.config.apiUrl,
      apiKey
    )
    .result();

  if (!activeApis.apis || activeApis.apis.length === 0) {
    runtime.log("No active APIs to monitor");
    return JSON.stringify({
      totalChecked: 0,
      healthy: 0,
      degraded: 0,
      down: 0,
    });
  }

  runtime.log(`Checking health of ${activeApis.apis.length} API(s)`);

  // Step 2: Check each API health
  const checks = httpClient
    .sendRequest(
      runtime,
      checkApisHealth,
      consensusIdenticalAggregation()
    )(
      activeApis.apis,
      runtime.config.healthCheckTimeoutMs,
      runtime.config.degradedThresholdMs
    )
    .result();

  // Step 3: Determine which APIs to deactivate
  const apisToDeactivate: string[] = [];
  for (const check of checks) {
    if (check.status === "down") {
      const api = activeApis.apis.find((a) => a.id === check.apiId);
      const failures = (api?.consecutiveFailures ?? 0) + 1;
      if (failures >= runtime.config.maxConsecutiveFailures) {
        apisToDeactivate.push(check.apiId);
      }
    }
  }

  const healthy = checks.filter((c) => c.status === "healthy").length;
  const degraded = checks.filter((c) => c.status === "degraded").length;
  const down = checks.filter((c) => c.status === "down").length;

  const report: HealthReport = {
    totalChecked: checks.length,
    healthy,
    degraded,
    down,
    checks,
    apisToDeactivate,
  };

  // Step 4: Submit health report
  httpClient
    .sendRequest(runtime, submitReport, consensusIdenticalAggregation())(
      runtime.config.apiUrl,
      apiKey,
      report
    )
    .result();

  // Step 5: Deactivate APIs with too many consecutive failures
  if (apisToDeactivate.length > 0) {
    runtime.log(
      `Deactivating ${apisToDeactivate.length} API(s) due to repeated failures`
    );

    httpClient
      .sendRequest(
        runtime,
        deactivateApis,
        consensusIdenticalAggregation()
      )(runtime.config.apiUrl, apiKey, apisToDeactivate)
      .result();
  }

  runtime.log(
    `Health check complete: ${healthy} healthy, ${degraded} degraded, ${down} down`
  );

  return JSON.stringify({
    totalChecked: report.totalChecked,
    healthy,
    degraded,
    down,
  });
};

const initWorkflow = (config: Config) => {
  const cronCap = new cre.capabilities.CronCapability();
  return [
    cre.handler(
      cronCap.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({});
  await runner.run(initWorkflow);
}
