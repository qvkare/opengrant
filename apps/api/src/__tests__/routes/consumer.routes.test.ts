import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, generateTestToken } from "../helpers/testApp.js";

// Import the mocked db
import { db } from "../../db/index.js";

// Mock viem
vi.mock("viem", () => ({
  verifyMessage: vi.fn(),
  createPublicClient: vi.fn(() => ({})),
  http: vi.fn(),
}));

// Mock blockchain service
vi.mock("../../services/blockchain.service.js", () => ({
  getUSDCBalance: vi.fn().mockResolvedValue({ raw: 0n, formatted: "0" }),
  getETHBalance: vi.fn().mockResolvedValue({ raw: 0n, formatted: "0" }),
  getTransactionReceipt: vi.fn().mockResolvedValue({
    status: "success",
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  }),
}));

// Mock redis service
vi.mock("../../services/redis.service.js", () => ({
  createCLISession: vi.fn(),
  getCLISession: vi.fn(),
  completeCLISession: vi.fn(),
  deleteCLISession: vi.fn(),
  initRedis: vi.fn(),
  closeRedis: vi.fn(),
  getRedis: vi.fn(),
}));

const app = createTestApp();

const consumerToken = generateTestToken({
  sub: "consumer-1",
  wallet: "0x1234567890abcdef1234567890abcdef12345678",
  type: "consumer",
});

const publisherToken = generateTestToken({
  sub: "publisher-1",
  wallet: "0xabcdef1234567890abcdef1234567890abcdef12",
  type: "publisher",
});

describe("Consumer Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // Authentication & Authorization
  // ============================================

  describe("Authentication", () => {
    it("should return 401 without token", async () => {
      const res = await request(app).get("/v1/consumer/profile");
      expect(res.status).toBe(401);
    });

    it("should return 403 for publisher accounts", async () => {
      const res = await request(app)
        .get("/v1/consumer/profile")
        .set("Authorization", `Bearer ${publisherToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("consumer access required");
    });
  });

  // ============================================
  // GET /v1/consumer/profile
  // ============================================

  describe("GET /v1/consumer/profile", () => {
    it("should return consumer profile", async () => {
      const mockConsumer = {
        id: "consumer-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        name: "Test Consumer",
        email: "test@example.com",
        creditBalance: "100.000000",
        settings: null,
        createdAt: new Date().toISOString(),
      };

      vi.mocked(db.query.consumers.findFirst).mockResolvedValueOnce(mockConsumer as any);

      const res = await request(app)
        .get("/v1/consumer/profile")
        .set("Authorization", `Bearer ${consumerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("consumer-1");
      expect(res.body.walletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(res.body.creditBalance).toBe("100.000000");
    });

    it("should return 404 if consumer not found", async () => {
      vi.mocked(db.query.consumers.findFirst).mockResolvedValueOnce(undefined as any);

      const res = await request(app)
        .get("/v1/consumer/profile")
        .set("Authorization", `Bearer ${consumerToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // PUT /v1/consumer/profile
  // ============================================

  describe("PUT /v1/consumer/profile", () => {
    it("should update consumer profile", async () => {
      const updatedConsumer = {
        id: "consumer-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        name: "Updated Name",
        email: "updated@example.com",
        creditBalance: "100.000000",
        settings: null,
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(db.returning).mockResolvedValueOnce([updatedConsumer] as any);

      const res = await request(app)
        .put("/v1/consumer/profile")
        .set("Authorization", `Bearer ${consumerToken}`)
        .send({ name: "Updated Name", email: "updated@example.com" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated Name");
      expect(res.body.email).toBe("updated@example.com");
    });

    it("should return 404 if consumer not found during update", async () => {
      vi.mocked(db.returning).mockResolvedValueOnce([] as any);

      const res = await request(app)
        .put("/v1/consumer/profile")
        .set("Authorization", `Bearer ${consumerToken}`)
        .send({ name: "New Name" });
      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // POST /v1/consumer/keys
  // ============================================

  describe("POST /v1/consumer/keys", () => {
    it("should return 400 without name", async () => {
      const res = await request(app)
        .post("/v1/consumer/keys")
        .set("Authorization", `Bearer ${consumerToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Name is required");
    });

    it("should create a new API key", async () => {
      const mockKey = {
        id: "key-1",
        name: "My API Key",
        keyHash: "hash",
        keyPrefix: "og_live_abcd",
        allowedApis: null,
        expiresAt: null,
        createdAt: new Date().toISOString(),
      };

      vi.mocked(db.returning).mockResolvedValueOnce([mockKey] as any);

      const res = await request(app)
        .post("/v1/consumer/keys")
        .set("Authorization", `Bearer ${consumerToken}`)
        .send({ name: "My API Key" });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe("My API Key");
      expect(res.body.key).toBeDefined();
      expect(res.body.key).toMatch(/^og_live_/);
    });
  });

  // ============================================
  // GET /v1/consumer/keys
  // ============================================

  describe("GET /v1/consumer/keys", () => {
    it("should list API keys", async () => {
      const mockKeys = [
        {
          id: "key-1",
          name: "Production Key",
          keyPrefix: "og_live_1234",
          allowedApis: null,
          lastUsedAt: null,
          expiresAt: null,
          createdAt: new Date().toISOString(),
          isActive: true,
        },
      ];

      vi.mocked(db.query as any).apiKeys = {
        findMany: vi.fn().mockResolvedValueOnce(mockKeys),
      };

      const res = await request(app)
        .get("/v1/consumer/keys")
        .set("Authorization", `Bearer ${consumerToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].name).toBe("Production Key");
      // Key hash should not be exposed
      expect(res.body[0].keyHash).toBeUndefined();
    });
  });

  // ============================================
  // DELETE /v1/consumer/keys/:keyId
  // ============================================

  describe("DELETE /v1/consumer/keys/:keyId", () => {
    it("should revoke an API key", async () => {
      vi.mocked(db.returning).mockResolvedValueOnce([{ id: "key-1", isActive: false }] as any);

      const res = await request(app)
        .delete("/v1/consumer/keys/key-1")
        .set("Authorization", `Bearer ${consumerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return 404 for non-existent key", async () => {
      vi.mocked(db.returning).mockResolvedValueOnce([] as any);

      const res = await request(app)
        .delete("/v1/consumer/keys/nonexistent")
        .set("Authorization", `Bearer ${consumerToken}`);
      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // GET /v1/consumer/balance
  // ============================================

  describe("GET /v1/consumer/balance", () => {
    it("should return wallet balance", async () => {
      vi.mocked(db.query.consumers.findFirst).mockResolvedValueOnce({
        id: "consumer-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        creditBalance: "50.500000",
      } as any);

      const res = await request(app)
        .get("/v1/consumer/balance")
        .set("Authorization", `Bearer ${consumerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.walletAddress).toBeDefined();
      expect(res.body.creditBalance).toBe("50.500000");
    });
  });

  // ============================================
  // POST /v1/consumer/credits/add
  // ============================================

  describe("POST /v1/consumer/credits/add", () => {
    it("should return 400 for invalid amount", async () => {
      const res = await request(app)
        .post("/v1/consumer/credits/add")
        .set("Authorization", `Bearer ${consumerToken}`)
        .send({ amount: "0", txHash: "0xabc" });
      expect(res.status).toBe(400);
    });

    it("should return 400 without txHash", async () => {
      const res = await request(app)
        .post("/v1/consumer/credits/add")
        .set("Authorization", `Bearer ${consumerToken}`)
        .send({ amount: "10" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("transaction hash");
    });

    it("should add credits successfully", async () => {
      const validTxHash = "0x" + "a".repeat(64);

      // Mock: txHash uniqueness check (no existing usage)
      vi.mocked(db.limit).mockResolvedValueOnce([] as any);

      vi.mocked(db.query.consumers.findFirst).mockResolvedValueOnce({
        id: "consumer-1",
        creditBalance: "50.000000",
      } as any);

      vi.mocked(db.returning).mockResolvedValueOnce([{
        creditBalance: "60.000000",
      }] as any);

      const res = await request(app)
        .post("/v1/consumer/credits/add")
        .set("Authorization", `Bearer ${consumerToken}`)
        .send({ amount: "10", txHash: validTxHash });
      expect(res.status).toBe(200);
      expect(res.body.previousBalance).toBe("50.000000");
      expect(res.body.added).toBe("10");
      expect(res.body.newBalance).toBe("60.000000");
      expect(res.body.txHash).toBe(validTxHash);
    });
  });
});
