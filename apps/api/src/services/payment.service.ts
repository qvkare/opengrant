import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { usageRecords, payments, apis, publishers } from "@opengrant/database";
import {
  getTransactionReceipt,
  waitForTransaction,
  isAuthorizationUsed,
  formatUSDC,
} from "./blockchain.service.js";
import { config } from "../config/index.js";
import type { Address, Hash } from "viem";

// Platform fee percentage (e.g., 10% = 1000 basis points)
const PLATFORM_FEE_BPS = 1000; // 10%

export interface PaymentVerificationResult {
  valid: boolean;
  error?: string;
  txHash?: string;
  amount?: string;
  payer?: string;
}

export interface X402PaymentPayload {
  version: string;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

/**
 * Verify an x402 payment
 */
export async function verifyX402Payment(
  paymentPayload: X402PaymentPayload,
  expectedAmount: bigint,
  expectedRecipient: Address
): Promise<PaymentVerificationResult> {
  try {
    const { authorization, signature } = paymentPayload.payload;

    // Verify recipient
    if (authorization.to.toLowerCase() !== expectedRecipient.toLowerCase()) {
      return {
        valid: false,
        error: "Payment recipient mismatch",
      };
    }

    // Verify amount
    const paymentAmount = BigInt(authorization.value);
    if (paymentAmount < expectedAmount) {
      return {
        valid: false,
        error: `Insufficient payment: expected ${expectedAmount}, got ${paymentAmount}`,
      };
    }

    // Verify time bounds
    const now = Math.floor(Date.now() / 1000);
    const validAfter = parseInt(authorization.validAfter);
    const validBefore = parseInt(authorization.validBefore);

    if (now < validAfter) {
      return {
        valid: false,
        error: "Payment not yet valid",
      };
    }

    if (now > validBefore) {
      return {
        valid: false,
        error: "Payment expired",
      };
    }

    // Check if authorization has been used
    const isUsed = await isAuthorizationUsed(
      authorization.from as Address,
      authorization.nonce as `0x${string}`
    );

    if (isUsed) {
      return {
        valid: false,
        error: "Payment authorization already used",
      };
    }

    return {
      valid: true,
      amount: authorization.value,
      payer: authorization.from,
    };
  } catch (error) {
    console.error("Payment verification error:", error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}

/**
 * Record a payment in the database
 */
export async function recordPayment(
  publisherId: string,
  apiId: string,
  grossAmount: bigint,
  periodStart: Date,
  periodEnd: Date,
  usageCount: number,
  txHash?: string
): Promise<string> {
  // Check for duplicate txHash to prevent double payments
  if (txHash) {
    const existing = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.settlementTxHash, txHash))
      .limit(1);

    if (existing.length > 0) {
      throw new Error(`Payment with txHash ${txHash} already recorded`);
    }
  }

  // Calculate platform fee and net amount
  const platformFee = (grossAmount * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
  const netAmount = grossAmount - platformFee;

  const [payment] = await db
    .insert(payments)
    .values({
      publisherId,
      apiId,
      grossAmount: formatUSDC(grossAmount),
      platformFee: formatUSDC(platformFee),
      netAmount: formatUSDC(netAmount),
      periodStart,
      periodEnd,
      usageCount,
      settlementTxHash: txHash || null,
      settledAt: txHash ? new Date() : null,
    })
    .returning();

  return payment.id;
}

/**
 * Update usage record with payment info
 */
export async function updateUsageWithPayment(
  usageId: string,
  txHash: string,
  status: "verified" | "settled" | "failed"
): Promise<void> {
  await db
    .update(usageRecords)
    .set({
      paymentTxHash: txHash,
      paymentStatus: status,
      settledAt: status === "settled" ? new Date() : null,
    })
    .where(eq(usageRecords.id, usageId));
}

/**
 * Get pending payments that need settlement
 */
export async function getPendingPayments(
  publisherId?: string
): Promise<
  Array<{
    apiId: string;
    publisherId: string;
    pendingAmount: string;
    usageCount: number;
  }>
> {
  const conditions = [eq(usageRecords.paymentStatus, "verified")];

  if (publisherId) {
    // Get API IDs for this publisher
    const publisherApis = await db
      .select({ id: apis.id })
      .from(apis)
      .where(eq(apis.publisherId, publisherId));

    if (publisherApis.length === 0) {
      return [];
    }

    const apiIds = publisherApis.map((a) => a.id);
    conditions.push(sql`${usageRecords.apiId} = ANY(${apiIds})`);
  }

  const result = await db
    .select({
      apiId: usageRecords.apiId,
      pendingAmount: sql<string>`SUM(${usageRecords.priceCharged})::text`,
      usageCount: sql<number>`COUNT(*)::int`,
    })
    .from(usageRecords)
    .where(and(...conditions))
    .groupBy(usageRecords.apiId);

  // Get publisher IDs for each API
  const enriched = await Promise.all(
    result.map(async (row) => {
      const [api] = await db
        .select({ publisherId: apis.publisherId })
        .from(apis)
        .where(eq(apis.id, row.apiId))
        .limit(1);

      return {
        ...row,
        publisherId: api?.publisherId || "",
      };
    })
  );

  return enriched.filter((r) => r.publisherId);
}

/**
 * Get payment stats for a publisher
 */
export async function getPublisherPaymentStats(publisherId: string): Promise<{
  totalGross: string;
  totalFees: string;
  totalNet: string;
  pendingSettlement: string;
  paymentsCount: number;
}> {
  // Get settled payments
  const [totals] = await db
    .select({
      totalGross: sql<string>`COALESCE(SUM(${payments.grossAmount}), 0)::text`,
      totalFees: sql<string>`COALESCE(SUM(${payments.platformFee}), 0)::text`,
      totalNet: sql<string>`COALESCE(SUM(${payments.netAmount}), 0)::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(payments)
    .where(eq(payments.publisherId, publisherId));

  // Get pending amounts
  const pending = await getPendingPayments(publisherId);
  const pendingTotal = pending.reduce(
    (sum, p) => sum + BigInt(p.pendingAmount || "0"),
    BigInt(0)
  );

  return {
    totalGross: totals?.totalGross || "0",
    totalFees: totals?.totalFees || "0",
    totalNet: totals?.totalNet || "0",
    pendingSettlement: pendingTotal.toString(),
    paymentsCount: totals?.count || 0,
  };
}

/**
 * Calculate platform fee
 */
export function calculatePlatformFee(amount: bigint): bigint {
  return (amount * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
}

/**
 * Calculate net amount after platform fee
 */
export function calculateNetAmount(amount: bigint): bigint {
  const fee = calculatePlatformFee(amount);
  return amount - fee;
}
