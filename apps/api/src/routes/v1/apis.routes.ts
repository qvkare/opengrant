import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDb, apis, endpoints, publishers } from "@opengrant/database";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, requirePublisher, AuthRequest } from "../../middleware/auth.middleware.js";

const router = Router();

// ============================================
// SCHEMAS
// ============================================

const createApiSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  baseUrl: z.string().url(),
  documentationUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).optional(),
});

const updateApiSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  baseUrl: z.string().url().optional(),
  documentationUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).optional(),
});

const configureEndpointSchema = z.object({
  path: z.string().min(1).max(500),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  description: z.string().optional(),
  pricePerCall: z.number().min(0), // In USDC (6 decimals), e.g., 1000 = $0.001
  rateLimitPerMinute: z.number().min(1).default(60),
  rateLimitPerHour: z.number().min(1).default(1000),
  rateLimitPerDay: z.number().min(1).default(10000),
  requestSchema: z.any().optional(),
  responseSchema: z.any().optional(),
});

// ============================================
// PUBLIC ROUTES
// ============================================

/**
 * GET /v1/apis
 * List all active APIs
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { category, limit = "20", offset = "0" } = req.query;

    let query = db
      .select({
        id: apis.id,
        slug: apis.slug,
        name: apis.name,
        description: apis.description,
        logoUrl: apis.logoUrl,
        category: apis.category,
        tags: apis.tags,
        totalCalls: apis.totalCalls,
        totalRevenue: apis.totalRevenue,
        publishedAt: apis.publishedAt,
      })
      .from(apis)
      .where(eq(apis.status, "active"))
      .orderBy(desc(apis.totalCalls))
      .limit(parseInt(limit as string, 10))
      .offset(parseInt(offset as string, 10));

    const results = await query;

    res.json({
      data: results,
      pagination: {
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  } catch (error) {
    console.error("Error fetching APIs:", error);
    res.status(500).json({ error: "Failed to fetch APIs" });
  }
});

/**
 * GET /v1/apis/:slug
 * Get API details by slug
 */
router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { slug } = req.params;

    const [api] = await db
      .select()
      .from(apis)
      .where(and(eq(apis.slug, slug), eq(apis.status, "active")))
      .limit(1);

    if (!api) {
      res.status(404).json({ error: "API not found" });
      return;
    }

    // Get endpoints
    const apiEndpoints = await db
      .select()
      .from(endpoints)
      .where(and(eq(endpoints.apiId, api.id), eq(endpoints.isActive, true)));

    res.json({
      ...api,
      endpoints: apiEndpoints,
    });
  } catch (error) {
    console.error("Error fetching API:", error);
    res.status(500).json({ error: "Failed to fetch API" });
  }
});

/**
 * GET /v1/apis/:slug/endpoints
 * Get API endpoints
 */
router.get("/:slug/endpoints", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { slug } = req.params;

    // Find API
    const [api] = await db
      .select({ id: apis.id })
      .from(apis)
      .where(and(eq(apis.slug, slug), eq(apis.status, "active")))
      .limit(1);

    if (!api) {
      res.status(404).json({ error: "API not found" });
      return;
    }

    // Get endpoints
    const apiEndpoints = await db
      .select()
      .from(endpoints)
      .where(and(eq(endpoints.apiId, api.id), eq(endpoints.isActive, true)));

    res.json({ data: apiEndpoints });
  } catch (error) {
    console.error("Error fetching endpoints:", error);
    res.status(500).json({ error: "Failed to fetch endpoints" });
  }
});

// ============================================
// PUBLISHER ROUTES (Authenticated)
// ============================================

/**
 * POST /v1/apis
 * Create a new API (publisher only)
 */
router.post(
  "/",
  authMiddleware,
  requirePublisher,
  async (req: AuthRequest, res: Response) => {
    try {
      const db = getDb();
      const data = createApiSchema.parse(req.body);

      // Get publisher
      const [publisher] = await db
        .select({ id: publishers.id })
        .from(publishers)
        .where(eq(publishers.walletAddress, req.user!.wallet))
        .limit(1);

      if (!publisher) {
        res.status(403).json({ error: "Not registered as publisher" });
        return;
      }

      // Check slug uniqueness for this publisher
      const [existing] = await db
        .select({ id: apis.id })
        .from(apis)
        .where(and(eq(apis.publisherId, publisher.id), eq(apis.slug, data.slug)))
        .limit(1);

      if (existing) {
        res.status(409).json({ error: "API with this slug already exists" });
        return;
      }

      // Create API
      const [newApi] = await db
        .insert(apis)
        .values({
          publisherId: publisher.id,
          slug: data.slug,
          name: data.name,
          description: data.description,
          baseUrl: data.baseUrl,
          documentationUrl: data.documentationUrl,
          logoUrl: data.logoUrl,
          category: data.category,
          tags: data.tags,
          status: "draft",
        })
        .returning();

      res.status(201).json(newApi);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.errors });
        return;
      }
      console.error("Error creating API:", error);
      res.status(500).json({ error: "Failed to create API" });
    }
  }
);

/**
 * PUT /v1/apis/:id
 * Update an API (owner only)
 */
router.put(
  "/:id",
  authMiddleware,
  requirePublisher,
  async (req: AuthRequest, res: Response) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const data = updateApiSchema.parse(req.body);

      // Verify ownership
      const [api] = await db
        .select({
          id: apis.id,
          publisherId: apis.publisherId,
        })
        .from(apis)
        .innerJoin(publishers, eq(apis.publisherId, publishers.id))
        .where(
          and(eq(apis.id, id), eq(publishers.walletAddress, req.user!.wallet))
        )
        .limit(1);

      if (!api) {
        res.status(404).json({ error: "API not found or not owned by you" });
        return;
      }

      // Update API
      const [updated] = await db
        .update(apis)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(apis.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.errors });
        return;
      }
      console.error("Error updating API:", error);
      res.status(500).json({ error: "Failed to update API" });
    }
  }
);

/**
 * POST /v1/apis/:id/publish
 * Publish an API (change status to active)
 */
router.post(
  "/:id/publish",
  authMiddleware,
  requirePublisher,
  async (req: AuthRequest, res: Response) => {
    try {
      const db = getDb();
      const { id } = req.params;

      // Verify ownership
      const [api] = await db
        .select({
          id: apis.id,
          status: apis.status,
        })
        .from(apis)
        .innerJoin(publishers, eq(apis.publisherId, publishers.id))
        .where(
          and(eq(apis.id, id), eq(publishers.walletAddress, req.user!.wallet))
        )
        .limit(1);

      if (!api) {
        res.status(404).json({ error: "API not found or not owned by you" });
        return;
      }

      // Check if has at least one endpoint
      const [endpointCount] = await db
        .select({ count: endpoints.id })
        .from(endpoints)
        .where(eq(endpoints.apiId, id));

      if (!endpointCount) {
        res.status(400).json({ error: "API must have at least one endpoint before publishing" });
        return;
      }

      // Publish
      const [updated] = await db
        .update(apis)
        .set({
          status: "active",
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(apis.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error publishing API:", error);
      res.status(500).json({ error: "Failed to publish API" });
    }
  }
);

/**
 * DELETE /v1/apis/:id
 * Delete an API (owner only, soft delete by setting status to inactive)
 */
router.delete(
  "/:id",
  authMiddleware,
  requirePublisher,
  async (req: AuthRequest, res: Response) => {
    try {
      const db = getDb();
      const { id } = req.params;

      // Verify ownership
      const [api] = await db
        .select({
          id: apis.id,
          publisherId: apis.publisherId,
        })
        .from(apis)
        .innerJoin(publishers, eq(apis.publisherId, publishers.id))
        .where(
          and(eq(apis.id, id), eq(publishers.walletAddress, req.user!.wallet))
        )
        .limit(1);

      if (!api) {
        res.status(404).json({ error: "API not found or not owned by you" });
        return;
      }

      // Soft delete: set status to inactive and deactivate endpoints
      await db
        .update(apis)
        .set({
          status: "inactive",
          updatedAt: new Date(),
        })
        .where(eq(apis.id, id));

      await db
        .update(endpoints)
        .set({ isActive: false })
        .where(eq(endpoints.apiId, id));

      res.json({ success: true, message: "API deleted successfully" });
    } catch (error) {
      console.error("Error deleting API:", error);
      res.status(500).json({ error: "Failed to delete API" });
    }
  }
);

/**
 * POST /v1/apis/:id/endpoints
 * Add endpoint to API
 */
router.post(
  "/:id/endpoints",
  authMiddleware,
  requirePublisher,
  async (req: AuthRequest, res: Response) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const data = configureEndpointSchema.parse(req.body);

      // Verify ownership
      const [api] = await db
        .select({ id: apis.id })
        .from(apis)
        .innerJoin(publishers, eq(apis.publisherId, publishers.id))
        .where(
          and(eq(apis.id, id), eq(publishers.walletAddress, req.user!.wallet))
        )
        .limit(1);

      if (!api) {
        res.status(404).json({ error: "API not found or not owned by you" });
        return;
      }

      // Check if endpoint already exists
      const [existing] = await db
        .select({ id: endpoints.id })
        .from(endpoints)
        .where(
          and(
            eq(endpoints.apiId, id),
            eq(endpoints.path, data.path),
            eq(endpoints.method, data.method)
          )
        )
        .limit(1);

      if (existing) {
        res.status(409).json({ error: "Endpoint already exists" });
        return;
      }

      // Create endpoint
      const [newEndpoint] = await db
        .insert(endpoints)
        .values({
          apiId: id,
          path: data.path,
          method: data.method,
          description: data.description,
          pricePerCall: data.pricePerCall,
          rateLimitPerMinute: data.rateLimitPerMinute,
          rateLimitPerHour: data.rateLimitPerHour,
          rateLimitPerDay: data.rateLimitPerDay,
          requestSchema: data.requestSchema,
          responseSchema: data.responseSchema,
          isActive: true,
        })
        .returning();

      res.status(201).json(newEndpoint);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.errors });
        return;
      }
      console.error("Error creating endpoint:", error);
      res.status(500).json({ error: "Failed to create endpoint" });
    }
  }
);

export default router;
