import { Router, Request, Response } from "express";
import { randomBytes, createHash } from "crypto";
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";
import { authMiddleware, requireType, AuthRequest } from "../../middleware/auth.middleware.js";
import { db } from "../../db/index.js";
import {
  consumers,
  apiKeys,
  apis,
  usageRecords,
} from "@opengrant/database";
import { getUSDCBalance, getETHBalance, getTransactionReceipt } from "../../services/blockchain.service.js";
import { config } from "../../config/index.js";

const router = Router();

// All routes require authentication and consumer type
router.use(authMiddleware);
router.use(requireType("consumer"));

/**
 * Get consumer profile
 * GET /v1/consumer/profile
 */
router.get("/profile", async (req: AuthRequest, res: Response) => {
  try {
    const consumer = await db.query.consumers.findFirst({
      where: eq(consumers.id, req.user!.sub),
    });

    if (!consumer) {
      return res.status(404).json({ error: "Consumer not found" });
    }

    res.json({
      id: consumer.id,
      walletAddress: consumer.walletAddress,
      name: consumer.name,
      email: consumer.email,
      creditBalance: consumer.creditBalance,
      settings: consumer.settings,
      createdAt: consumer.createdAt,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

/**
 * Update consumer profile
 * PUT /v1/consumer/profile
 */
router.put("/profile", async (req: AuthRequest, res: Response) => {
  const { name, email, settings } = req.body;

  try {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (settings !== undefined) updateData.settings = settings;

    const [updated] = await db
      .update(consumers)
      .set(updateData)
      .where(eq(consumers.id, req.user!.sub))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Consumer not found" });
    }

    res.json({
      id: updated.id,
      walletAddress: updated.walletAddress,
      name: updated.name,
      email: updated.email,
      creditBalance: updated.creditBalance,
      settings: updated.settings,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

/**
 * Get usage statistics
 * GET /v1/consumer/stats
 */
router.get("/stats", async (req: AuthRequest, res: Response) => {
  const { period = "30d", apiId: rawApiId, apiSlug } = req.query;

  // Resolve apiSlug to apiId if provided
  let apiId = rawApiId as string | undefined;
  if (!apiId && apiSlug) {
    const apiRecord = await db.query.apis.findFirst({
      where: eq(apis.slug, apiSlug as string),
      columns: { id: true },
    });
    if (!apiRecord) {
      return res.status(404).json({ error: `API with slug "${apiSlug}" not found` });
    }
    apiId = apiRecord.id;
  }

  // Calculate date range
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // Build where conditions
    const conditions = [
      eq(usageRecords.consumerId, req.user!.sub),
      gte(usageRecords.requestTimestamp, startDate),
    ];

    if (apiId) {
      conditions.push(eq(usageRecords.apiId, apiId as string));
    }

    // Get total calls and spent
    const totals = await db
      .select({
        totalCalls: sql<number>`COUNT(*)::int`,
        totalSpent: sql<string>`COALESCE(SUM(${usageRecords.priceCharged}), 0)::text`,
        avgResponseTime: sql<number>`COALESCE(AVG(${usageRecords.responseTimeMs}), 0)::int`,
      })
      .from(usageRecords)
      .where(and(...conditions));

    // Get usage by API
    const byApi = await db
      .select({
        apiId: usageRecords.apiId,
        calls: sql<number>`COUNT(*)::int`,
        spent: sql<string>`COALESCE(SUM(${usageRecords.priceCharged}), 0)::text`,
        avgResponseTime: sql<number>`COALESCE(AVG(${usageRecords.responseTimeMs}), 0)::int`,
      })
      .from(usageRecords)
      .where(and(...conditions))
      .groupBy(usageRecords.apiId);

    // Get daily usage
    const daily = await db
      .select({
        date: sql<string>`DATE(${usageRecords.requestTimestamp})::text`,
        calls: sql<number>`COUNT(*)::int`,
        spent: sql<string>`COALESCE(SUM(${usageRecords.priceCharged}), 0)::text`,
      })
      .from(usageRecords)
      .where(and(...conditions))
      .groupBy(sql`DATE(${usageRecords.requestTimestamp})`)
      .orderBy(sql`DATE(${usageRecords.requestTimestamp})`);

    res.json({
      totalCalls: totals[0]?.totalCalls || 0,
      totalSpent: totals[0]?.totalSpent || "0",
      avgResponseTime: totals[0]?.avgResponseTime || 0,
      apiBreakdown: byApi,
      dailyUsage: daily,
      period: {
        start: startDate.toISOString(),
        end: new Date().toISOString(),
        days,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Failed to get statistics" });
  }
});

/**
 * Get recent usage records
 * GET /v1/consumer/usage
 */
router.get("/usage", async (req: AuthRequest, res: Response) => {
  const { limit: rawLimit = "50", offset: rawOffset = "0", apiId } = req.query;

  const parsedLimit = Math.min(Math.max(parseInt(rawLimit as string) || 50, 1), 1000);
  const parsedOffset = Math.max(parseInt(rawOffset as string) || 0, 0);

  try {
    const conditions = [eq(usageRecords.consumerId, req.user!.sub)];
    if (apiId) {
      conditions.push(eq(usageRecords.apiId, apiId as string));
    }

    const records = await db
      .select()
      .from(usageRecords)
      .where(and(...conditions))
      .orderBy(desc(usageRecords.requestTimestamp))
      .limit(parsedLimit)
      .offset(parsedOffset);

    res.json(records);
  } catch (error) {
    console.error("Get usage error:", error);
    res.status(500).json({ error: "Failed to get usage records" });
  }
});

/**
 * Create API key
 * POST /v1/consumer/keys
 */
router.post("/keys", async (req: AuthRequest, res: Response) => {
  const { name, allowedApis, expiresAt } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    // Generate API key
    const keyValue = `og_live_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(keyValue).digest("hex");

    const [key] = await db
      .insert(apiKeys)
      .values({
        consumerId: req.user!.sub,
        name,
        keyHash,
        keyPrefix: keyValue.slice(0, 12),
        allowedApis: allowedApis || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();

    res.status(201).json({
      id: key.id,
      name: key.name,
      key: keyValue, // Only returned on creation
      prefix: key.keyPrefix,
      allowedApis: key.allowedApis,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
    });
  } catch (error) {
    console.error("Create key error:", error);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

/**
 * List API keys
 * GET /v1/consumer/keys
 */
router.get("/keys", async (req: AuthRequest, res: Response) => {
  try {
    const keys = await db.query.apiKeys.findMany({
      where: eq(apiKeys.consumerId, req.user!.sub),
      orderBy: desc(apiKeys.createdAt),
    });

    res.json(
      keys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.keyPrefix,
        allowedApis: key.allowedApis,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        isActive: key.isActive,
      }))
    );
  } catch (error) {
    console.error("List keys error:", error);
    res.status(500).json({ error: "Failed to list API keys" });
  }
});

/**
 * Update API key
 * PUT /v1/consumer/keys/:keyId
 */
router.put("/keys/:keyId", async (req: AuthRequest, res: Response) => {
  const keyId = req.params.keyId as string;
  const { name, allowedApis, isActive } = req.body;

  try {
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (allowedApis !== undefined) updateData.allowedApis = allowedApis;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(apiKeys)
      .set(updateData)
      .where(
        and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.consumerId, req.user!.sub)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "API key not found" });
    }

    res.json({
      id: updated.id,
      name: updated.name,
      prefix: updated.keyPrefix,
      allowedApis: updated.allowedApis,
      isActive: updated.isActive,
    });
  } catch (error) {
    console.error("Update key error:", error);
    res.status(500).json({ error: "Failed to update API key" });
  }
});

/**
 * Revoke API key
 * DELETE /v1/consumer/keys/:keyId
 */
router.delete("/keys/:keyId", async (req: AuthRequest, res: Response) => {
  const keyId = req.params.keyId as string;

  try {
    const [updated] = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(
        and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.consumerId, req.user!.sub)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "API key not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Revoke key error:", error);
    res.status(500).json({ error: "Failed to revoke API key" });
  }
});

/**
 * Get payment history
 * GET /v1/consumer/payments
 */
router.get("/payments", async (req: AuthRequest, res: Response) => {
  const { limit: rawLimit = "50", offset: rawOffset = "0", apiId } = req.query;

  const parsedLimit = Math.min(Math.max(parseInt(rawLimit as string) || 50, 1), 1000);
  const parsedOffset = Math.max(parseInt(rawOffset as string) || 0, 0);

  try {
    const conditions = [
      eq(usageRecords.consumerId, req.user!.sub),
      sql`${usageRecords.paymentTxHash} IS NOT NULL`,
    ];

    if (apiId) {
      conditions.push(eq(usageRecords.apiId, apiId as string));
    }

    const records = await db
      .select({
        id: usageRecords.id,
        apiId: usageRecords.apiId,
        endpointId: usageRecords.endpointId,
        requestId: usageRecords.requestId,
        priceCharged: usageRecords.priceCharged,
        paymentTxHash: usageRecords.paymentTxHash,
        paymentStatus: usageRecords.paymentStatus,
        requestTimestamp: usageRecords.requestTimestamp,
        settledAt: usageRecords.settledAt,
      })
      .from(usageRecords)
      .where(and(...conditions))
      .orderBy(desc(usageRecords.requestTimestamp))
      .limit(parsedLimit)
      .offset(parsedOffset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(usageRecords)
      .where(and(...conditions));

    res.json({
      data: records,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: count,
      },
    });
  } catch (error) {
    console.error("Get payments error:", error);
    res.status(500).json({ error: "Failed to get payment history" });
  }
});

/**
 * Get wallet balance (placeholder - actual balance from blockchain)
 * GET /v1/consumer/balance
 */
router.get("/balance", async (req: AuthRequest, res: Response) => {
  try {
    const consumer = await db.query.consumers.findFirst({
      where: eq(consumers.id, req.user!.sub),
    });

    if (!consumer) {
      return res.status(404).json({ error: "Consumer not found" });
    }

    // Query blockchain for actual balances
    let usdc = "0";
    let eth = "0";
    try {
      const [usdcBalance, ethBalance] = await Promise.all([
        getUSDCBalance(consumer.walletAddress as `0x${string}`),
        getETHBalance(consumer.walletAddress as `0x${string}`),
      ]);
      usdc = usdcBalance.formatted;
      eth = ethBalance.formatted;
    } catch {
      // Blockchain unavailable - return zeros rather than failing the endpoint
    }

    res.json({
      walletAddress: consumer.walletAddress,
      creditBalance: consumer.creditBalance,
      usdc,
      eth,
    });
  } catch (error) {
    console.error("Get balance error:", error);
    res.status(500).json({ error: "Failed to get balance" });
  }
});

/**
 * Add credit balance (for prepaid credits)
 * POST /v1/consumer/credits/add
 */
router.post("/credits/add", async (req: AuthRequest, res: Response) => {
  const { amount, txHash } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  if (!txHash || typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return res.status(400).json({ error: "Valid transaction hash is required" });
  }

  try {
    // Check txHash uniqueness to prevent replay attacks
    const existingUsage = await db
      .select({ id: usageRecords.id })
      .from(usageRecords)
      .where(eq(usageRecords.paymentTxHash, txHash))
      .limit(1);

    if (existingUsage.length > 0) {
      return res.status(409).json({ error: "Transaction hash already used" });
    }

    // Verify the transaction on-chain
    const receipt = await getTransactionReceipt(txHash as `0x${string}`);

    if (!receipt) {
      return res.status(400).json({ error: "Transaction not found on-chain" });
    }

    if (receipt.status !== "success") {
      return res.status(400).json({ error: "Transaction failed on-chain" });
    }

    // Verify recipient matches platform wallet
    if (receipt.to?.toLowerCase() !== config.x402.platformWallet.toLowerCase()) {
      return res.status(400).json({ error: "Transaction recipient does not match platform wallet" });
    }

    // Use atomic SQL to prevent race conditions
    const [updated] = await db
      .update(consumers)
      .set({
        creditBalance: sql`(COALESCE(${consumers.creditBalance}, '0')::numeric + ${parseFloat(amount)}::numeric)::text`,
        updatedAt: new Date(),
      })
      .where(eq(consumers.id, req.user!.sub))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Consumer not found" });
    }

    const previousBalance = (parseFloat(updated.creditBalance || "0") - parseFloat(amount)).toFixed(6);

    res.json({
      previousBalance,
      added: amount,
      newBalance: updated.creditBalance,
      txHash,
    });
  } catch (error) {
    console.error("Add credits error:", error);
    res.status(500).json({ error: "Failed to add credits" });
  }
});

export default router;
