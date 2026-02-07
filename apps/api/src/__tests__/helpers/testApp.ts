import express, { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Import routes (they use mocked DB from setup.ts)
import authRoutes from "../../routes/v1/auth.routes.js";
import apisRoutes from "../../routes/v1/apis.routes.js";
import consumerRoutes from "../../routes/v1/consumer.routes.js";
import publisherRoutes from "../../routes/v1/publisher.routes.js";

/**
 * Create a test Express app with routes mounted but no server startup
 */
export function createTestApp() {
  const app = express();

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health endpoint
  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Mount routes
  app.use("/auth", authRoutes);
  app.use("/v1/auth", authRoutes);
  app.use("/v1/apis", apisRoutes);
  app.use("/v1/consumer", consumerRoutes);
  app.use("/v1/publisher", publisherRoutes);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: "Not Found",
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  });

  return app;
}

/**
 * Generate a valid JWT token for testing
 */
export function generateTestToken(payload: {
  sub: string;
  wallet: string;
  type: "consumer" | "publisher";
}): string {
  return jwt.sign(payload, process.env.JWT_SECRET || "test-jwt-secret-for-testing-only", {
    expiresIn: "1h",
  });
}

/**
 * Generate an expired JWT token for testing
 */
export function generateExpiredToken(payload: {
  sub: string;
  wallet: string;
  type: "consumer" | "publisher";
}): string {
  return jwt.sign(payload, process.env.JWT_SECRET || "test-jwt-secret-for-testing-only", {
    expiresIn: "-1h",
  });
}
