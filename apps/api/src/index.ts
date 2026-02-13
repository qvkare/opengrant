import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config/index.js";
import { createRateLimitMiddleware } from "./middleware/rateLimit.middleware.js";

// Import routes
import apisRoutes from "./routes/v1/apis.routes.js";
import proxyRoutes from "./routes/v1/proxy.routes.js";
import authRoutes from "./routes/v1/auth.routes.js";
import consumerRoutes from "./routes/v1/consumer.routes.js";
import publisherRoutes from "./routes/v1/publisher.routes.js";
import internalRoutes from "./routes/v1/internal.routes.js";
import fundRoutes from "./routes/v1/fund.routes.js";

// Import database
import { testConnection, closeDatabase } from "./db/index.js";

// Import services
import { initRedis, closeRedis } from "./services/redis.service.js";
import { getHealthStatus, isAlive, isReady } from "./services/health.service.js";

const app = express();

// Trust proxy for correct client IP behind load balancer
app.set("trust proxy", 1);

// ============================================
// MIDDLEWARE
// ============================================

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: config.server.isDev
      ? "*"
      : [config.web.url, "https://opengrant.io"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "X-GitHub-Token",
      "X-402-Payment",
      "X-402-Version",
      "X-402-Payment-Token",
    ],
    exposedHeaders: [
      "X-402-Payment",
      "X-402-Payment-Amount",
      "X-402-Payment-Tx",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "X-OpenGrant-Response-Time",
    ],
  })
);

// Body parsing
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Global rate limiting
app.use(
  createRateLimitMiddleware({
    limit: 1000,
    windowSeconds: 60,
    skip: (req) =>
      req.path.startsWith("/health") || req.path.startsWith("/ready"),
  })
);

// Request logging (development)
if (config.server.isDev) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      console.log(
        `${req.method} ${req.path} ${res.statusCode} ${duration}ms`
      );
    });
    next();
  });
}

// ============================================
// HEALTH & READINESS ROUTES
// ============================================

// Liveness probe (Kubernetes)
app.get("/health", (req: Request, res: Response) => {
  if (isAlive()) {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
    });
  }
});

// Readiness probe (Kubernetes)
app.get("/ready", async (req: Request, res: Response) => {
  try {
    const ready = await isReady();
    if (ready) {
      res.json({
        status: "ready",
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: "not ready",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
    });
  }
});

// Detailed health check
app.get("/health/detailed", async (req: Request, res: Response) => {
  try {
    const health = await getHealthStatus();
    const statusCode = health.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// ============================================
// API ROUTES
// ============================================

// Auth routes
app.use("/auth", authRoutes);
app.use("/v1/auth", authRoutes);

// API v1 routes
app.use("/v1/apis", apisRoutes);
app.use("/v1/consumer", consumerRoutes);
app.use("/v1/publisher", publisherRoutes);

// Proxy routes (x402 payment gateway)
app.use("/proxy", proxyRoutes);

// Internal routes (CRE workflows)
app.use("/internal", internalRoutes);

// Fund routes (open source project funding)
app.use("/v1/fund", fundRoutes);

// ============================================
// ERROR HANDLERS
// ============================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: "The requested resource was not found",
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);

  const response: { error: string; message: string; stack?: string } = {
    error: "Internal Server Error",
    message: "An unexpected error occurred",
  };

  if (config.server.isDev) {
    response.message = err.message;
    response.stack = err.stack;
  }

  res.status(500).json(response);
});

// ============================================
// SERVER STARTUP
// ============================================

async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error("❌ Failed to connect to database. Check DATABASE_URL.");
      process.exit(1);
    }
    console.log("✅ Database connected");

    // Initialize Redis
    try {
      await initRedis();
      console.log("✅ Redis connected");
    } catch (error) {
      console.warn("⚠️ Redis connection failed, some features may be limited");
    }

    // Start server
    const server = app.listen(config.server.port, () => {
      console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   ██████╗ ██████╗ ███████╗███╗   ██╗ ██████╗ ██████╗      ║
  ║  ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝ ██╔══██╗     ║
  ║  ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██║  ███╗██████╔╝     ║
  ║  ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║   ██║██╔══██╗     ║
  ║  ╚██████╔╝██║     ███████╗██║ ╚████║╚██████╔╝██║  ██║     ║
  ║   ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝     ║
  ║                                                           ║
  ║   API Server v0.1.0                                       ║
  ║   Environment: ${config.server.nodeEnv.padEnd(42)}║
  ║   Port: ${config.server.port.toString().padEnd(49)}║
  ║   Chain ID: ${config.blockchain.chainId.toString().padEnd(45)}║
  ║   Web URL: ${config.web.url.slice(0, 46).padEnd(46)}║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);

      server.close(async () => {
        console.log("HTTP server closed");

        try {
          await closeDatabase();
          console.log("Database connection closed");
        } catch (e) {
          console.error("Error closing database:", e);
        }

        try {
          await closeRedis();
          console.log("Redis connection closed");
        } catch (e) {
          console.error("Error closing Redis:", e);
        }

        console.log("Shutdown complete");
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        console.error("Forced exit after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

export default app;
