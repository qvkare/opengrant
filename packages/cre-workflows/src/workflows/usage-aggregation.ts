/**
 * Usage Aggregation Workflow
 *
 * This CRE workflow aggregates API usage and triggers on-chain settlements.
 * It runs on a cron schedule (every 5 minutes) to batch payments.
 *
 * Flow:
 * 1. Fetch pending usage records from OpenGrant API
 * 2. Aggregate by API/Publisher
 * 3. Call OpenGrantPayments.batchDistribute() on-chain
 * 4. Mark records as settled
 */

import type {
  UsageRecord,
  AggregatedUsage,
  SettlementResult,
} from "../types";

// Configuration
const OPENGRANT_API_URL = process.env.OPENGRANT_API_URL || "https://api.opengrant.io";
const OPENGRANT_PAYMENTS_ADDRESS = process.env.OPENGRANT_PAYMENTS_ADDRESS || "";
const MIN_SETTLEMENT_AMOUNT = BigInt("100000"); // 0.1 USDC minimum

// OpenGrantPayments ABI for batchDistribute
const BATCH_DISTRIBUTE_ABI = [
  {
    name: "batchDistribute",
    type: "function",
    inputs: [
      { name: "apiIds", type: "bytes32[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

/**
 * Fetch pending usage records from API
 */
async function fetchPendingUsage(
  httpClient: {
    get: (url: string, options?: { headers?: Record<string, string> }) => Promise<{
      status: number;
      body: string;
    }>;
  },
  apiKey: string
): Promise<UsageRecord[]> {
  const response = await httpClient.get(`${OPENGRANT_API_URL}/internal/pending-settlements`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status !== 200) {
    throw new Error(`Failed to fetch pending usage: ${response.status}`);
  }

  const data = JSON.parse(response.body);
  return data.records || [];
}

/**
 * Aggregate usage records by API
 */
function aggregateByAPI(records: UsageRecord[]): AggregatedUsage[] {
  const aggregated = new Map<string, AggregatedUsage>();

  for (const record of records) {
    const existing = aggregated.get(record.apiId);

    if (existing) {
      existing.totalAmount = (
        BigInt(existing.totalAmount) + BigInt(record.amount)
      ).toString();
      existing.callCount += 1;
      existing.recordIds.push(record.id);
    } else {
      aggregated.set(record.apiId, {
        apiId: record.apiId,
        publisher: "", // Will be filled from registry
        totalAmount: record.amount,
        callCount: 1,
        recordIds: [record.id],
      });
    }
  }

  // Filter out aggregations below minimum threshold
  return Array.from(aggregated.values()).filter(
    (agg) => BigInt(agg.totalAmount) >= MIN_SETTLEMENT_AMOUNT
  );
}

/**
 * Execute batch settlement on-chain
 */
async function executeBatchSettlement(
  aggregated: AggregatedUsage[],
  evmClient: {
    write: (params: {
      address: string;
      abi: readonly any[];
      functionName: string;
      args: any[];
      chainId: number;
    }) => Promise<{ txHash: string }>;
  }
): Promise<string> {
  const apiIds = aggregated.map((agg) => agg.apiId);
  const amounts = aggregated.map((agg) => BigInt(agg.totalAmount));

  const result = await evmClient.write({
    address: OPENGRANT_PAYMENTS_ADDRESS,
    abi: BATCH_DISTRIBUTE_ABI,
    functionName: "batchDistribute",
    args: [apiIds, amounts],
    chainId: 8453, // Base mainnet
  });

  return result.txHash;
}

/**
 * Mark records as settled in API
 */
async function markRecordsSettled(
  httpClient: {
    post: (url: string, options: { body: string; headers?: Record<string, string> }) => Promise<{
      status: number;
      body: string;
    }>;
  },
  recordIds: string[],
  txHash: string,
  apiKey: string
): Promise<void> {
  const response = await httpClient.post(`${OPENGRANT_API_URL}/internal/mark-settled`, {
    body: JSON.stringify({
      recordIds,
      txHash,
      settledAt: Date.now(),
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status !== 200) {
    console.error(`Failed to mark records as settled: ${response.status}`);
  }
}

/**
 * Main workflow handler
 */
export async function aggregateAndSettle(
  httpClient: {
    get: (url: string, options?: { headers?: Record<string, string> }) => Promise<{
      status: number;
      body: string;
    }>;
    post: (url: string, options: { body: string; headers?: Record<string, string> }) => Promise<{
      status: number;
      body: string;
    }>;
  },
  evmClient: {
    write: (params: {
      address: string;
      abi: readonly any[];
      functionName: string;
      args: any[];
      chainId: number;
    }) => Promise<{ txHash: string }>;
  },
  secrets: {
    OPENGRANT_API_KEY: string;
  }
): Promise<SettlementResult> {
  const timestamp = Date.now();

  // Step 1: Fetch pending usage records
  const pendingRecords = await fetchPendingUsage(httpClient, secrets.OPENGRANT_API_KEY);

  if (pendingRecords.length === 0) {
    return {
      txHash: "",
      apisSettled: 0,
      totalAmount: "0",
      settledAt: timestamp,
    };
  }

  // Step 2: Aggregate by API
  const aggregated = aggregateByAPI(pendingRecords);

  if (aggregated.length === 0) {
    return {
      txHash: "",
      apisSettled: 0,
      totalAmount: "0",
      settledAt: timestamp,
    };
  }

  // Step 3: Execute batch settlement on-chain
  const txHash = await executeBatchSettlement(aggregated, evmClient);

  // Step 4: Mark records as settled
  const allRecordIds = aggregated.flatMap((agg) => agg.recordIds);
  await markRecordsSettled(httpClient, allRecordIds, txHash, secrets.OPENGRANT_API_KEY);

  // Calculate total amount
  const totalAmount = aggregated
    .reduce((sum, agg) => sum + BigInt(agg.totalAmount), BigInt(0))
    .toString();

  return {
    txHash,
    apisSettled: aggregated.length,
    totalAmount,
    settledAt: timestamp,
  };
}

/**
 * CRE Workflow Configuration
 *
 * This config defines the workflow for the Chainlink CRE SDK.
 * Trigger: Cron (every 5 minutes)
 * Handler: aggregateAndSettle function
 */
export const workflowConfig = {
  name: "usage-aggregation",
  trigger: {
    type: "cron" as const,
    schedule: "*/5 * * * *",
  },
  handler: aggregateAndSettle,
};
