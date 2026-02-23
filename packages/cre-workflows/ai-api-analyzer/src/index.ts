/**
 * AI API Analyzer Workflow
 *
 * Uses Claude to analyze API metrics and provide actionable recommendations.
 * Runs hourly via Chainlink CRE.
 *
 * Flow:
 * 1. HTTP GET /internal/api-metrics (fetch all API usage/health data)
 * 2. HTTP POST anthropic.com/v1/messages (Claude analyzes metrics, returns enum-only ratings)
 * 3. Normalize enum outputs for deterministic consensus
 * 4. HTTP POST /internal/ai-report (submit analysis results)
 *
 * Consensus Strategy:
 * - Claude is prompted to return ONLY enum values (HEALTHY/NEEDS_ATTENTION/CRITICAL)
 * - normalizeEnum() maps variations to canonical values
 * - Results are sorted by slug for deterministic ordering
 * - Timestamps are rounded to the hour
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
import { toBase64 } from "../../lib/base64.js";

interface Config {
  schedule: string;
  apiUrl: string;
  anthropicApiUrl: string;
  analysisModel: string;
}

interface APIMetric {
  id: string;
  slug: string;
  name: string;
  status: string;
  healthStatus: string;
  totalCalls: number;
  totalRevenue: string;
  uniqueConsumers: number;
  // CRE consensus serialization does not accept null, so use -1 as "N/A".
  avgResponseTimeMs: number;
  endpointCount: number;
}

type Rating = "HEALTHY" | "NEEDS_ATTENTION" | "CRITICAL";
type Recommendation = "NONE" | "OPTIMIZE" | "INVESTIGATE" | "SCALE" | "DEPRECATE";

interface APIAnalysis {
  slug: string;
  rating: Rating;
  recommendation: Recommendation;
}

const VALID_RATINGS: Rating[] = ["HEALTHY", "NEEDS_ATTENTION", "CRITICAL"];
const VALID_RECOMMENDATIONS: Recommendation[] = ["NONE", "OPTIMIZE", "INVESTIGATE", "SCALE", "DEPRECATE"];

/**
 * Normalize an enum value to its canonical form.
 * Handles variations from LLM output (e.g., "needs attention" → "NEEDS_ATTENTION").
 */
function normalizeEnum<T extends string>(value: string, validValues: T[], fallback: T): T {
  const upper = value.toUpperCase().trim().replace(/[\s-]+/g, "_");
  const found = validValues.find((v) => v === upper);
  return found ?? fallback;
}

/**
 * Round a timestamp to the nearest hour for deterministic consensus.
 */
function roundToHour(date: Date): string {
  const rounded = new Date(date);
  rounded.setMinutes(0, 0, 0);
  return rounded.toISOString();
}

const fetchApiMetrics = (
  sendRequester: HTTPSendRequester,
  apiUrl: string,
  apiKey: string
) => {
  const resp = sendRequester
    .sendRequest({
      url: apiUrl + "/internal/api-metrics",
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
    })
    .result();

  if (!ok(resp)) {
    throw new Error(`Failed to fetch API metrics: ${resp.statusCode}`);
  }

  const raw = json(resp) as {
    apis: Array<{
      id: string;
      slug: string;
      name: string;
      status: string;
      healthStatus: string;
      totalCalls: number;
      totalRevenue: string;
      uniqueConsumers: number;
      avgResponseTimeMs: number | null;
      endpointCount: number;
    }>;
  };

  // Normalize/strip fields for deterministic, CRE-serializable consensus payload.
  return {
    apis: raw.apis.map((api) => ({
      id: api.id,
      slug: api.slug,
      name: api.name,
      status: api.status,
      healthStatus: api.healthStatus,
      totalCalls: api.totalCalls,
      totalRevenue: api.totalRevenue,
      uniqueConsumers: api.uniqueConsumers,
      avgResponseTimeMs: api.avgResponseTimeMs ?? -1,
      endpointCount: api.endpointCount,
    })),
  };
};

const analyzeWithClaude = (
  sendRequester: HTTPSendRequester,
  anthropicApiUrl: string,
  anthropicApiKey: string,
  model: string,
  metrics: APIMetric[]
) => {
  const metricsText = metrics
    .map(
      (m) =>
        `API: ${m.slug} (${m.name}) | status=${m.status} health=${m.healthStatus} ` +
        `calls=${m.totalCalls} revenue=$${m.totalRevenue} consumers=${m.uniqueConsumers} ` +
        `avgResponseMs=${m.avgResponseTimeMs >= 0 ? m.avgResponseTimeMs : "N/A"} endpoints=${m.endpointCount}`
    )
    .join("\n");

  const prompt = `You are an API health analyzer. Analyze each API's metrics and return a JSON array.

For each API, provide:
- "slug": the API slug (exact match from the metrics)
- "rating": exactly one of HEALTHY, NEEDS_ATTENTION, CRITICAL
- "recommendation": exactly one of NONE, OPTIMIZE, INVESTIGATE, SCALE, DEPRECATE

Rules:
- HEALTHY: good health status, reasonable response times, active usage
- NEEDS_ATTENTION: degraded health, high response times, or declining usage
- CRITICAL: down status, zero calls, or severe issues
- NONE: no action needed
- OPTIMIZE: could improve performance
- INVESTIGATE: anomalies detected
- SCALE: high usage suggests scaling needed
- DEPRECATE: inactive/unused API

Return ONLY a valid JSON array, no markdown, no explanation.

Metrics:
${metricsText}`;

  const body = {
    model,
    max_tokens: 1024,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  };

  const resp = sendRequester
    .sendRequest({
      url: anthropicApiUrl + "/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: toBase64(JSON.stringify(body)),
    })
    .result();

  if (!ok(resp)) {
    throw new Error(`Claude API error: ${resp.statusCode}`);
  }

  const response = json(resp) as {
    content: Array<{ type: string; text: string }>;
  };

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error("No text response from Claude");
  }

  // Parse and normalize the JSON array
  let rawAnalyses: Array<{ slug: string; rating: string; recommendation: string }>;
  try {
    rawAnalyses = JSON.parse(textBlock.text);
  } catch {
    throw new Error("Failed to parse Claude response as JSON");
  }

  // Normalize enums for consensus determinism
  const analyses: APIAnalysis[] = rawAnalyses
    .map((a) => ({
      slug: a.slug,
      rating: normalizeEnum(a.rating, VALID_RATINGS, "NEEDS_ATTENTION"),
      recommendation: normalizeEnum(a.recommendation, VALID_RECOMMENDATIONS, "INVESTIGATE"),
    }))
    // Sort by slug for deterministic ordering across nodes
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return analyses;
};

const submitAiReport = (
  sendRequester: HTTPSendRequester,
  apiUrl: string,
  apiKey: string,
  analyses: APIAnalysis[],
  model: string,
  analyzedAt: string
) => {
  const body = { analyses, model, analyzedAt };

  const resp = sendRequester
    .sendRequest({
      url: apiUrl + "/internal/ai-report",
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: toBase64(JSON.stringify(body)),
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

  const anthropicApiKey = runtime
    .getSecret({ id: "ANTHROPIC_API_KEY" })
    .result().value;

  const httpClient = new cre.capabilities.HTTPClient();

  // Step 1: Fetch API metrics
  const metricsData = httpClient
    .sendRequest(runtime, fetchApiMetrics, consensusIdenticalAggregation())(
      runtime.config.apiUrl,
      apiKey
    )
    .result() as { apis: APIMetric[] };

  if (!metricsData.apis || metricsData.apis.length === 0) {
    runtime.log("No APIs to analyze");
    return JSON.stringify({ analyzed: 0 });
  }

  runtime.log(`Analyzing ${metricsData.apis.length} API(s) with Claude`);

  // Step 2: Analyze with Claude (enum-only output + normalization for consensus)
  const analyses = httpClient
    .sendRequest(runtime, analyzeWithClaude, consensusIdenticalAggregation())(
      runtime.config.anthropicApiUrl,
      anthropicApiKey,
      runtime.config.analysisModel,
      metricsData.apis
    )
    .result();

  const analyzedAt = roundToHour(new Date());

  // Step 3: Submit AI report
  httpClient
    .sendRequest(runtime, submitAiReport, consensusIdenticalAggregation())(
      runtime.config.apiUrl,
      apiKey,
      analyses,
      runtime.config.analysisModel,
      analyzedAt
    )
    .result();

  const summary = {
    analyzed: analyses.length,
    healthy: analyses.filter((a) => a.rating === "HEALTHY").length,
    needsAttention: analyses.filter((a) => a.rating === "NEEDS_ATTENTION").length,
    critical: analyses.filter((a) => a.rating === "CRITICAL").length,
    analyzedAt,
  };

  runtime.log(
    `AI analysis complete: ${summary.healthy} healthy, ${summary.needsAttention} attention, ${summary.critical} critical`
  );

  return JSON.stringify(summary);
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
