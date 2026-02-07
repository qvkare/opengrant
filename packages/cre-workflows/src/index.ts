/**
 * OpenGrant CRE Workflows
 *
 * This package contains Chainlink CRE workflows for:
 * - Payment verification with multi-node consensus
 * - Usage aggregation and batch settlement
 * - API health monitoring
 */

// Export workflow handlers
export { verifyPayment, workflowConfig as paymentVerificationConfig } from "./workflows/payment-verification";
export { aggregateAndSettle, workflowConfig as usageAggregationConfig } from "./workflows/usage-aggregation";
export { monitorHealth, workflowConfig as healthMonitoringConfig } from "./workflows/health-monitoring";

// Export types
export type {
  VerifyPaymentInput,
  VerifyPaymentOutput,
  UsageRecord,
  AggregatedUsage,
  SettlementResult,
  APIHealthCheck,
  HealthReport,
  X402PaymentPayload,
  X402PaymentRequirement,
  X402VerifyResponse,
} from "./types";

/**
 * Workflow Registry
 *
 * All available workflows with their configurations
 */
export const workflows = {
  "payment-verification": {
    name: "payment-verification",
    description: "Verifies x402 payment signatures using multi-node consensus",
    trigger: { type: "http", path: "/verify-payment", method: "POST" },
    capabilities: ["http-client"],
  },
  "usage-aggregation": {
    name: "usage-aggregation",
    description: "Aggregates API usage and triggers on-chain settlements",
    trigger: { type: "cron", schedule: "*/5 * * * *" },
    capabilities: ["http-client", "evm-client"],
  },
  "health-monitoring": {
    name: "health-monitoring",
    description: "Monitors API health and auto-deactivates unhealthy endpoints",
    trigger: { type: "cron", schedule: "*/1 * * * *" },
    capabilities: ["http-client", "evm-client"],
  },
} as const;
