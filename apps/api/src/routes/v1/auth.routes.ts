import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { verifyMessage } from "viem";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { config } from "../../config/index.js";
import { db } from "../../db/index.js";
import { consumers, publishers } from "@opengrant/database";
import {
  createCLISession,
  getCLISession,
  completeCLISession,
  deleteCLISession,
} from "../../services/redis.service.js";
import { createRateLimitMiddleware } from "../../middleware/rateLimit.middleware.js";

const router = Router();

// Rate limit auth endpoints: 20 requests per minute per IP
const authRateLimit = createRateLimitMiddleware({
  limit: 20,
  windowSeconds: 60,
  keyPrefix: "ratelimit:auth",
});
router.use(authRateLimit);

/**
 * Initialize CLI auth session
 * POST /auth/cli/init
 */
router.post("/cli/init", async (req: Request, res: Response) => {
  try {
    const sessionId = randomBytes(16).toString("hex");

    await createCLISession(sessionId);

    res.json({
      sessionId,
      authUrl: `${config.web.url}/auth/cli?session=${sessionId}`,
      expiresIn: 300, // 5 minutes
    });
  } catch (error) {
    console.error("CLI init error:", error);
    res.status(500).json({ error: "Failed to create auth session" });
  }
});

/**
 * Poll for CLI auth completion
 * GET /auth/cli/poll
 */
router.get("/cli/poll", async (req: Request, res: Response) => {
  const { session } = req.query;

  if (!session || typeof session !== "string") {
    return res.status(400).json({ error: "Missing session parameter" });
  }

  try {
    const sessionData = await getCLISession(session);

    if (!sessionData) {
      return res.status(404).json({ error: "Session not found or expired" });
    }

    if (sessionData.authenticated && sessionData.token && sessionData.walletAddress) {
      // Clean up session after successful auth
      await deleteCLISession(session);

      return res.json({
        authenticated: true,
        token: sessionData.token,
        walletAddress: sessionData.walletAddress,
      });
    }

    res.json({ authenticated: false });
  } catch (error) {
    console.error("CLI poll error:", error);
    res.status(500).json({ error: "Failed to check session" });
  }
});

/**
 * Complete CLI auth from web
 * POST /auth/cli/complete
 */
router.post("/cli/complete", async (req: Request, res: Response) => {
  const { sessionId, walletAddress, signature, message } = req.body;

  if (!sessionId || !walletAddress || !signature || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const sessionData = await getCLISession(sessionId);

    if (!sessionData) {
      return res.status(404).json({ error: "Session not found or expired" });
    }

    // Verify signature
    const isValid = await verifyMessage({
      address: walletAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Create or update consumer
    let consumer = await db.query.consumers.findFirst({
      where: eq(consumers.walletAddress, walletAddress.toLowerCase()),
    });

    if (!consumer) {
      const [newConsumer] = await db
        .insert(consumers)
        .values({
          walletAddress: walletAddress.toLowerCase(),
        })
        .returning();
      consumer = newConsumer;
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        sub: consumer.id,
        wallet: walletAddress.toLowerCase(),
        type: "consumer",
      },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn }
    );

    // Update session
    await completeCLISession(sessionId, token, walletAddress);

    res.json({ success: true, token });
  } catch (error) {
    console.error("CLI auth error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

/**
 * Headless CLI auth (private key signing)
 * POST /auth/cli/verify
 */
router.post("/cli/verify", async (req: Request, res: Response) => {
  const { message, signature, address, type = "consumer" } = req.body;

  if (!message || !signature || !address) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Verify the message contains expected format
    if (!message.startsWith("OpenGrant CLI Login")) {
      return res.status(400).json({ error: "Invalid message format" });
    }

    // Check timestamp is recent (within 5 minutes)
    const timestampMatch = message.match(/Timestamp: (\d+)/);
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1]);
      const now = Date.now();
      if (Math.abs(now - timestamp) > 60 * 1000) {
        return res.status(400).json({ error: "Message expired" });
      }
    }

    // Verify signature
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    let userId: string;
    let userType = type;

    if (type === "publisher") {
      // Create or update publisher
      let publisher = await db.query.publishers.findFirst({
        where: eq(publishers.walletAddress, address.toLowerCase()),
      });

      if (!publisher) {
        const [newPublisher] = await db
          .insert(publishers)
          .values({
            walletAddress: address.toLowerCase(),
            name: `Publisher ${address.slice(0, 8)}`,
            status: "pending",
          })
          .returning();
        publisher = newPublisher;
      }

      userId = publisher.id;
    } else {
      // Create or update consumer
      let consumer = await db.query.consumers.findFirst({
        where: eq(consumers.walletAddress, address.toLowerCase()),
      });

      if (!consumer) {
        const [newConsumer] = await db
          .insert(consumers)
          .values({
            walletAddress: address.toLowerCase(),
          })
          .returning();
        consumer = newConsumer;
      }

      userId = consumer.id;
      userType = "consumer";
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        sub: userId,
        wallet: address.toLowerCase(),
        type: userType,
      },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn }
    );

    res.json({ token, userId, type: userType });
  } catch (error) {
    console.error("CLI verify error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

/**
 * Web login with wallet signature
 * POST /auth/login
 */
router.post("/login", async (req: Request, res: Response) => {
  const { address, signature, message, type = "consumer" } = req.body;

  if (!address || !signature || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate type parameter
  if (type !== "consumer" && type !== "publisher") {
    return res.status(400).json({ error: "Invalid type. Must be 'consumer' or 'publisher'" });
  }

  try {
    // Validate message format to prevent cross-site signature reuse
    if (!message.startsWith("OpenGrant Login")) {
      return res.status(400).json({ error: "Invalid message format" });
    }

    // Check timestamp is recent (within 5 minutes)
    const timestampMatch = message.match(/Timestamp: (\d+)/);
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1]);
      const now = Date.now();
      if (Math.abs(now - timestamp) > 60 * 1000) {
        return res.status(400).json({ error: "Message expired" });
      }
    }

    // Verify signature
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    let userId: string;
    let userType = type;

    if (type === "publisher") {
      let publisher = await db.query.publishers.findFirst({
        where: eq(publishers.walletAddress, address.toLowerCase()),
      });

      if (!publisher) {
        const [newPublisher] = await db
          .insert(publishers)
          .values({
            walletAddress: address.toLowerCase(),
            name: `Publisher ${address.slice(0, 8)}`,
            status: "pending",
          })
          .returning();
        publisher = newPublisher;
      }

      userId = publisher.id;
    } else {
      let consumer = await db.query.consumers.findFirst({
        where: eq(consumers.walletAddress, address.toLowerCase()),
      });

      if (!consumer) {
        const [newConsumer] = await db
          .insert(consumers)
          .values({
            walletAddress: address.toLowerCase(),
          })
          .returning();
        consumer = newConsumer;
      }

      userId = consumer.id;
      userType = "consumer";
    }

    const token = jwt.sign(
      {
        sub: userId,
        wallet: address.toLowerCase(),
        type: userType,
      },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn }
    );

    res.json({ token, userId, type: userType });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

/**
 * Verify JWT token
 * GET /auth/verify
 */
router.get("/verify", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as {
      sub: string;
      wallet: string;
      type: string;
    };

    res.json({
      valid: true,
      userId: payload.sub,
      wallet: payload.wallet,
      type: payload.type,
    });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

/**
 * Refresh token
 * POST /auth/refresh
 */
router.post("/refresh", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.auth.jwtSecret, {
      ignoreExpiration: true,
    }) as {
      sub: string;
      wallet: string;
      type: string;
      exp: number;
    };

    // Only allow refresh if token expired within last 24 hours
    const now = Math.floor(Date.now() / 1000);
    const maxRefreshWindow = 24 * 60 * 60; // 24 hours

    if (payload.exp < now - maxRefreshWindow) {
      return res.status(401).json({ error: "Token too old to refresh" });
    }

    // Generate new token
    const newToken = jwt.sign(
      {
        sub: payload.sub,
        wallet: payload.wallet,
        type: payload.type,
      },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn }
    );

    res.json({ token: newToken });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

/**
 * Get current user
 * GET /auth/me
 */
router.get("/me", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as {
      sub: string;
      wallet: string;
      type: string;
    };

    if (payload.type === "publisher") {
      const publisher = await db.query.publishers.findFirst({
        where: eq(publishers.id, payload.sub),
      });

      if (!publisher) {
        return res.status(404).json({ error: "Publisher not found" });
      }

      res.json({
        id: publisher.id,
        type: "publisher",
        walletAddress: publisher.walletAddress,
        name: publisher.name,
        email: publisher.email,
        status: publisher.status,
      });
    } else {
      const consumer = await db.query.consumers.findFirst({
        where: eq(consumers.id, payload.sub),
      });

      if (!consumer) {
        return res.status(404).json({ error: "Consumer not found" });
      }

      res.json({
        id: consumer.id,
        type: "consumer",
        walletAddress: consumer.walletAddress,
        name: consumer.name,
        email: consumer.email,
        creditBalance: consumer.creditBalance,
      });
    }
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
