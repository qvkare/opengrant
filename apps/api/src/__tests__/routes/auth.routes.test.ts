import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, generateTestToken, generateExpiredToken } from "../helpers/testApp.js";

// Mock viem's verifyMessage
vi.mock("viem", () => ({
  verifyMessage: vi.fn(),
  createPublicClient: vi.fn(() => ({})),
  http: vi.fn(),
}));

// Mock blockchain service
vi.mock("../../services/blockchain.service.js", () => ({
  getUSDCBalance: vi.fn().mockResolvedValue({ raw: 0n, formatted: "0" }),
  getETHBalance: vi.fn().mockResolvedValue({ raw: 0n, formatted: "0" }),
}));

// Mock redis service
vi.mock("../../services/redis.service.js", () => ({
  createCLISession: vi.fn().mockResolvedValue(undefined),
  getCLISession: vi.fn(),
  completeCLISession: vi.fn().mockResolvedValue(undefined),
  deleteCLISession: vi.fn().mockResolvedValue(undefined),
  initRedis: vi.fn(),
  closeRedis: vi.fn(),
  getRedis: vi.fn(),
}));

import { verifyMessage } from "viem";
import {
  getCLISession,
} from "../../services/redis.service.js";

const app = createTestApp();

describe("Auth Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Health Check
  // ============================================

  describe("GET /health", () => {
    it("should return ok status", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ============================================
  // CLI Auth
  // ============================================

  describe("POST /auth/cli/init", () => {
    it("should create a new CLI auth session", async () => {
      const res = await request(app).post("/auth/cli/init");
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.authUrl).toContain("/auth/cli?session=");
      expect(res.body.expiresIn).toBe(300);
    });
  });

  describe("GET /auth/cli/poll", () => {
    it("should return 400 if session parameter is missing", async () => {
      const res = await request(app).get("/auth/cli/poll");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing session parameter");
    });

    it("should return 404 if session not found", async () => {
      vi.mocked(getCLISession).mockResolvedValueOnce(null);

      const res = await request(app).get("/auth/cli/poll?session=nonexistent");
      expect(res.status).toBe(404);
      expect(res.body.error).toContain("not found");
    });

    it("should return authenticated false if session not yet authenticated", async () => {
      vi.mocked(getCLISession).mockResolvedValueOnce({
        authenticated: false,
      } as any);

      const res = await request(app).get("/auth/cli/poll?session=valid-session");
      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
    });

    it("should return token when session is authenticated", async () => {
      vi.mocked(getCLISession).mockResolvedValueOnce({
        authenticated: true,
        token: "jwt-token-here",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      } as any);

      const res = await request(app).get("/auth/cli/poll?session=valid-session");
      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.token).toBe("jwt-token-here");
      expect(res.body.walletAddress).toBeDefined();
    });
  });

  describe("POST /auth/cli/complete", () => {
    it("should return 400 if required fields are missing", async () => {
      const res = await request(app)
        .post("/auth/cli/complete")
        .send({ sessionId: "test" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Missing required fields");
    });

    it("should return 404 if session not found", async () => {
      vi.mocked(getCLISession).mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/auth/cli/complete")
        .send({
          sessionId: "nonexistent",
          walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          signature: "0xdeadbeef",
          message: "Sign this message",
        });
      expect(res.status).toBe(404);
    });

    it("should return 401 if signature is invalid", async () => {
      vi.mocked(getCLISession).mockResolvedValueOnce({ authenticated: false } as any);
      vi.mocked(verifyMessage).mockResolvedValueOnce(false);

      const res = await request(app)
        .post("/auth/cli/complete")
        .send({
          sessionId: "valid-session",
          walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          signature: "0xbadsig",
          message: "Sign this message",
        });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain("Invalid signature");
    });
  });

  describe("POST /auth/cli/verify", () => {
    it("should return 400 if required fields are missing", async () => {
      const res = await request(app)
        .post("/auth/cli/verify")
        .send({ message: "test" });
      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid message format", async () => {
      const res = await request(app)
        .post("/auth/cli/verify")
        .send({
          message: "Wrong format message",
          signature: "0xdeadbeef",
          address: "0x1234567890abcdef1234567890abcdef12345678",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid message format");
    });

    it("should return 400 for expired message", async () => {
      const expiredTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const res = await request(app)
        .post("/auth/cli/verify")
        .send({
          message: `OpenGrant CLI Login\nTimestamp: ${expiredTimestamp}`,
          signature: "0xdeadbeef",
          address: "0x1234567890abcdef1234567890abcdef12345678",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("expired");
    });

    it("should return 401 for invalid signature", async () => {
      vi.mocked(verifyMessage).mockResolvedValueOnce(false);

      const res = await request(app)
        .post("/auth/cli/verify")
        .send({
          message: `OpenGrant CLI Login\nTimestamp: ${Date.now()}`,
          signature: "0xbadsig",
          address: "0x1234567890abcdef1234567890abcdef12345678",
        });
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // Web Login
  // ============================================

  describe("POST /auth/login", () => {
    it("should return 400 if fields are missing", async () => {
      const res = await request(app)
        .post("/auth/login")
        .send({ address: "0x123" });
      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid message format", async () => {
      const res = await request(app)
        .post("/auth/login")
        .send({
          address: "0x1234567890abcdef1234567890abcdef12345678",
          signature: "0xbadsig",
          message: "Sign this message",
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid message format/);
    });

    it("should return 401 for invalid signature", async () => {
      vi.mocked(verifyMessage).mockResolvedValueOnce(false);

      const res = await request(app)
        .post("/auth/login")
        .send({
          address: "0x1234567890abcdef1234567890abcdef12345678",
          signature: "0xbadsig",
          message: `OpenGrant Login\n\nWallet: 0x1234567890abcdef1234567890abcdef12345678\nTimestamp: ${Date.now()}`,
        });
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // Token Verification
  // ============================================

  describe("GET /auth/verify", () => {
    it("should return 401 without authorization header", async () => {
      const res = await request(app).get("/auth/verify");
      expect(res.status).toBe(401);
    });

    it("should return valid for a good token", async () => {
      const token = generateTestToken({
        sub: "user-123",
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
        type: "consumer",
      });

      const res = await request(app)
        .get("/auth/verify")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.userId).toBe("user-123");
      expect(res.body.type).toBe("consumer");
    });

    it("should return 401 for an invalid token", async () => {
      const res = await request(app)
        .get("/auth/verify")
        .set("Authorization", "Bearer invalid-token");
      expect(res.status).toBe(401);
    });

    it("should return 401 for an expired token", async () => {
      const token = generateExpiredToken({
        sub: "user-123",
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
        type: "consumer",
      });

      const res = await request(app)
        .get("/auth/verify")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // Token Refresh
  // ============================================

  describe("POST /auth/refresh", () => {
    it("should return 401 without authorization header", async () => {
      const res = await request(app).post("/auth/refresh");
      expect(res.status).toBe(401);
    });

    it("should return a new token for a valid token", async () => {
      const token = generateTestToken({
        sub: "user-123",
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
        type: "consumer",
      });

      const res = await request(app)
        .post("/auth/refresh")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe("string");
    });

    it("should refresh a recently expired token", async () => {
      const token = generateExpiredToken({
        sub: "user-123",
        wallet: "0x1234567890abcdef1234567890abcdef12345678",
        type: "consumer",
      });

      const res = await request(app)
        .post("/auth/refresh")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });
  });

  // ============================================
  // 404 Handling
  // ============================================

  describe("404 handling", () => {
    it("should return 404 for unknown routes", async () => {
      const res = await request(app).get("/unknown/route");
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Not Found");
    });
  });
});
