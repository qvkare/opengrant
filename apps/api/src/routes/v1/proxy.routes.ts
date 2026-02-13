import { Router, Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../db/index.js";
import { apis, endpoints, publishers, usageRecords, consumers, apiKeys } from "@opengrant/database";
import { createX402Middleware, getX402Payment } from "../../middleware/x402.middleware.js";
import { createWalletRateLimitMiddleware } from "../../middleware/rateLimit.middleware.js";
import { hashApiKey } from "../../middleware/auth.middleware.js";

const router = Router();

/**
 * Validate that a URL is not targeting private/internal networks (SSRF protection)
 */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();

    // Block non-HTTP(S) schemes
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return true;
    }

    // Block localhost variants
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") {
      return true;
    }

    // Strip IPv6 brackets if present
    const cleanHost = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;

    // Block IPv6 loopback and private ranges
    if (cleanHost === "::1" || cleanHost === "::") return true;
    if (cleanHost.startsWith("fc") || cleanHost.startsWith("fd")) return true; // Unique local (fc00::/7)
    if (cleanHost.startsWith("fe80")) return true; // Link-local
    if (cleanHost.startsWith("::ffff:")) {
      // IPv6-mapped IPv4: extract the IPv4 part and check it
      const ipv4Part = cleanHost.slice(7);
      const parts = ipv4Part.split(".");
      if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
        const [a, b] = parts.map(Number);
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
        if (a === 0) return true;
      }
    }

    // Block private IPv4 ranges
    const parts = hostname.split(".");
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const [a, b] = parts.map(Number);
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 127) return true; // 127.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 169 && b === 254) return true; // Link-local / cloud metadata
      if (a === 0) return true; // 0.0.0.0/8
    }

    return false;
  } catch {
    return true;
  }
}

interface ProxyContext {
  api: {
    id: string;
    baseUrl: string;
    publisherId: string;
    status: string;
  };
  endpoint: {
    id: string;
    path: string;
    method: string;
    pricePerCall: number;
    description: string | null;
  };
  publisher: {
    walletAddress: string;
  };
  consumerId?: string;
}

interface AuthenticatedRequest extends Request {
  openGrantContext?: ProxyContext;
  consumerId?: string;
}

interface ConsumerAuth {
  consumerId: string;
  allowedApis: string[] | null;
}

/**
 * Extract consumer from API key or JWT
 */
async function extractConsumer(req: Request): Promise<ConsumerAuth | null> {
  const apiKeyHeader = req.headers["x-api-key"] as string | undefined;
  const authHeader = req.headers["authorization"] as string | undefined;

  const apiKeyValue = apiKeyHeader ||
    (authHeader?.startsWith("Bearer og_") ? authHeader.slice(7) : undefined);

  if (apiKeyValue?.startsWith("og_")) {
    try {
      const keyHash = hashApiKey(apiKeyValue);
      const keyRecord = await db.query.apiKeys.findFirst({
        where: eq(apiKeys.keyHash, keyHash),
      });

      if (keyRecord?.isActive) {
        return {
          consumerId: keyRecord.consumerId,
          allowedApis: keyRecord.allowedApis as string[] | null,
        };
      }
    } catch {
      // Ignore auth errors for proxy - just continue as anonymous
    }
  }

  return null;
}

/**
 * Proxy request to publisher's API
 */
async function proxyRequest(
  targetUrl: string,
  req: Request
): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  try {
    // Build target URL with query params
    const url = new URL(targetUrl);
    const searchParams = new URLSearchParams(req.query as Record<string, string>);
    url.search = searchParams.toString();

    // Prepare headers (forward relevant headers)
    const headers: Record<string, string> = {
      "Content-Type": req.headers["content-type"] || "application/json",
      "Accept": req.headers["accept"] as string || "application/json",
    };

    // Forward custom headers (X-* headers except our internal ones and sensitive keys)
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        key.startsWith("x-") &&
        !key.startsWith("x-402") &&
        !key.startsWith("x-opengrant") &&
        key !== "x-api-key" &&
        typeof value === "string"
      ) {
        headers[key] = value;
      }
    }

    // Make request to publisher's API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(url.toString(), {
        method: req.method,
        headers,
        body: ["POST", "PUT", "PATCH"].includes(req.method) ? JSON.stringify(req.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Get response body
      const contentType = response.headers.get("content-type") || "";
      let body: any;

      if (contentType.includes("application/json")) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      // Build response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (!["content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      });

      return {
        status: response.status,
        headers: responseHeaders,
        body,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("Proxy error:", error);

    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: 504,
        headers: {},
        body: { error: "Gateway Timeout", message: "Upstream API did not respond in time" },
      };
    }

    return {
      status: 502,
      headers: {},
      body: { error: "Bad Gateway", message: "Failed to reach upstream API" },
    };
  }
}

/**
 * Record API usage
 */
async function recordUsage(
  apiId: string,
  endpointId: string,
  consumerId: string | null,
  payment: ReturnType<typeof getX402Payment>,
  responseTimeMs: number,
  responseStatus: number
): Promise<void> {
  try {
    await db.insert(usageRecords).values({
      apiId,
      endpointId,
      consumerId: consumerId || "00000000-0000-0000-0000-000000000000", // Anonymous
      requestId: randomUUID(),
      requestTimestamp: new Date(),
      priceCharged: payment ? parseInt(payment.amount, 10) : 0,
      paymentPayload: payment ? { txHash: payment.txHash, payer: payment.payer } : null,
      paymentTxHash: payment?.txHash || null,
      paymentStatus: payment ? "verified" : "pending",
      responseTimeMs,
      responseStatus,
    });
  } catch (error) {
    console.error("Failed to record usage:", error);
    // Don't throw - usage recording should not block the response
  }
}

/**
 * Find API by slug only (simplified pattern)
 */
async function findApiBySlug(apiSlug: string) {
  const result = await db
    .select({
      id: apis.id,
      baseUrl: apis.baseUrl,
      publisherId: apis.publisherId,
      status: apis.status,
      slug: apis.slug,
    })
    .from(apis)
    .where(eq(apis.slug, apiSlug))
    .limit(1);

  return result[0] || null;
}

/**
 * Find API by publisher wallet and slug
 */
async function findApiByPublisherAndSlug(publisherWallet: string, apiSlug: string) {
  const result = await db
    .select({
      id: apis.id,
      baseUrl: apis.baseUrl,
      publisherId: apis.publisherId,
      status: apis.status,
      slug: apis.slug,
    })
    .from(apis)
    .innerJoin(publishers, eq(apis.publisherId, publishers.id))
    .where(
      and(
        eq(apis.slug, apiSlug),
        eq(publishers.walletAddress, publisherWallet)
      )
    )
    .limit(1);

  return result[0] || null;
}

/**
 * Dynamic x402 middleware that loads pricing from database
 * Pattern 1: /proxy/:apiSlug/* (for SDK simplicity)
 */
async function dynamicX402HandlerSimple(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { apiSlug } = req.params;
  const path = "/" + (req.params[0] || "");

  try {
    // Extract consumer ID if authenticated
    const consumerAuth = await extractConsumer(req);

    // Find API
    const api = await findApiBySlug(apiSlug);

    if (!api || api.status !== "active") {
      res.status(404).json({ error: "API not found or not active" });
      return;
    }

    // Check API key permission: if allowedApis is set, verify this API is in the list
    if (consumerAuth?.allowedApis && consumerAuth.allowedApis.length > 0) {
      if (!consumerAuth.allowedApis.includes(api.id)) {
        res.status(403).json({ error: "API key does not have permission to access this API" });
        return;
      }
    }

    // Find endpoint
    const [endpoint] = await db
      .select()
      .from(endpoints)
      .where(
        and(
          eq(endpoints.apiId, api.id),
          eq(endpoints.path, path),
          eq(endpoints.method, req.method as any),
          eq(endpoints.isActive, true)
        )
      )
      .limit(1);

    if (!endpoint) {
      // Try to find a wildcard endpoint
      const [wildcardEndpoint] = await db
        .select()
        .from(endpoints)
        .where(
          and(
            eq(endpoints.apiId, api.id),
            eq(endpoints.path, "/*"),
            eq(endpoints.method, req.method as any),
            eq(endpoints.isActive, true)
          )
        )
        .limit(1);

      if (!wildcardEndpoint) {
        res.status(404).json({ error: "Endpoint not found" });
        return;
      }
    }

    // Get publisher wallet for payment
    const [publisher] = await db
      .select({ walletAddress: publishers.walletAddress })
      .from(publishers)
      .where(eq(publishers.id, api.publisherId))
      .limit(1);

    if (!publisher) {
      res.status(404).json({ error: "Publisher not found" });
      return;
    }

    const activeEndpoint = endpoint || { id: api.id, path, method: req.method, pricePerCall: 0, description: null };

    // Store for later use
    req.openGrantContext = {
      api,
      endpoint: activeEndpoint,
      publisher,
      consumerId: consumerAuth?.consumerId || undefined,
    };

    // If endpoint is free, skip payment
    if (activeEndpoint.pricePerCall === 0) {
      return next();
    }

    // Create x402 middleware for this endpoint
    // payTo must point to the Payments contract so USDC enters the settlement flow
    const { config: appConfig } = await import("../../config/index.js");
    if (!appConfig.contracts.payments) {
      res.status(503).json({ error: "Payment settlement not configured" });
      return;
    }

    const x402Middleware = createX402Middleware({
      routes: {
        [`${req.method} ${req.path}`]: {
          price: `$${(activeEndpoint.pricePerCall / 1_000_000).toFixed(6)}`,
          description: activeEndpoint.description || `${req.method} ${path}`,
        },
      },
      payTo: appConfig.contracts.payments,
    });

    // Execute x402 middleware
    x402Middleware(req, res, next);
  } catch (error) {
    console.error("Dynamic x402 handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Dynamic x402 middleware for publisher-qualified paths
 * Pattern 2: /proxy/:publisherSlug/:apiSlug/*
 */
async function dynamicX402HandlerQualified(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { publisherSlug, apiSlug } = req.params;
  const path = "/" + (req.params[0] || "");

  try {
    // Extract consumer ID if authenticated
    const consumerAuth = await extractConsumer(req);

    // Find API by publisher and slug
    const api = await findApiByPublisherAndSlug(publisherSlug, apiSlug);

    if (!api || api.status !== "active") {
      res.status(404).json({ error: "API not found or not active" });
      return;
    }

    // Check API key permission: if allowedApis is set, verify this API is in the list
    if (consumerAuth?.allowedApis && consumerAuth.allowedApis.length > 0) {
      if (!consumerAuth.allowedApis.includes(api.id)) {
        res.status(403).json({ error: "API key does not have permission to access this API" });
        return;
      }
    }

    // Find endpoint
    const [endpoint] = await db
      .select()
      .from(endpoints)
      .where(
        and(
          eq(endpoints.apiId, api.id),
          eq(endpoints.path, path),
          eq(endpoints.method, req.method as any),
          eq(endpoints.isActive, true)
        )
      )
      .limit(1);

    if (!endpoint) {
      res.status(404).json({ error: "Endpoint not found" });
      return;
    }

    // Get publisher wallet for payment
    const [publisher] = await db
      .select({ walletAddress: publishers.walletAddress })
      .from(publishers)
      .where(eq(publishers.id, api.publisherId))
      .limit(1);

    if (!publisher) {
      res.status(404).json({ error: "Publisher not found" });
      return;
    }

    // Store for later use
    req.openGrantContext = {
      api,
      endpoint,
      publisher,
      consumerId: consumerAuth?.consumerId || undefined,
    };

    // If endpoint is free, skip payment
    if (endpoint.pricePerCall === 0) {
      return next();
    }

    // Create x402 middleware for this endpoint
    // payTo must point to the Payments contract so USDC enters the settlement flow
    const { config: appConfig } = await import("../../config/index.js");
    if (!appConfig.contracts.payments) {
      res.status(503).json({ error: "Payment settlement not configured" });
      return;
    }

    const x402Middleware = createX402Middleware({
      routes: {
        [`${req.method} ${req.path}`]: {
          price: `$${(endpoint.pricePerCall / 1_000_000).toFixed(6)}`,
          description: endpoint.description || `${req.method} ${path}`,
        },
      },
      payTo: appConfig.contracts.payments,
    });

    // Execute x402 middleware
    x402Middleware(req, res, next);
  } catch (error) {
    console.error("Dynamic x402 handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Proxy handler
 */
async function proxyHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  const startTime = Date.now();
  const context = req.openGrantContext;

  if (!context) {
    res.status(500).json({ error: "Context not found" });
    return;
  }

  const { api, endpoint, publisher, consumerId } = context;
  const path = "/" + (req.params[0] || req.params.apiSlug ? "" : "");
  const actualPath = req.params[0] ? "/" + req.params[0] : "";

  // Build target URL with SSRF protection
  const targetUrl = `${api.baseUrl}${actualPath}`;

  if (isPrivateUrl(targetUrl)) {
    res.status(403).json({ error: "Target URL is not allowed" });
    return;
  }

  // Proxy the request
  const proxyResult = await proxyRequest(targetUrl, req);

  // Calculate response time
  const responseTimeMs = Date.now() - startTime;

  // Record usage
  const payment = getX402Payment(req);
  await recordUsage(
    api.id,
    endpoint.id,
    consumerId || null,
    payment,
    responseTimeMs,
    proxyResult.status
  );

  // Send response
  res.status(proxyResult.status);

  // Set headers
  for (const [key, value] of Object.entries(proxyResult.headers)) {
    res.set(key, value);
  }

  // Add OpenGrant headers (only expose response time publicly; hide internal IDs)
  res.set({
    "X-OpenGrant-Response-Time": responseTimeMs.toString(),
  });

  // Add payment headers if payment was made
  if (payment) {
    res.set({
      "X-402-Payment-Amount": payment.amount,
      "X-402-Payment-Tx": payment.txHash || "",
    });
  }

  if (typeof proxyResult.body === "object") {
    res.json(proxyResult.body);
  } else {
    res.send(proxyResult.body);
  }
}

// ============================================
// ROUTES
// ============================================

// Rate limiter
const rateLimiter = createWalletRateLimitMiddleware(10000, 3600); // 10k requests per hour per wallet

/**
 * Simple pattern (for SDK): /proxy/:apiSlug/*
 * Example: /proxy/tailwind/v1/generate
 */
router.all(
  "/:apiSlug/*",
  rateLimiter,
  dynamicX402HandlerSimple,
  proxyHandler
);

// Handle root path (no trailing path) for simple pattern
router.all(
  "/:apiSlug",
  rateLimiter,
  dynamicX402HandlerSimple,
  proxyHandler
);

export default router;

/**
 * Create a separate router for qualified paths if needed
 */
export function createQualifiedProxyRouter(): Router {
  const qualifiedRouter = Router();

  /**
   * Qualified pattern: /proxy/:publisherSlug/:apiSlug/*
   * Example: /proxy/0x1234.../weather-api/v1/forecast
   */
  qualifiedRouter.all(
    "/:publisherSlug/:apiSlug/*",
    rateLimiter,
    dynamicX402HandlerQualified,
    proxyHandler
  );

  qualifiedRouter.all(
    "/:publisherSlug/:apiSlug",
    rateLimiter,
    dynamicX402HandlerQualified,
    proxyHandler
  );

  return qualifiedRouter;
}
