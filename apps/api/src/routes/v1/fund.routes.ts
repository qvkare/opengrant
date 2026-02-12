import { Router, Request, Response } from "express";
import { createHash, randomUUID } from "crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../middleware/auth.middleware.js";
import { db } from "../../db/index.js";
import {
  githubRepos,
  fundDonations,
  dependencyAnalyses,
} from "@opengrant/database";
import { getTransactionReceipt } from "../../services/blockchain.service.js";
import {
  getRepoByOwnerName,
  searchRepos,
  computeRepoHash,
  verifyRepoOwnership,
} from "../../services/github.service.js";
import {
  analyzePackageJson,
  analyzeCargoToml,
  analyzeGoMod,
  scoreDependencies,
  computeDistribution,
} from "../../services/dependency.service.js";
import { signClaimAuthorization } from "../../services/escrow.service.js";
import { config } from "../../config/index.js";

const router = Router();

// ============================================
// PUBLIC ROUTES
// ============================================

/**
 * List funded repos
 * GET /v1/fund/repos
 */
router.get("/repos", async (req: Request, res: Response) => {
  try {
    const {
      language,
      sort = "stars",
      q,
      limit: rawLimit = "20",
      offset: rawOffset = "0",
    } = req.query;

    const result = await searchRepos({
      language: language as string | undefined,
      sort: sort as "stars" | "funded" | "donors",
      q: q as string | undefined,
      limit: Math.min(Math.max(parseInt(rawLimit as string) || 20, 1), 100),
      offset: Math.max(parseInt(rawOffset as string) || 0, 0),
    });

    res.json(result);
  } catch (error) {
    console.error("List repos error:", error);
    res.status(500).json({ error: "Failed to list repos" });
  }
});

/**
 * Get repo detail
 * GET /v1/fund/repos/:owner/:name
 */
router.get("/repos/:owner/:name", async (req: Request, res: Response) => {
  try {
    const { owner, name } = req.params;
    const repo = await getRepoByOwnerName(owner, name);

    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    // Try to get on-chain balance
    let onChainBalance = null;
    try {
      const { getEscrowRepoInfo } = await import("../../services/escrow.service.js");
      const info = await getEscrowRepoInfo(repo.repoHash as `0x${string}`);
      onChainBalance = {
        balance: info.totalBalance.toString(),
        totalDonated: info.totalDonated.toString(),
        totalClaimed: info.totalClaimed.toString(),
        claimedWallet: info.claimedWallet,
        donorCount: Number(info.donorCount),
      };
    } catch {
      // Escrow not configured or not deployed
    }

    res.json({
      ...repo,
      onChain: onChainBalance,
    });
  } catch (error) {
    console.error("Get repo error:", error);
    res.status(500).json({ error: "Failed to get repository" });
  }
});

/**
 * Get repo donors
 * GET /v1/fund/repos/:owner/:name/donors
 */
router.get("/repos/:owner/:name/donors", async (req: Request, res: Response) => {
  try {
    const { owner, name } = req.params;
    const { limit: rawLimit = "20", offset: rawOffset = "0" } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(rawLimit as string) || 20, 1), 100);
    const parsedOffset = Math.max(parseInt(rawOffset as string) || 0, 0);

    const repo = await db.query.githubRepos.findFirst({
      where: and(eq(githubRepos.owner, owner), eq(githubRepos.name, name)),
    });

    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    const donations = await db
      .select({
        donorWallet: fundDonations.donorWallet,
        amount: fundDonations.amount,
        txHash: fundDonations.txHash,
        chainId: fundDonations.chainId,
        createdAt: fundDonations.createdAt,
      })
      .from(fundDonations)
      .where(
        and(
          eq(fundDonations.repoId, repo.id),
          eq(fundDonations.status, "confirmed")
        )
      )
      .orderBy(desc(fundDonations.createdAt))
      .limit(parsedLimit)
      .offset(parsedOffset);

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(fundDonations)
      .where(
        and(
          eq(fundDonations.repoId, repo.id),
          eq(fundDonations.status, "confirmed")
        )
      );

    res.json({
      data: donations,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: count,
      },
    });
  } catch (error) {
    console.error("Get donors error:", error);
    res.status(500).json({ error: "Failed to get donors" });
  }
});

/**
 * Global funding stats
 * GET /v1/fund/stats
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const [stats] = await db
      .select({
        totalFunded: sql<string>`COALESCE(SUM(${githubRepos.totalFunded}), '0')`,
        totalClaimed: sql<string>`COALESCE(SUM(${githubRepos.totalClaimed}), '0')`,
        repoCount: sql<number>`COUNT(CASE WHEN ${githubRepos.totalFunded} > '0' THEN 1 END)::int`,
      })
      .from(githubRepos);

    const [donorStats] = await db
      .select({
        donorCount: sql<number>`COUNT(DISTINCT ${fundDonations.donorWallet})::int`,
        donationCount: sql<number>`COUNT(*)::int`,
      })
      .from(fundDonations)
      .where(eq(fundDonations.status, "confirmed"));

    res.json({
      totalFunded: stats?.totalFunded || "0",
      totalClaimed: stats?.totalClaimed || "0",
      repoCount: stats?.repoCount || 0,
      donorCount: donorStats?.donorCount || 0,
      donationCount: donorStats?.donationCount || 0,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// ============================================
// AUTHENTICATED ROUTES
// ============================================

/**
 * Record a donation
 * POST /v1/fund/donate
 */
router.post("/donate", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { repoId, txHash, chainId, amount, redistributeOnTimeout, source } = req.body;

  if (!repoId || !txHash || !chainId || !amount) {
    return res.status(400).json({ error: "Missing required fields: repoId, txHash, chainId, amount" });
  }

  if (typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return res.status(400).json({ error: "Invalid transaction hash" });
  }

  if (parseFloat(amount) < 1) {
    return res.status(400).json({ error: "Minimum donation is 1 USDC" });
  }

  try {
    // Check txHash uniqueness
    const existing = await db.query.fundDonations.findFirst({
      where: eq(fundDonations.txHash, txHash),
    });
    if (existing) {
      return res.status(409).json({ error: "Transaction hash already recorded" });
    }

    // Verify the repo exists
    const repo = await db.query.githubRepos.findFirst({
      where: eq(githubRepos.id, repoId),
    });
    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    // Verify on-chain transaction
    const receipt = await getTransactionReceipt(txHash as `0x${string}`);
    if (!receipt) {
      return res.status(400).json({ error: "Transaction not found on-chain" });
    }
    if (receipt.status !== "success") {
      return res.status(400).json({ error: "Transaction failed on-chain" });
    }

    // Record donation
    const refundEligibleAt = new Date();
    refundEligibleAt.setFullYear(refundEligibleAt.getFullYear() + 1);

    const [donation] = await db
      .insert(fundDonations)
      .values({
        repoId,
        donorWallet: req.user!.wallet,
        amount,
        txHash,
        chainId,
        redistributeOnTimeout: redistributeOnTimeout || false,
        source: source || "direct",
        refundEligibleAt,
      })
      .returning();

    // Update repo stats (donorCount via subquery for atomicity)
    await db
      .update(githubRepos)
      .set({
        totalFunded: sql`(COALESCE(${githubRepos.totalFunded}, '0')::numeric + ${parseFloat(amount)}::numeric)::text`,
        donorCount: sql`(SELECT COUNT(DISTINCT ${fundDonations.donorWallet}) FROM ${fundDonations} WHERE ${fundDonations.repoId} = ${githubRepos.id} AND ${fundDonations.status} = 'confirmed')`,
        updatedAt: new Date(),
      })
      .where(eq(githubRepos.id, repoId));

    res.status(201).json(donation);
  } catch (error) {
    console.error("Record donation error:", error);
    res.status(500).json({ error: "Failed to record donation" });
  }
});

/**
 * Analyze dependencies
 * POST /v1/fund/analyze
 */
router.post("/analyze", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { content, packageManager } = req.body;

  if (!content || !packageManager) {
    return res.status(400).json({ error: "Missing required fields: content, packageManager" });
  }

  if (typeof content !== "string" || content.length > 512_000) {
    return res.status(400).json({ error: "Manifest content too large (max 512KB)" });
  }

  if (!["npm", "cargo", "go"].includes(packageManager)) {
    return res.status(400).json({ error: "Invalid packageManager. Supported: npm, cargo, go" });
  }

  try {
    let result;
    switch (packageManager) {
      case "npm":
        result = await analyzePackageJson(content);
        break;
      case "cargo":
        result = await analyzeCargoToml(content);
        break;
      case "go":
        result = await analyzeGoMod(content);
        break;
      default:
        return res.status(400).json({ error: "Unknown package manager" });
    }

    const scores = scoreDependencies(result.dependencies);

    // Compute input hash for deduplication
    const inputHash = createHash("sha256").update(content).digest("hex");

    // Store analysis
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const [analysis] = await db
      .insert(dependencyAnalyses)
      .values({
        requestedBy: req.user!.wallet,
        packageManager,
        inputHash,
        dependencies: result.dependencies as any,
        scores: scores as any,
        totalDependencies: result.totalDependencies,
        directDependencies: result.directDependencies,
        expiresAt,
      })
      .returning();

    res.json({
      analysisId: analysis.id,
      dependencies: result.dependencies,
      scores,
      unresolved: result.unresolved,
      totalDependencies: result.totalDependencies,
      directDependencies: result.directDependencies,
    });
  } catch (error) {
    console.error("Analyze dependencies error:", error);
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: "Invalid manifest file content" });
    }
    res.status(500).json({ error: "Failed to analyze dependencies" });
  }
});

/**
 * Record batch donation (from Stack Fund)
 * POST /v1/fund/distribute
 */
router.post("/distribute", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { analysisId, txHash, chainId, budget } = req.body;

  if (!analysisId || !txHash || !chainId || !budget) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return res.status(400).json({ error: "Invalid transaction hash" });
  }

  try {
    // Get the analysis
    const analysis = await db.query.dependencyAnalyses.findFirst({
      where: eq(dependencyAnalyses.id, analysisId),
    });

    if (!analysis) {
      return res.status(404).json({ error: "Analysis not found" });
    }

    if (analysis.executedTxHash) {
      return res.status(409).json({ error: "Analysis already executed" });
    }

    // Check txHash uniqueness
    const existingDonation = await db.query.fundDonations.findFirst({
      where: eq(fundDonations.txHash, txHash),
    });
    if (existingDonation) {
      return res.status(409).json({ error: "Transaction hash already recorded" });
    }

    // Verify on-chain
    const receipt = await getTransactionReceipt(txHash as `0x${string}`);
    if (!receipt) {
      return res.status(400).json({ error: "Transaction not found on-chain" });
    }
    if (receipt.status !== "success") {
      return res.status(400).json({ error: "Transaction failed on-chain" });
    }

    // Compute distribution
    const scores = analysis.scores as any[];
    const distribution = computeDistribution(scores, parseFloat(budget));

    // Record individual donations for each repo
    const refundEligibleAt = new Date();
    refundEligibleAt.setFullYear(refundEligibleAt.getFullYear() + 1);

    for (const dist of distribution) {
      // Ensure repo exists in DB
      let repo = await db.query.githubRepos.findFirst({
        where: eq(githubRepos.repoHash, dist.repoHash),
      });

      if (!repo) {
        // Create repo entry
        const [newRepo] = await db
          .insert(githubRepos)
          .values({
            githubId: dist.githubId,
            owner: dist.owner,
            name: dist.repo,
            fullName: `${dist.owner}/${dist.repo}`,
            repoHash: dist.repoHash,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: githubRepos.githubId,
            set: { updatedAt: new Date() },
          })
          .returning();
        repo = newRepo;
      }

      // Use batch txHash with index for unique identifier per distribution entry
      const distTxHash = `${txHash}:batch:${randomUUID()}`;

      await db.insert(fundDonations).values({
        repoId: repo.id,
        donorWallet: req.user!.wallet,
        amount: dist.amount.toString(),
        txHash: distTxHash,
        chainId,
        redistributeOnTimeout: false,
        source: "stack",
        analysisId,
        refundEligibleAt,
      });

      // Update repo stats (donorCount via subquery for atomicity)
      await db
        .update(githubRepos)
        .set({
          totalFunded: sql`(COALESCE(${githubRepos.totalFunded}, '0')::numeric + ${dist.amount}::numeric)::text`,
          donorCount: sql`(SELECT COUNT(DISTINCT ${fundDonations.donorWallet}) FROM ${fundDonations} WHERE ${fundDonations.repoId} = ${githubRepos.id} AND ${fundDonations.status} = 'confirmed')`,
          updatedAt: new Date(),
        })
        .where(eq(githubRepos.id, repo.id));
    }

    // Mark analysis as executed
    await db
      .update(dependencyAnalyses)
      .set({
        executedBudget: budget,
        executedTxHash: txHash,
        executedAt: new Date(),
      })
      .where(eq(dependencyAnalyses.id, analysisId));

    res.status(201).json({
      analysisId,
      txHash,
      distribution,
      totalDistributed: distribution.reduce((sum, d) => sum + d.amount, 0),
    });
  } catch (error) {
    console.error("Distribute error:", error);
    res.status(500).json({ error: "Failed to distribute funds" });
  }
});

/**
 * Get my donations
 * GET /v1/fund/my-donations
 */
router.get("/my-donations", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { limit: rawLimit = "20", offset: rawOffset = "0" } = req.query;

  const parsedLimit = Math.min(Math.max(parseInt(rawLimit as string) || 20, 1), 100);
  const parsedOffset = Math.max(parseInt(rawOffset as string) || 0, 0);

  try {
    const donations = await db
      .select({
        id: fundDonations.id,
        amount: fundDonations.amount,
        txHash: fundDonations.txHash,
        chainId: fundDonations.chainId,
        status: fundDonations.status,
        source: fundDonations.source,
        redistributeOnTimeout: fundDonations.redistributeOnTimeout,
        refundEligibleAt: fundDonations.refundEligibleAt,
        createdAt: fundDonations.createdAt,
        repoOwner: githubRepos.owner,
        repoName: githubRepos.name,
        repoFullName: githubRepos.fullName,
        repoAvatarUrl: githubRepos.avatarUrl,
      })
      .from(fundDonations)
      .innerJoin(githubRepos, eq(fundDonations.repoId, githubRepos.id))
      .where(eq(fundDonations.donorWallet, req.user!.wallet))
      .orderBy(desc(fundDonations.createdAt))
      .limit(parsedLimit)
      .offset(parsedOffset);

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(fundDonations)
      .where(eq(fundDonations.donorWallet, req.user!.wallet));

    res.json({
      data: donations,
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
        total: count,
      },
    });
  } catch (error) {
    console.error("Get my donations error:", error);
    res.status(500).json({ error: "Failed to get donations" });
  }
});

/**
 * Record a refund
 * POST /v1/fund/refund
 */
router.post("/refund", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { donationId, txHash } = req.body;

  if (!donationId || !txHash) {
    return res.status(400).json({ error: "Missing required fields: donationId, txHash" });
  }

  if (typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return res.status(400).json({ error: "Invalid transaction hash" });
  }

  try {
    const donation = await db.query.fundDonations.findFirst({
      where: and(
        eq(fundDonations.id, donationId),
        eq(fundDonations.donorWallet, req.user!.wallet)
      ),
    });

    if (!donation) {
      return res.status(404).json({ error: "Donation not found" });
    }

    if (donation.status !== "confirmed") {
      return res.status(400).json({ error: "Donation is not in refundable state" });
    }

    if (donation.refundEligibleAt && new Date() < donation.refundEligibleAt) {
      return res.status(400).json({ error: "Refund delay not elapsed" });
    }

    const [updated] = await db
      .update(fundDonations)
      .set({
        status: "refunded",
        refundTxHash: txHash,
        refundedAt: new Date(),
      })
      .where(eq(fundDonations.id, donationId))
      .returning();

    // Update repo stats
    await db
      .update(githubRepos)
      .set({
        totalFunded: sql`GREATEST((COALESCE(${githubRepos.totalFunded}, '0')::numeric - ${parseFloat(donation.amount)}::numeric), 0)::text`,
        updatedAt: new Date(),
      })
      .where(eq(githubRepos.id, donation.repoId));

    res.json(updated);
  } catch (error) {
    console.error("Refund error:", error);
    res.status(500).json({ error: "Failed to process refund" });
  }
});

/**
 * Get claim authorization signature
 * POST /v1/fund/claim/authorize
 */
router.post("/claim/authorize", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { repoId, walletAddress } = req.body;
  const githubAccessToken = req.headers["x-github-token"] as string;

  if (!repoId || !walletAddress) {
    return res.status(400).json({ error: "Missing required fields: repoId, walletAddress" });
  }

  if (!githubAccessToken) {
    return res.status(400).json({ error: "GitHub access token required in X-GitHub-Token header" });
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  try {
    const repo = await db.query.githubRepos.findFirst({
      where: eq(githubRepos.id, repoId),
    });

    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    if (repo.claimStatus === "claimed") {
      return res.status(400).json({ error: "Repository already claimed" });
    }

    if (repo.claimStatus === "opted_out") {
      return res.status(400).json({ error: "Repository has opted out" });
    }

    // Verify GitHub ownership
    const isOwner = await verifyRepoOwnership(githubAccessToken, repo.githubId);
    if (!isOwner) {
      return res.status(403).json({ error: "Not authorized: admin access required for this repository" });
    }

    // Generate nonce and sign
    const nonce = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

    const signature = await signClaimAuthorization(
      repo.repoHash as `0x${string}`,
      walletAddress as `0x${string}`,
      nonce
    );

    // Update claim status
    await db
      .update(githubRepos)
      .set({
        claimStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(githubRepos.id, repoId));

    res.json({
      repoHash: repo.repoHash,
      nonce: nonce.toString(),
      signature,
      escrowAddress: config.contracts.escrow,
      chainId: config.blockchain.chainId,
    });
  } catch (error) {
    console.error("Claim authorize error:", error);
    res.status(500).json({ error: "Failed to generate claim authorization" });
  }
});

/**
 * Confirm claim transaction
 * POST /v1/fund/claim/confirm
 */
router.post("/claim/confirm", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { repoId, txHash } = req.body;

  if (!repoId || !txHash) {
    return res.status(400).json({ error: "Missing required fields: repoId, txHash" });
  }

  try {
    // Verify on-chain
    const receipt = await getTransactionReceipt(txHash as `0x${string}`);
    if (!receipt || receipt.status !== "success") {
      return res.status(400).json({ error: "Transaction not confirmed on-chain" });
    }

    const [updated] = await db
      .update(githubRepos)
      .set({
        claimStatus: "claimed",
        claimedBy: req.user!.wallet,
        claimedAt: new Date(),
        claimTxHash: txHash,
        updatedAt: new Date(),
      })
      .where(eq(githubRepos.id, repoId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Repository not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Claim confirm error:", error);
    res.status(500).json({ error: "Failed to confirm claim" });
  }
});

/**
 * Opt out of receiving funds
 * POST /v1/fund/opt-out
 */
router.post("/opt-out", authMiddleware, async (req: AuthRequest, res: Response) => {
  const { owner, name } = req.body;
  const githubAccessToken = req.headers["x-github-token"] as string;

  if (!owner || !name) {
    return res.status(400).json({ error: "Missing required fields: owner, name" });
  }

  if (!githubAccessToken) {
    return res.status(400).json({ error: "GitHub access token required" });
  }

  try {
    const repo = await db.query.githubRepos.findFirst({
      where: and(eq(githubRepos.owner, owner), eq(githubRepos.name, name)),
    });

    if (!repo) {
      return res.status(404).json({ error: "Repository not found" });
    }

    // Verify ownership
    const isOwner = await verifyRepoOwnership(githubAccessToken, repo.githubId);
    if (!isOwner) {
      return res.status(403).json({ error: "Not authorized: admin access required" });
    }

    const [updated] = await db
      .update(githubRepos)
      .set({
        claimStatus: "opted_out",
        optedOut: true,
        optedOutAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(githubRepos.id, repo.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Opt-out error:", error);
    res.status(500).json({ error: "Failed to opt out" });
  }
});

export default router;
