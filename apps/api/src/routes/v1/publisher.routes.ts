import { Router, Request, Response } from "express";
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";
import { authMiddleware, requireType, AuthRequest } from "../../middleware/auth.middleware.js";
import { db } from "../../db/index.js";
import {
  publishers,
  apis,
  endpoints,
  usageRecords,
  payments,
  withdrawals,
} from "@opengrant/database";

const router = Router();

// All routes require authentication and publisher type
router.use(authMiddleware);
router.use(requireType("publisher"));

/**
 * Get or create publisher profile
 * GET /v1/publisher/profile
 */
router.get("/profile", async (req: AuthRequest, res: Response) => {
  try {
    let publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      // Create publisher if doesn't exist
      const [newPublisher] = await db
        .insert(publishers)
        .values({
          name: `Publisher ${req.user!.wallet.slice(0, 8)}`,
          walletAddress: req.user!.wallet,
          status: "pending",
        })
        .returning();
      publisher = newPublisher;
    }

    res.json({
      id: publisher.id,
      name: publisher.name,
      email: publisher.email,
      bio: publisher.bio,
      websiteUrl: publisher.websiteUrl,
      githubUsername: publisher.githubUsername,
      avatarUrl: publisher.avatarUrl,
      walletAddress: publisher.walletAddress,
      vaultAddress: publisher.vaultAddress,
      status: publisher.status,
      verifiedAt: publisher.verifiedAt,
      createdAt: publisher.createdAt,
    });
  } catch (error) {
    console.error("Get publisher profile error:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

/**
 * Update publisher profile
 * PUT /v1/publisher/profile
 */
router.put("/profile", async (req: AuthRequest, res: Response) => {
  const { name, email, bio, websiteUrl, githubUsername, avatarUrl } = req.body;

  try {
    const [updated] = await db
      .update(publishers)
      .set({
        name,
        email,
        bio,
        websiteUrl,
        githubUsername,
        avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(publishers.walletAddress, req.user!.wallet))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      bio: updated.bio,
      websiteUrl: updated.websiteUrl,
      githubUsername: updated.githubUsername,
      avatarUrl: updated.avatarUrl,
      walletAddress: updated.walletAddress,
      vaultAddress: updated.vaultAddress,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

/**
 * Get publisher's APIs
 * GET /v1/publisher/apis
 */
router.get("/apis", async (req: AuthRequest, res: Response) => {
  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    const apiList = await db.query.apis.findMany({
      where: eq(apis.publisherId, publisher.id),
      with: {
        endpoints: true,
      },
      orderBy: desc(apis.createdAt),
    });

    res.json(apiList);
  } catch (error) {
    console.error("Get APIs error:", error);
    res.status(500).json({ error: "Failed to get APIs" });
  }
});

/**
 * Register new API
 * POST /v1/publisher/apis
 */
router.post("/apis", async (req: AuthRequest, res: Response) => {
  const { name, slug, description, baseUrl, category, tags, documentationUrl, logoUrl, endpoints: endpointList } = req.body;

  if (!name || !slug || !baseUrl) {
    return res.status(400).json({ error: "Name, slug, and baseUrl are required" });
  }

  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    // Check slug uniqueness within publisher's APIs
    const existing = await db.query.apis.findFirst({
      where: and(
        eq(apis.publisherId, publisher.id),
        eq(apis.slug, slug)
      ),
    });

    if (existing) {
      return res.status(409).json({ error: "Slug already exists for this publisher" });
    }

    // Create API
    const [api] = await db
      .insert(apis)
      .values({
        publisherId: publisher.id,
        name,
        slug,
        description,
        baseUrl,
        category,
        tags,
        documentationUrl,
        logoUrl,
        status: "draft",
      })
      .returning();

    // Create endpoints
    if (endpointList && endpointList.length > 0) {
      // Validate no negative prices
      if (endpointList.some((ep: any) => ep.pricePerCall !== undefined && ep.pricePerCall < 0)) {
        return res.status(400).json({ error: "Price per call cannot be negative" });
      }

      await db.insert(endpoints).values(
        endpointList.map((ep: any) => ({
          apiId: api.id,
          path: ep.path,
          method: ep.method || "GET",
          description: ep.description,
          pricePerCall: ep.pricePerCall || 0,
          rateLimitPerMinute: ep.rateLimitPerMinute || 60,
          rateLimitPerHour: ep.rateLimitPerHour || 1000,
          rateLimitPerDay: ep.rateLimitPerDay || 10000,
          requestSchema: ep.requestSchema,
          responseSchema: ep.responseSchema,
          isActive: true,
          requiresAuth: ep.requiresAuth ?? true,
        }))
      );
    }

    // Fetch the created API with endpoints
    const createdApi = await db.query.apis.findFirst({
      where: eq(apis.id, api.id),
      with: {
        endpoints: true,
      },
    });

    res.status(201).json(createdApi);
  } catch (error) {
    console.error("Create API error:", error);
    res.status(500).json({ error: "Failed to create API" });
  }
});

/**
 * Update API
 * PUT /v1/publisher/apis/:apiId
 */
router.put("/apis/:apiId", async (req: AuthRequest, res: Response) => {
  const { apiId } = req.params;
  const { name, description, baseUrl, status, category, tags, documentationUrl, logoUrl } = req.body;

  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (status !== undefined) updateData.status = status;
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = tags;
    if (documentationUrl !== undefined) updateData.documentationUrl = documentationUrl;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;

    const [updated] = await db
      .update(apis)
      .set(updateData)
      .where(
        and(
          eq(apis.id, apiId),
          eq(apis.publisherId, publisher.id)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "API not found" });
    }

    // Fetch with endpoints
    const updatedApi = await db.query.apis.findFirst({
      where: eq(apis.id, apiId),
      with: {
        endpoints: true,
      },
    });

    res.json(updatedApi);
  } catch (error) {
    console.error("Update API error:", error);
    res.status(500).json({ error: "Failed to update API" });
  }
});

/**
 * Publish API (change status to active)
 * POST /v1/publisher/apis/:apiId/publish
 */
router.post("/apis/:apiId/publish", async (req: AuthRequest, res: Response) => {
  const { apiId } = req.params;

  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    const [updated] = await db
      .update(apis)
      .set({
        status: "active",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(apis.id, apiId),
          eq(apis.publisherId, publisher.id)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "API not found" });
    }

    res.json({ success: true, status: updated.status, publishedAt: updated.publishedAt });
  } catch (error) {
    console.error("Publish API error:", error);
    res.status(500).json({ error: "Failed to publish API" });
  }
});

/**
 * Get publisher earnings
 * GET /v1/publisher/earnings
 */
router.get("/earnings", async (req: AuthRequest, res: Response) => {
  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    // Get total payments received
    const totals = await db
      .select({
        grossTotal: sql<string>`COALESCE(SUM(${payments.grossAmount}), 0)::text`,
        feeTotal: sql<string>`COALESCE(SUM(${payments.platformFee}), 0)::text`,
        netTotal: sql<string>`COALESCE(SUM(${payments.netAmount}), 0)::text`,
      })
      .from(payments)
      .where(eq(payments.publisherId, publisher.id));

    // Get total withdrawals
    const withdrawn = await db
      .select({
        total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)::text`,
      })
      .from(withdrawals)
      .where(
        and(
          eq(withdrawals.publisherId, publisher.id),
          eq(withdrawals.status, "completed")
        )
      );

    const grossEarnings = BigInt(totals[0]?.grossTotal || "0");
    const platformFees = BigInt(totals[0]?.feeTotal || "0");
    const netEarnings = BigInt(totals[0]?.netTotal || "0");
    const totalWithdrawn = BigInt(withdrawn[0]?.total || "0");
    const availableBalance = netEarnings - totalWithdrawn;

    res.json({
      grossEarnings: grossEarnings.toString(),
      platformFees: platformFees.toString(),
      netEarnings: netEarnings.toString(),
      totalWithdrawn: totalWithdrawn.toString(),
      availableBalance: availableBalance.toString(),
    });
  } catch (error) {
    console.error("Get earnings error:", error);
    res.status(500).json({ error: "Failed to get earnings" });
  }
});

/**
 * Get publisher analytics
 * GET /v1/publisher/analytics
 */
router.get("/analytics", async (req: AuthRequest, res: Response) => {
  const { period = "30d" } = req.query;

  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    const apiList = await db.query.apis.findMany({
      where: eq(apis.publisherId, publisher.id),
      columns: { id: true, name: true, slug: true },
    });

    const apiIds = apiList.map((a) => a.id);

    if (apiIds.length === 0) {
      return res.json({
        totalCalls: 0,
        totalRevenue: "0",
        avgResponseTime: 0,
        byApi: [],
        daily: [],
      });
    }

    // Get totals from usage records
    const totals = await db
      .select({
        totalCalls: sql<number>`COUNT(*)::int`,
        totalRevenue: sql<string>`COALESCE(SUM(${usageRecords.priceCharged}), 0)::text`,
        avgResponseTime: sql<number>`COALESCE(AVG(${usageRecords.responseTimeMs}), 0)::int`,
      })
      .from(usageRecords)
      .where(
        and(
          inArray(usageRecords.apiId, apiIds),
          gte(usageRecords.requestTimestamp, startDate)
        )
      );

    // Get by API
    const byApi = await db
      .select({
        apiId: usageRecords.apiId,
        calls: sql<number>`COUNT(*)::int`,
        revenue: sql<string>`COALESCE(SUM(${usageRecords.priceCharged}), 0)::text`,
        avgResponseTime: sql<number>`COALESCE(AVG(${usageRecords.responseTimeMs}), 0)::int`,
      })
      .from(usageRecords)
      .where(
        and(
          inArray(usageRecords.apiId, apiIds),
          gte(usageRecords.requestTimestamp, startDate)
        )
      )
      .groupBy(usageRecords.apiId);

    // Get daily stats
    const daily = await db
      .select({
        date: sql<string>`DATE(${usageRecords.requestTimestamp})::text`,
        calls: sql<number>`COUNT(*)::int`,
        revenue: sql<string>`COALESCE(SUM(${usageRecords.priceCharged}), 0)::text`,
      })
      .from(usageRecords)
      .where(
        and(
          inArray(usageRecords.apiId, apiIds),
          gte(usageRecords.requestTimestamp, startDate)
        )
      )
      .groupBy(sql`DATE(${usageRecords.requestTimestamp})`)
      .orderBy(sql`DATE(${usageRecords.requestTimestamp})`);

    res.json({
      totalCalls: totals[0]?.totalCalls || 0,
      totalRevenue: totals[0]?.totalRevenue || "0",
      avgResponseTime: totals[0]?.avgResponseTime || 0,
      byApi: byApi.map((item) => ({
        ...item,
        apiName: apiList.find((a) => a.id === item.apiId)?.name || "Unknown",
        apiSlug: apiList.find((a) => a.id === item.apiId)?.slug || "unknown",
      })),
      daily,
      period: {
        start: startDate.toISOString(),
        end: new Date().toISOString(),
        days,
      },
    });
  } catch (error) {
    console.error("Get analytics error:", error);
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

/**
 * Request withdrawal
 * POST /v1/publisher/withdraw
 */
router.post("/withdraw", async (req: AuthRequest, res: Response) => {
  const { amount, destinationAddress, destinationChain = "base" } = req.body;

  if (!amount || BigInt(amount) <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  if (!destinationAddress) {
    return res.status(400).json({ error: "Destination address is required" });
  }

  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    // Create withdrawal request
    const [withdrawal] = await db
      .insert(withdrawals)
      .values({
        publisherId: publisher.id,
        amount,
        destinationAddress,
        destinationChain,
        status: "pending",
      })
      .returning();

    // In production, this would trigger the CRE withdrawal workflow

    res.status(201).json({
      id: withdrawal.id,
      amount: withdrawal.amount,
      destinationAddress: withdrawal.destinationAddress,
      destinationChain: withdrawal.destinationChain,
      status: withdrawal.status,
      createdAt: withdrawal.createdAt,
    });
  } catch (error) {
    console.error("Withdraw error:", error);
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

/**
 * Get withdrawal history
 * GET /v1/publisher/withdrawals
 */
router.get("/withdrawals", async (req: AuthRequest, res: Response) => {
  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    const withdrawalList = await db.query.withdrawals.findMany({
      where: eq(withdrawals.publisherId, publisher.id),
      orderBy: desc(withdrawals.createdAt),
    });

    res.json(withdrawalList);
  } catch (error) {
    console.error("Get withdrawals error:", error);
    res.status(500).json({ error: "Failed to get withdrawals" });
  }
});

/**
 * Manage endpoint
 * PUT /v1/publisher/apis/:apiId/endpoints/:endpointId
 */
router.put("/apis/:apiId/endpoints/:endpointId", async (req: AuthRequest, res: Response) => {
  const { apiId, endpointId } = req.params;
  const { pricePerCall, rateLimitPerMinute, rateLimitPerHour, rateLimitPerDay, isActive, description } = req.body;

  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    // Verify API belongs to publisher
    const api = await db.query.apis.findFirst({
      where: and(
        eq(apis.id, apiId),
        eq(apis.publisherId, publisher.id)
      ),
    });

    if (!api) {
      return res.status(404).json({ error: "API not found" });
    }

    if (pricePerCall !== undefined && pricePerCall < 0) {
      return res.status(400).json({ error: "Price per call cannot be negative" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (pricePerCall !== undefined) updateData.pricePerCall = pricePerCall;
    if (rateLimitPerMinute !== undefined) updateData.rateLimitPerMinute = rateLimitPerMinute;
    if (rateLimitPerHour !== undefined) updateData.rateLimitPerHour = rateLimitPerHour;
    if (rateLimitPerDay !== undefined) updateData.rateLimitPerDay = rateLimitPerDay;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (description !== undefined) updateData.description = description;

    const [updated] = await db
      .update(endpoints)
      .set(updateData)
      .where(
        and(
          eq(endpoints.id, endpointId),
          eq(endpoints.apiId, apiId)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Endpoint not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Update endpoint error:", error);
    res.status(500).json({ error: "Failed to update endpoint" });
  }
});

export default router;
