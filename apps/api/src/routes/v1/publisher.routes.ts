import { Router, Request, Response } from "express";
import { eq, and, desc, sql, gte, inArray, ne } from "drizzle-orm";
import { authMiddleware, requireType, AuthRequest } from "../../middleware/auth.middleware.js";
import { createRateLimitMiddleware } from "../../middleware/rateLimit.middleware.js";
import { db } from "../../db/index.js";
import {
  publishers,
  apis,
  endpoints,
  usageRecords,
  payments,
  withdrawals,
  githubRepos,
} from "@opengrant/database";
import {
  getAuthenticatedUser,
  listUserRepos,
  getRepoByOwnerName,
  verifyRepoOwnership,
} from "../../services/github.service.js";

// GitHub PAT format validation (ghp_, github_pat_, gho_ prefixes)
const GITHUB_PAT_REGEX = /^(ghp_[a-zA-Z0-9]{36,255}|github_pat_[a-zA-Z0-9_]{22,255}|gho_[a-zA-Z0-9]{36,255})$/;

function validateGithubToken(token: string): boolean {
  return GITHUB_PAT_REGEX.test(token) && token.length <= 300;
}

// Slug format: lowercase alphanumeric with hyphens, 2-100 chars
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/;

// Rate limiters for GitHub-related endpoints
const githubVerifyRateLimit = createRateLimitMiddleware({
  limit: 5,
  windowSeconds: 60,
  keyPrefix: "rl:gh-verify:",
});

const githubReposRateLimit = createRateLimitMiddleware({
  limit: 20,
  windowSeconds: 60,
  keyPrefix: "rl:gh-repos:",
});

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
      githubId: publisher.githubId,
      githubVerified: publisher.githubVerified,
      githubVerifiedAt: publisher.githubVerifiedAt,
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
    // Block manual githubUsername change if GitHub is verified
    if (githubUsername !== undefined) {
      const current = await db.query.publishers.findFirst({
        where: eq(publishers.walletAddress, req.user!.wallet),
      });
      if (current?.githubVerified && githubUsername !== current.githubUsername) {
        return res.status(400).json({
          error: "Cannot manually change GitHub username when GitHub is verified. Re-verify with a different account instead.",
        });
      }
    }

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
 * Verify publisher's GitHub identity
 * POST /v1/publisher/verify-github
 */
router.post("/verify-github", githubVerifyRateLimit, async (req: AuthRequest, res: Response) => {
  const githubToken = req.headers["x-github-token"] as string;

  if (!githubToken) {
    return res.status(400).json({ error: "X-GitHub-Token header is required" });
  }

  if (!validateGithubToken(githubToken)) {
    return res.status(400).json({ error: "Invalid GitHub token format" });
  }

  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    // Get GitHub user info
    const ghUser = await getAuthenticatedUser(githubToken);
    if (!ghUser) {
      return res.status(401).json({ error: "Invalid GitHub token" });
    }

    // If already verified with same githubId, return idempotent response
    if (publisher.githubVerified && publisher.githubId === ghUser.id) {
      return res.json({
        githubId: publisher.githubId,
        githubUsername: publisher.githubUsername,
        githubVerified: true,
        githubVerifiedAt: publisher.githubVerifiedAt,
      });
    }

    // Check if another publisher already claimed this GitHub ID
    const existing = await db.query.publishers.findFirst({
      where: and(
        eq(publishers.githubId, ghUser.id),
        ne(publishers.id, publisher.id)
      ),
    });

    if (existing) {
      return res.status(409).json({
        error: "This GitHub account is already linked to another publisher",
      });
    }

    // If re-verifying with a DIFFERENT GitHub account, unlink stale repo associations
    const oldGithubId = publisher.githubId;
    if (oldGithubId && oldGithubId !== ghUser.id) {
      // Nullify githubRepoId on APIs that were linked to repos owned by the old GitHub identity
      await db
        .update(apis)
        .set({ githubRepoId: null, updatedAt: new Date() })
        .where(eq(apis.publisherId, publisher.id));
    }

    // Atomic update - the unique index on githubId protects against TOCTOU race
    const [updated] = await db
      .update(publishers)
      .set({
        githubId: ghUser.id,
        githubUsername: ghUser.login,
        githubVerified: true,
        githubVerifiedAt: new Date(),
        avatarUrl: publisher.avatarUrl || ghUser.avatar_url,
        updatedAt: new Date(),
      })
      .where(eq(publishers.id, publisher.id))
      .returning();

    res.json({
      githubId: updated.githubId,
      githubUsername: updated.githubUsername,
      githubVerified: updated.githubVerified,
      githubVerifiedAt: updated.githubVerifiedAt,
    });
  } catch (error: any) {
    // Catch unique constraint violation on githubId (TOCTOU race protection)
    if (error?.code === "23505" && error?.constraint?.includes("github_id")) {
      return res.status(409).json({
        error: "This GitHub account is already linked to another publisher",
      });
    }
    console.error("Verify GitHub error:", error);
    res.status(500).json({ error: "Failed to verify GitHub" });
  }
});

/**
 * List publisher's GitHub repos (admin access only)
 * GET /v1/publisher/github-repos
 */
router.get("/github-repos", githubReposRateLimit, async (req: AuthRequest, res: Response) => {
  const githubToken = req.headers["x-github-token"] as string;

  if (!githubToken) {
    return res.status(400).json({ error: "X-GitHub-Token header is required" });
  }

  if (!validateGithubToken(githubToken)) {
    return res.status(400).json({ error: "Invalid GitHub token format" });
  }

  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    if (!publisher.githubVerified) {
      return res.status(403).json({ error: "GitHub verification required. Use POST /v1/publisher/verify-github first." });
    }

    const page = Math.min(Math.max(parseInt(req.query.page as string) || 1, 1), 100);
    const repos = await listUserRepos(githubToken, page);

    res.json(repos);
  } catch (error) {
    console.error("List GitHub repos error:", error);
    res.status(500).json({ error: "Failed to list GitHub repos" });
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
  const { name, slug, description, baseUrl, category, tags, documentationUrl, logoUrl, endpoints: endpointList, githubRepo } = req.body;

  if (!name || !slug || !baseUrl) {
    return res.status(400).json({ error: "Name, slug, and baseUrl are required" });
  }

  // Validate slug format
  if (!SLUG_REGEX.test(slug)) {
    return res.status(400).json({ error: "Invalid slug format. Use lowercase alphanumeric characters and hyphens (2-100 chars)." });
  }

  // Validate endpoint prices upfront (before any DB writes)
  if (endpointList && endpointList.length > 0) {
    if (endpointList.some((ep: any) => ep.pricePerCall !== undefined && ep.pricePerCall < 0)) {
      return res.status(400).json({ error: "Price per call cannot be negative" });
    }
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

    // Handle GitHub repo linking
    let githubRepoId: string | undefined;
    if (githubRepo) {
      if (!publisher.githubVerified) {
        return res.status(403).json({ error: "GitHub verification required to link a repo" });
      }

      const githubToken = req.headers["x-github-token"] as string;
      if (!githubToken) {
        return res.status(400).json({ error: "X-GitHub-Token header is required to link a GitHub repo" });
      }

      if (!validateGithubToken(githubToken)) {
        return res.status(400).json({ error: "Invalid GitHub token format" });
      }

      // Validate format: owner/name
      if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(githubRepo)) {
        return res.status(400).json({ error: "Invalid githubRepo format. Expected: owner/name" });
      }

      // Verify PAT belongs to the publisher's verified GitHub identity
      const ghUser = await getAuthenticatedUser(githubToken);
      if (!ghUser || ghUser.id !== publisher.githubId) {
        return res.status(403).json({ error: "GitHub token does not match verified identity" });
      }

      const [repoOwner, repoName] = githubRepo.split("/");
      const repo = await getRepoByOwnerName(repoOwner, repoName);
      if (!repo) {
        return res.status(404).json({ error: "GitHub repository not found" });
      }

      // Verify admin access
      const isAdmin = await verifyRepoOwnership(githubToken, repo.githubId);
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required for this repository" });
      }

      githubRepoId = repo.id;
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
        githubRepoId: githubRepoId || null,
        status: "draft",
      })
      .returning();

    // Create endpoints
    if (endpointList && endpointList.length > 0) {
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
  const apiId = req.params.apiId as string;
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
  const apiId = req.params.apiId as string;

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

    // Get pending (unsettled) usage revenue
    const publisherApis = await db.query.apis.findMany({
      where: eq(apis.publisherId, publisher.id),
      columns: { id: true },
    });
    const apiIds = publisherApis.map((a) => a.id);
    let pendingBalance = "0";
    if (apiIds.length > 0) {
      const pending = await db
        .select({
          total: sql<string>`COALESCE(SUM(${usageRecords.priceCharged}), 0)::text`,
        })
        .from(usageRecords)
        .where(
          and(
            inArray(usageRecords.apiId, apiIds),
            eq(usageRecords.paymentStatus, "verified")
          )
        );
      pendingBalance = pending[0]?.total || "0";
    }

    // Get recent payments (last 10)
    const recentPaymentRecords = await db.query.payments.findMany({
      where: eq(payments.publisherId, publisher.id),
      orderBy: desc(payments.settledAt),
      limit: 10,
    });
    const recentPayments = await Promise.all(
      recentPaymentRecords.map(async (p) => {
        const api = await db.query.apis.findFirst({
          where: eq(apis.id, p.apiId),
          columns: { name: true },
        });
        return {
          api: api?.name || "Unknown",
          amount: p.grossAmount,
          from: p.apiId,
          time: p.settledAt?.toISOString() || p.periodEnd?.toISOString() || "",
        };
      })
    );

    // Get recent withdrawals (last 10)
    const recentWithdrawals = await db.query.withdrawals.findMany({
      where: eq(withdrawals.publisherId, publisher.id),
      orderBy: desc(withdrawals.createdAt),
      limit: 10,
    });

    res.json({
      grossEarnings: grossEarnings.toString(),
      platformFees: platformFees.toString(),
      netEarnings: netEarnings.toString(),
      totalWithdrawn: totalWithdrawn.toString(),
      availableBalance: availableBalance.toString(),
      pendingBalance,
      lifetimeEarnings: grossEarnings.toString(),
      platformFeesPaid: platformFees.toString(),
      recentPayments,
      withdrawals: recentWithdrawals.map((w) => ({
        id: w.id,
        amount: w.amount,
        txHash: w.txHash || "",
        status: w.status,
        timestamp: w.createdAt.toISOString(),
      })),
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
  const apiId = req.params.apiId as string;
  const endpointId = req.params.endpointId as string;
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

/**
 * Trigger settlement for publisher's APIs
 * POST /v1/publisher/settle
 */
router.post("/settle", async (req: AuthRequest, res: Response) => {
  try {
    const publisher = await db.query.publishers.findFirst({
      where: eq(publishers.walletAddress, req.user!.wallet),
    });

    if (!publisher) {
      return res.status(404).json({ error: "Publisher not found" });
    }

    const { settlePublisherPayments } = await import(
      "../../services/settlement.service.js"
    );

    const results = await settlePublisherPayments(publisher.id, {
      executeOnChain: false,
    });

    const successful = results.filter((r: any) => r.success);
    const failed = results.filter((r: any) => !r.success);

    res.json({
      processed: results.length,
      successful: successful.length,
      failed: failed.length,
      results,
    });
  } catch (error) {
    console.error("Settlement error:", error);
    res.status(500).json({ error: "Failed to run settlement" });
  }
});

export default router;
