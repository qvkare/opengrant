import { Router, Request, Response } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { apis, endpoints, usageRecords } from "@opengrant/database";
import { config } from "../../config/index.js";

const router = Router();

/**
 * Internal API key validation middleware.
 * CRE workflows authenticate via a shared API key (INTERNAL_API_KEY env var).
 */
function internalAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  const internalKey = process.env.INTERNAL_API_KEY;

  if (!internalKey) {
    return res.status(503).json({ error: "Internal routes not configured" });
  }

  if (!authHeader || authHeader !== `Bearer ${internalKey}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

router.use(internalAuth);

/**
 * Get pending (verified but unsettled) usage records for settlement
 * GET /internal/pending-settlements
 *
 * Called by: CRE usage-aggregation workflow
 * Returns: { records: UsageRecord[] }
 */
router.get("/pending-settlements", async (_req: Request, res: Response) => {
  try {
    const records = await db
      .select({
        id: usageRecords.id,
        apiId: usageRecords.apiId,
        endpointId: usageRecords.endpointId,
        consumerId: usageRecords.consumerId,
        amount: sql<string>`${usageRecords.priceCharged}::text`,
        txHash: usageRecords.paymentTxHash,
        timestamp: usageRecords.requestTimestamp,
      })
      .from(usageRecords)
      .where(eq(usageRecords.paymentStatus, "verified"));

    res.json({ records });
  } catch (error) {
    console.error("Pending settlements error:", error);
    res.status(500).json({ error: "Failed to fetch pending settlements" });
  }
});

/**
 * Mark usage records as settled after on-chain batch distribution
 * POST /internal/mark-settled
 *
 * Called by: CRE usage-aggregation workflow
 * Body: { recordIds: string[], txHash: string, settledAt: number }
 */
router.post("/mark-settled", async (req: Request, res: Response) => {
  const { recordIds, txHash, settledAt } = req.body;

  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    return res.status(400).json({ error: "recordIds array required" });
  }
  if (!txHash) {
    return res.status(400).json({ error: "txHash required" });
  }

  try {
    await db
      .update(usageRecords)
      .set({
        paymentStatus: "settled",
        paymentTxHash: txHash,
        settledAt: new Date(settledAt || Date.now()),
      })
      .where(
        and(
          inArray(usageRecords.id, recordIds),
          eq(usageRecords.paymentStatus, "verified")
        )
      );

    res.json({ success: true, settled: recordIds.length });
  } catch (error) {
    console.error("Mark settled error:", error);
    res.status(500).json({ error: "Failed to mark records as settled" });
  }
});

/**
 * Get all active APIs with their base URLs for health checking
 * GET /internal/active-apis
 *
 * Called by: CRE health-monitoring workflow
 * Returns: { apis: Array<{ id, baseUrl, consecutiveFailures }> }
 */
router.get("/active-apis", async (_req: Request, res: Response) => {
  try {
    const activeApis = await db.query.apis.findMany({
      where: eq(apis.status, "active"),
      columns: {
        id: true,
        baseUrl: true,
        healthStatus: true,
      },
    });

    res.json({
      apis: activeApis.map((api) => ({
        id: api.id,
        baseUrl: api.baseUrl,
        consecutiveFailures: api.healthStatus === "down" ? 1 : 0,
      })),
    });
  } catch (error) {
    console.error("Active APIs error:", error);
    res.status(500).json({ error: "Failed to fetch active APIs" });
  }
});

/**
 * Receive health check report and update API statuses
 * POST /internal/health-report
 *
 * Called by: CRE health-monitoring workflow
 * Body: { checks: APIHealthCheck[], reportedAt: number }
 */
router.post("/health-report", async (req: Request, res: Response) => {
  const { checks } = req.body;

  if (!Array.isArray(checks)) {
    return res.status(400).json({ error: "checks array required" });
  }

  try {
    for (const check of checks) {
      await db
        .update(apis)
        .set({
          healthStatus: check.status,
          lastHealthCheck: new Date(check.checkedAt),
        })
        .where(eq(apis.id, check.apiId));
    }

    res.json({ success: true, updated: checks.length });
  } catch (error) {
    console.error("Health report error:", error);
    res.status(500).json({ error: "Failed to process health report" });
  }
});

/**
 * Deactivate APIs that have failed health checks repeatedly
 * POST /internal/deactivate-apis
 *
 * Called by: CRE health-monitoring workflow
 * Body: { apiIds: string[], reason: string, deactivatedAt: number }
 */
router.post("/deactivate-apis", async (req: Request, res: Response) => {
  const { apiIds, reason } = req.body;

  if (!Array.isArray(apiIds) || apiIds.length === 0) {
    return res.status(400).json({ error: "apiIds array required" });
  }

  try {
    await db
      .update(apis)
      .set({
        status: "inactive",
        healthStatus: "down",
      })
      .where(
        and(
          inArray(apis.id, apiIds),
          eq(apis.status, "active")
        )
      );

    // Also deactivate all endpoints for these APIs
    await db
      .update(endpoints)
      .set({ isActive: false })
      .where(inArray(endpoints.apiId, apiIds));

    console.log(`Deactivated ${apiIds.length} APIs: ${reason}`);
    res.json({ success: true, deactivated: apiIds.length });
  } catch (error) {
    console.error("Deactivate APIs error:", error);
    res.status(500).json({ error: "Failed to deactivate APIs" });
  }
});

/**
 * Trigger periodic settlement for all publishers
 * POST /internal/trigger-settlement
 *
 * Called by: CRE usage-aggregation workflow or manual cron
 * Body: { executeOnChain?: boolean }
 */
router.post("/trigger-settlement", async (req: Request, res: Response) => {
  const { executeOnChain = false } = req.body || {};

  try {
    const { runPeriodicSettlement } = await import(
      "../../services/settlement.service.js"
    );

    const result = await runPeriodicSettlement({ executeOnChain });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Settlement trigger error:", error);
    res.status(500).json({ error: "Failed to run settlement" });
  }
});

export default router;
