import { eq, and, sql, lt, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  usageRecords,
  payments,
  withdrawals,
  apis,
  publishers,
} from "@opengrant/database";
import {
  createPlatformWallet,
  waitForTransaction,
  parseUSDC,
  formatUSDC,
} from "./blockchain.service.js";
import { recordPayment, calculatePlatformFee, calculateNetAmount } from "./payment.service.js";
import type { Address, Hash } from "viem";

export interface SettlementResult {
  success: boolean;
  paymentId?: string;
  txHash?: string;
  error?: string;
  grossAmount?: string;
  netAmount?: string;
  platformFee?: string;
}

export interface WithdrawalResult {
  success: boolean;
  withdrawalId?: string;
  txHash?: string;
  error?: string;
}

/**
 * Settle payments for a publisher's API
 * Groups verified payments and creates a settlement payment record
 */
export async function settleApiPayments(
  apiId: string,
  options: {
    minAmount?: bigint; // Minimum amount to settle (default: 1 USDC)
    executeOnChain?: boolean; // Whether to execute actual blockchain transfer
  } = {}
): Promise<SettlementResult> {
  const { minAmount = parseUSDC("1"), executeOnChain = false } = options;

  try {
    // Get API and publisher info
    const [api] = await db
      .select({
        id: apis.id,
        publisherId: apis.publisherId,
      })
      .from(apis)
      .where(eq(apis.id, apiId))
      .limit(1);

    if (!api) {
      return { success: false, error: "API not found" };
    }

    const [publisher] = await db
      .select({
        id: publishers.id,
        walletAddress: publishers.walletAddress,
      })
      .from(publishers)
      .where(eq(publishers.id, api.publisherId))
      .limit(1);

    if (!publisher) {
      return { success: false, error: "Publisher not found" };
    }

    // Get verified (unsettled) usage records
    const verifiedRecords = await db
      .select({
        id: usageRecords.id,
        priceCharged: usageRecords.priceCharged,
        requestTimestamp: usageRecords.requestTimestamp,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.apiId, apiId),
          eq(usageRecords.paymentStatus, "verified")
        )
      );

    if (verifiedRecords.length === 0) {
      return { success: false, error: "No verified payments to settle" };
    }

    // Calculate total amount
    const grossAmount = verifiedRecords.reduce(
      (sum, r) => sum + BigInt(r.priceCharged),
      BigInt(0)
    );

    if (grossAmount < minAmount) {
      return {
        success: false,
        error: `Amount below minimum threshold: ${formatUSDC(grossAmount)} < ${formatUSDC(minAmount)} USDC`,
      };
    }

    // Calculate fees
    const platformFee = calculatePlatformFee(grossAmount);
    const netAmount = calculateNetAmount(grossAmount);

    // Determine period
    const timestamps = verifiedRecords.map((r) => r.requestTimestamp);
    const periodStart = new Date(Math.min(...timestamps.map((t) => t.getTime())));
    const periodEnd = new Date(Math.max(...timestamps.map((t) => t.getTime())));

    let txHash: string | undefined;

    // Execute on-chain transfer if requested
    if (executeOnChain) {
      try {
        const platformWallet = createPlatformWallet();
        txHash = await platformWallet.transferUSDC(
          publisher.walletAddress as Address,
          netAmount
        );

        // Wait for confirmation
        await waitForTransaction(txHash as Hash);
      } catch (error) {
        console.error("On-chain settlement failed:", error);
        return {
          success: false,
          error: `On-chain transfer failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }

    // Record payment
    const paymentId = await recordPayment(
      publisher.id,
      apiId,
      grossAmount,
      periodStart,
      periodEnd,
      verifiedRecords.length,
      txHash
    );

    // Update usage records to settled
    const recordIds = verifiedRecords.map((r) => r.id);
    await db
      .update(usageRecords)
      .set({
        paymentStatus: "settled",
        settlementBatchId: paymentId,
        settledAt: new Date(),
      })
      .where(inArray(usageRecords.id, recordIds));

    return {
      success: true,
      paymentId,
      txHash,
      grossAmount: formatUSDC(grossAmount),
      netAmount: formatUSDC(netAmount),
      platformFee: formatUSDC(platformFee),
    };
  } catch (error) {
    console.error("Settlement error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Settlement failed",
    };
  }
}

/**
 * Settle all pending payments for a publisher
 */
export async function settlePublisherPayments(
  publisherId: string,
  options: {
    minAmount?: bigint;
    executeOnChain?: boolean;
  } = {}
): Promise<SettlementResult[]> {
  // Get all APIs for publisher
  const publisherApis = await db
    .select({ id: apis.id })
    .from(apis)
    .where(eq(apis.publisherId, publisherId));

  const results: SettlementResult[] = [];

  for (const api of publisherApis) {
    const result = await settleApiPayments(api.id, options);
    if (result.success || result.error !== "No verified payments to settle") {
      results.push(result);
    }
  }

  return results;
}

/**
 * Process a withdrawal request
 */
export async function processWithdrawal(
  withdrawalId: string
): Promise<WithdrawalResult> {
  try {
    // Get withdrawal
    const [withdrawal] = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);

    if (!withdrawal) {
      return { success: false, error: "Withdrawal not found" };
    }

    if (withdrawal.status !== "pending") {
      return { success: false, error: `Withdrawal already ${withdrawal.status}` };
    }

    // Update to processing
    await db
      .update(withdrawals)
      .set({ status: "processing" })
      .where(eq(withdrawals.id, withdrawalId));

    try {
      // Execute transfer
      const platformWallet = createPlatformWallet();
      const amount = parseUSDC(withdrawal.amount);
      const txHash = await platformWallet.transferUSDC(
        withdrawal.destinationAddress as Address,
        amount
      );

      // Wait for confirmation
      await waitForTransaction(txHash as Hash);

      // Update withdrawal
      await db
        .update(withdrawals)
        .set({
          status: "completed",
          txHash,
          processedAt: new Date(),
        })
        .where(eq(withdrawals.id, withdrawalId));

      return {
        success: true,
        withdrawalId,
        txHash,
      };
    } catch (error) {
      // Mark as failed
      await db
        .update(withdrawals)
        .set({ status: "failed" })
        .where(eq(withdrawals.id, withdrawalId));

      throw error;
    }
  } catch (error) {
    console.error("Withdrawal processing error:", error);
    return {
      success: false,
      withdrawalId,
      error: error instanceof Error ? error.message : "Processing failed",
    };
  }
}

/**
 * Get settlement summary for a time period
 */
export async function getSettlementSummary(
  startDate: Date,
  endDate: Date
): Promise<{
  totalGross: string;
  totalFees: string;
  totalNet: string;
  paymentsCount: number;
  apisCount: number;
  publishersCount: number;
}> {
  const [summary] = await db
    .select({
      totalGross: sql<string>`COALESCE(SUM(${payments.grossAmount}), 0)::text`,
      totalFees: sql<string>`COALESCE(SUM(${payments.platformFee}), 0)::text`,
      totalNet: sql<string>`COALESCE(SUM(${payments.netAmount}), 0)::text`,
      paymentsCount: sql<number>`COUNT(*)::int`,
      apisCount: sql<number>`COUNT(DISTINCT ${payments.apiId})::int`,
      publishersCount: sql<number>`COUNT(DISTINCT ${payments.publisherId})::int`,
    })
    .from(payments)
    .where(
      and(
        sql`${payments.periodStart} >= ${startDate}`,
        sql`${payments.periodEnd} <= ${endDate}`
      )
    );

  return {
    totalGross: summary?.totalGross || "0",
    totalFees: summary?.totalFees || "0",
    totalNet: summary?.totalNet || "0",
    paymentsCount: summary?.paymentsCount || 0,
    apisCount: summary?.apisCount || 0,
    publishersCount: summary?.publishersCount || 0,
  };
}

/**
 * Run periodic settlement (for cron job)
 */
export async function runPeriodicSettlement(options: {
  minAmount?: bigint;
  executeOnChain?: boolean;
} = {}): Promise<{
  processed: number;
  successful: number;
  failed: number;
  totalSettled: string;
}> {
  // Get all publishers with pending payments
  const pendingByPublisher = await db
    .select({
      publisherId: apis.publisherId,
    })
    .from(usageRecords)
    .innerJoin(apis, eq(usageRecords.apiId, apis.id))
    .where(eq(usageRecords.paymentStatus, "verified"))
    .groupBy(apis.publisherId);

  let processed = 0;
  let successful = 0;
  let failed = 0;
  let totalSettled = BigInt(0);

  for (const { publisherId } of pendingByPublisher) {
    const results = await settlePublisherPayments(publisherId, options);

    for (const result of results) {
      processed++;
      if (result.success) {
        successful++;
        totalSettled += parseUSDC(result.netAmount || "0");
      } else {
        failed++;
      }
    }
  }

  return {
    processed,
    successful,
    failed,
    totalSettled: formatUSDC(totalSettled),
  };
}
