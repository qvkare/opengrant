import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, generateTestToken } from "../helpers/testApp.js";

// Query result queue - each await on the DB chain shifts from this queue
let queryQueue: any[] = [];

function pushQueryResult(result: any) {
  queryQueue.push(result);
}

function pushQueryError(error: Error) {
  queryQueue.push({ __isError: true, error });
}

const chainMethods = [
  "select", "from", "where", "orderBy", "limit", "offset",
  "innerJoin", "insert", "update", "values", "set", "returning", "groupBy",
];

// Mock the DB module with factory function to avoid TDZ
// The mockDb reference is captured inside the factory to avoid hoisting issues
vi.mock("../../db/index.js", () => {
  let mockQueryQueue: any[] = [];

  const mockDb: any = {
    query: {
      publishers: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      apis: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      payments: {
        findMany: vi.fn(),
      },
      withdrawals: {
        findMany: vi.fn(),
      },
    },
  };

  const chainMethods = [
    "select", "from", "where", "orderBy", "limit", "offset",
    "innerJoin", "insert", "update", "values", "set", "returning", "groupBy",
  ];

  for (const method of chainMethods) {
    mockDb[method] = vi.fn(() => mockDb);
  }

  // Make the mock thenable - when awaited, shift from queue
  // Note: Uses the outer queryQueue variable which is shared
  mockDb.then = function (resolve: any, reject: any) {
    // Access queryQueue from outer scope
    const result = queryQueue.shift();
    if (result && result.__isError) {
      return reject ? reject(result.error) : Promise.reject(result.error);
    }
    return resolve(result ?? []);
  };

  return { db: mockDb };
});

// Mock database schema exports
vi.mock("@opengrant/database", () => ({
  publishers: {
    id: "id",
    walletAddress: "wallet_address",
    name: "name",
    email: "email",
    bio: "bio",
    websiteUrl: "website_url",
    githubUsername: "github_username",
    avatarUrl: "avatar_url",
    vaultAddress: "vault_address",
    githubId: "github_id",
    githubVerified: "github_verified",
    githubVerifiedAt: "github_verified_at",
    status: "status",
    verifiedAt: "verified_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  apis: {
    id: "id",
    slug: "slug",
    publisherId: "publisher_id",
    githubRepoId: "github_repo_id",
    status: "status",
    name: "name",
    description: "description",
    baseUrl: "base_url",
    category: "category",
    tags: "tags",
    documentationUrl: "documentation_url",
    logoUrl: "logo_url",
    createdAt: "created_at",
    updatedAt: "updated_at",
    publishedAt: "published_at",
  },
  endpoints: {
    id: "id",
    apiId: "api_id",
    path: "path",
    method: "method",
    isActive: "is_active",
    pricePerCall: "price_per_call",
    description: "description",
    rateLimitPerMinute: "rate_limit_per_minute",
    rateLimitPerHour: "rate_limit_per_hour",
    rateLimitPerDay: "rate_limit_per_day",
    requestSchema: "request_schema",
    responseSchema: "response_schema",
    requiresAuth: "requires_auth",
    updatedAt: "updated_at",
  },
  payments: {
    id: "id",
    publisherId: "publisher_id",
    apiId: "api_id",
    grossAmount: "gross_amount",
    platformFee: "platform_fee",
    netAmount: "net_amount",
    settledAt: "settled_at",
    periodEnd: "period_end",
  },
  withdrawals: {
    id: "id",
    publisherId: "publisher_id",
    amount: "amount",
    destinationAddress: "destination_address",
    destinationChain: "destination_chain",
    status: "status",
    txHash: "tx_hash",
    createdAt: "created_at",
  },
  usageRecords: {
    id: "id",
    apiId: "api_id",
    priceCharged: "price_charged",
    paymentStatus: "payment_status",
    requestTimestamp: "request_timestamp",
    responseTimeMs: "response_time_ms",
  },
  githubRepos: {
    id: "id",
    githubId: "github_id",
    owner: "owner",
    name: "name",
  },
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
  getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
}));

// Mock github service
vi.mock("../../services/github.service.js", () => ({
  getAuthenticatedUser: vi.fn(),
  listUserRepos: vi.fn(),
  getRepoByOwnerName: vi.fn(),
  verifyRepoOwnership: vi.fn(),
}));

const app = createTestApp();

// Import the mocked db to use in tests
let mockDb: any;

describe("Publisher Routes", () => {
  const publisherToken = generateTestToken({
    sub: "pub-1",
    wallet: "0x1234567890abcdef1234567890abcdef12345678",
    type: "publisher",
  });

  const consumerToken = generateTestToken({
    sub: "consumer-1",
    wallet: "0xabcdef1234567890abcdef1234567890abcdef12",
    type: "consumer",
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    queryQueue = [];

    // Import the mocked module to get mockDb reference
    const dbModule = await import("../../db/index.js");
    mockDb = dbModule.db;

    // Reset query functions
    mockDb.query.publishers.findFirst.mockImplementation(() => {
      const result = queryQueue.shift();
      if (result && result.__isError) {
        throw result.error;
      }
      return Promise.resolve(result ?? null);
    });

    mockDb.query.apis.findFirst.mockImplementation(() => {
      const result = queryQueue.shift();
      if (result && result.__isError) {
        throw result.error;
      }
      return Promise.resolve(result ?? null);
    });

    mockDb.query.apis.findMany.mockImplementation(() => {
      const result = queryQueue.shift();
      if (result && result.__isError) {
        throw result.error;
      }
      return Promise.resolve(result ?? []);
    });

    mockDb.query.payments.findMany.mockImplementation(() => {
      const result = queryQueue.shift();
      if (result && result.__isError) {
        throw result.error;
      }
      return Promise.resolve(result ?? []);
    });

    mockDb.query.withdrawals.findMany.mockImplementation(() => {
      const result = queryQueue.shift();
      if (result && result.__isError) {
        throw result.error;
      }
      return Promise.resolve(result ?? []);
    });

    // Reset chainable methods
    for (const method of chainMethods) {
      mockDb[method] = vi.fn(() => mockDb);
    }
  });

  // ============================================
  // GET /v1/publisher/profile
  // ============================================

  describe("GET /v1/publisher/profile", () => {
    it("should return existing publisher profile", async () => {
      const mockPublisher = {
        id: "pub-1",
        name: "Test Publisher",
        email: "test@publisher.com",
        bio: "Test bio",
        websiteUrl: "https://test.com",
        githubUsername: "testuser",
        avatarUrl: "https://avatar.com/test.png",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        vaultAddress: "0xvault1234567890abcdef1234567890abcdef12",
        status: "active",
        verifiedAt: new Date("2024-01-01"),
        createdAt: new Date("2024-01-01"),
      };

      // Query 1: findFirst returns existing publisher
      pushQueryResult(mockPublisher);

      const res = await request(app)
        .get("/v1/publisher/profile")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("pub-1");
      expect(res.body.name).toBe("Test Publisher");
      expect(res.body.walletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
    });

    it("should create new publisher when not found", async () => {
      const newPublisher = {
        id: "pub-new",
        name: "Publisher 0x123456",
        email: null,
        bio: null,
        websiteUrl: null,
        githubUsername: null,
        avatarUrl: null,
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        vaultAddress: null,
        status: "pending",
        verifiedAt: null,
        createdAt: new Date("2024-01-01"),
      };

      // Query 1: findFirst returns null (publisher doesn't exist)
      pushQueryResult(null);
      // Query 2: insert.returning returns new publisher
      pushQueryResult([newPublisher]);

      const res = await request(app)
        .get("/v1/publisher/profile")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("pub-new");
      expect(res.body.status).toBe("pending");
      expect(res.body.walletAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/v1/publisher/profile");
      expect(res.status).toBe(401);
    });

    it("should return 403 for consumer accounts", async () => {
      const res = await request(app)
        .get("/v1/publisher/profile")
        .set("Authorization", `Bearer ${consumerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("publisher access required");
    });

    it("should handle database errors gracefully", async () => {
      pushQueryError(new Error("DB error"));

      const res = await request(app)
        .get("/v1/publisher/profile")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(500);
      expect(res.body.error).toContain("Failed to get profile");
    });
  });

  // ============================================
  // PUT /v1/publisher/profile
  // ============================================

  describe("PUT /v1/publisher/profile", () => {
    it("should update profile successfully", async () => {
      const updated = {
        id: "pub-1",
        name: "Updated Publisher",
        email: "updated@test.com",
        bio: "Updated bio",
        websiteUrl: "https://updated.com",
        githubUsername: "updateduser",
        avatarUrl: "https://avatar.com/updated.png",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        vaultAddress: "0xvault1234567890abcdef1234567890abcdef12",
        status: "active",
        updatedAt: new Date("2024-01-02"),
      };

      // Query 1: findFirst for githubUsername change check (githubVerified: false, so change is allowed)
      pushQueryResult({
        id: "pub-1",
        githubVerified: false,
        githubUsername: "olduser",
      });

      // Query 2: update.returning returns updated publisher
      pushQueryResult([updated]);

      const res = await request(app)
        .put("/v1/publisher/profile")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Updated Publisher",
          email: "updated@test.com",
          bio: "Updated bio",
          websiteUrl: "https://updated.com",
          githubUsername: "updateduser",
          avatarUrl: "https://avatar.com/updated.png",
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated Publisher");
      expect(res.body.email).toBe("updated@test.com");
    });

    it("should return 404 when publisher not found", async () => {
      // Query 1: update.returning returns empty array
      pushQueryResult([]);

      const res = await request(app)
        .put("/v1/publisher/profile")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({ name: "Test" });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Publisher not found");
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app)
        .put("/v1/publisher/profile")
        .send({ name: "Test" });
      expect(res.status).toBe(401);
    });

    it("should return 403 for consumer accounts", async () => {
      const res = await request(app)
        .put("/v1/publisher/profile")
        .set("Authorization", `Bearer ${consumerToken}`)
        .send({ name: "Test" });
      expect(res.status).toBe(403);
    });
  });

  // ============================================
  // GET /v1/publisher/apis
  // ============================================

  describe("GET /v1/publisher/apis", () => {
    it("should return publisher's APIs with endpoints", async () => {
      const mockPublisher = { id: "pub-1" };
      const mockApis = [
        {
          id: "api-1",
          name: "Weather API",
          slug: "weather-api",
          endpoints: [
            { id: "ep-1", path: "/forecast", method: "GET", pricePerCall: 1000 },
          ],
        },
        {
          id: "api-2",
          name: "AI API",
          slug: "ai-api",
          endpoints: [
            { id: "ep-2", path: "/inference", method: "POST", pricePerCall: 5000 },
          ],
        },
      ];

      // Query 1: findFirst returns publisher
      pushQueryResult(mockPublisher);
      // Query 2: findMany returns APIs with endpoints
      pushQueryResult(mockApis);

      const res = await request(app)
        .get("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe("Weather API");
      expect(res.body[0].endpoints).toHaveLength(1);
      expect(res.body[1].name).toBe("AI API");
    });

    it("should return empty array when no APIs", async () => {
      const mockPublisher = { id: "pub-1" };

      // Query 1: findFirst returns publisher
      pushQueryResult(mockPublisher);
      // Query 2: findMany returns empty array
      pushQueryResult([]);

      const res = await request(app)
        .get("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("should return 404 when publisher not found", async () => {
      // Query 1: findFirst returns null
      pushQueryResult(null);

      const res = await request(app)
        .get("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Publisher not found");
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/v1/publisher/apis");
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // POST /v1/publisher/apis
  // ============================================

  describe("POST /v1/publisher/apis", () => {
    it("should create new API successfully", async () => {
      const mockPublisher = { id: "pub-1" };
      const createdApi = {
        id: "api-new",
        publisherId: "pub-1",
        name: "Test API",
        slug: "test-api",
        description: "Test description",
        baseUrl: "https://api.test.com",
        category: "data",
        tags: ["test"],
        status: "draft",
        endpoints: [
          {
            id: "ep-new",
            apiId: "api-new",
            path: "/test",
            method: "GET",
            pricePerCall: 100,
            isActive: true,
          },
        ],
      };

      // Query 1: findFirst returns publisher
      pushQueryResult(mockPublisher);
      // Query 2: findFirst returns null (slug doesn't exist)
      pushQueryResult(null);
      // Query 3: insert.returning returns new API
      pushQueryResult([{ id: "api-new", slug: "test-api", status: "draft" }]);
      // Query 4: endpoints insert (thenable chain needs result)
      pushQueryResult([{ id: "ep-new", apiId: "api-new", path: "/test" }]);
      // Query 5: findFirst returns created API with endpoints
      pushQueryResult(createdApi);

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Test API",
          slug: "test-api",
          description: "Test description",
          baseUrl: "https://api.test.com",
          category: "data",
          tags: ["test"],
          endpoints: [
            {
              path: "/test",
              method: "GET",
              pricePerCall: 100,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("api-new");
      expect(res.body.slug).toBe("test-api");
      expect(res.body.status).toBe("draft");
      expect(res.body.endpoints).toHaveLength(1);
    });

    it("should validate required fields", async () => {
      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          description: "Missing name, slug, and baseUrl",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Name, slug, and baseUrl are required");
    });

    it("should return 404 when publisher not found", async () => {
      // Query 1: findFirst returns null
      pushQueryResult(null);

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Publisher not found");
    });

    it("should return 409 for duplicate slug", async () => {
      const mockPublisher = { id: "pub-1" };
      const existingApi = { id: "api-existing", slug: "test-api" };

      // Query 1: findFirst returns publisher
      pushQueryResult(mockPublisher);
      // Query 2: findFirst returns existing API with same slug
      pushQueryResult(existingApi);

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("Slug already exists");
    });

    it("should reject negative pricePerCall on endpoints", async () => {
      // Price validation now happens upfront before any DB writes
      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
          endpoints: [
            {
              path: "/test",
              method: "GET",
              pricePerCall: -100,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Price per call cannot be negative");
    });

    it("should reject invalid slug format", async () => {
      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Test API",
          slug: "INVALID_SLUG!",
          baseUrl: "https://api.test.com",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid slug format");
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app)
        .post("/v1/publisher/apis")
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
        });
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // GET /v1/publisher/earnings
  // ============================================

  describe("GET /v1/publisher/earnings", () => {
    it("should return earnings summary", async () => {
      const mockPublisher = { id: "pub-1" };
      const mockApis = [{ id: "api-1" }];

      // Query 1: findFirst returns publisher
      pushQueryResult(mockPublisher);
      // Query 2: select totals (grossAmount, platformFee, netAmount)
      pushQueryResult([{ grossTotal: "10000", feeTotal: "1000", netTotal: "9000" }]);
      // Query 3: select total withdrawals
      pushQueryResult([{ total: "5000" }]);
      // Query 4: findMany publisher APIs
      pushQueryResult(mockApis);
      // Query 5: select pending balance from usage records
      pushQueryResult([{ total: "2000" }]);
      // Query 6: findMany recent payments
      pushQueryResult([
        {
          apiId: "api-1",
          grossAmount: "1000",
          settledAt: new Date("2024-01-01"),
        },
      ]);
      // Query 7: findFirst for API name
      pushQueryResult({ name: "Test API" });
      // Query 8: findMany recent withdrawals
      pushQueryResult([
        {
          id: "w-1",
          amount: "5000",
          txHash: "0xabcd",
          status: "completed",
          createdAt: new Date("2024-01-01"),
        },
      ]);

      const res = await request(app)
        .get("/v1/publisher/earnings")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.grossEarnings).toBe("10000");
      expect(res.body.platformFees).toBe("1000");
      expect(res.body.netEarnings).toBe("9000");
      expect(res.body.totalWithdrawn).toBe("5000");
      expect(res.body.availableBalance).toBe("4000");
      expect(res.body.pendingBalance).toBe("2000");
      expect(res.body.recentPayments).toHaveLength(1);
      expect(res.body.withdrawals).toHaveLength(1);
    });

    it("should return 404 when publisher not found", async () => {
      // Query 1: findFirst returns null
      pushQueryResult(null);

      const res = await request(app)
        .get("/v1/publisher/earnings")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Publisher not found");
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/v1/publisher/earnings");
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // GET /v1/publisher/analytics
  // ============================================

  describe("GET /v1/publisher/analytics", () => {
    it("should return analytics data for default period (30d)", async () => {
      const mockPublisher = { id: "pub-1" };
      const mockApis = [
        { id: "api-1", name: "Weather API", slug: "weather-api" },
        { id: "api-2", name: "AI API", slug: "ai-api" },
      ];

      // Query 1: findFirst returns publisher
      pushQueryResult(mockPublisher);
      // Query 2: findMany returns APIs
      pushQueryResult(mockApis);
      // Query 3: select totals
      pushQueryResult([{ totalCalls: 1000, totalRevenue: "50000", avgResponseTime: 250 }]);
      // Query 4: select by API
      pushQueryResult([
        { apiId: "api-1", calls: 600, revenue: "30000", avgResponseTime: 200 },
        { apiId: "api-2", calls: 400, revenue: "20000", avgResponseTime: 300 },
      ]);
      // Query 5: select daily stats
      pushQueryResult([
        { date: "2024-01-01", calls: 100, revenue: "5000" },
        { date: "2024-01-02", calls: 150, revenue: "7500" },
      ]);

      const res = await request(app)
        .get("/v1/publisher/analytics")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalCalls).toBe(1000);
      expect(res.body.totalRevenue).toBe("50000");
      expect(res.body.avgResponseTime).toBe(250);
      expect(res.body.byApi).toHaveLength(2);
      expect(res.body.byApi[0].apiName).toBe("Weather API");
      expect(res.body.daily).toHaveLength(2);
      expect(res.body.period.days).toBe(30);
    });

    it("should support period parameter (7d)", async () => {
      const mockPublisher = { id: "pub-1" };
      const mockApis = [{ id: "api-1", name: "Test API", slug: "test-api" }];

      // Query 1: findFirst returns publisher
      pushQueryResult(mockPublisher);
      // Query 2: findMany returns APIs
      pushQueryResult(mockApis);
      // Query 3: select totals
      pushQueryResult([{ totalCalls: 500, totalRevenue: "25000", avgResponseTime: 200 }]);
      // Query 4: select by API
      pushQueryResult([{ apiId: "api-1", calls: 500, revenue: "25000", avgResponseTime: 200 }]);
      // Query 5: select daily stats
      pushQueryResult([{ date: "2024-01-01", calls: 100, revenue: "5000" }]);

      const res = await request(app)
        .get("/v1/publisher/analytics?period=7d")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.period.days).toBe(7);
    });

    it("should return empty data when publisher has no APIs", async () => {
      const mockPublisher = { id: "pub-1" };

      // Query 1: findFirst returns publisher
      pushQueryResult(mockPublisher);
      // Query 2: findMany returns empty array
      pushQueryResult([]);

      const res = await request(app)
        .get("/v1/publisher/analytics")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalCalls).toBe(0);
      expect(res.body.totalRevenue).toBe("0");
      expect(res.body.byApi).toEqual([]);
      expect(res.body.daily).toEqual([]);
    });

    it("should return 404 when publisher not found", async () => {
      // Query 1: findFirst returns null
      pushQueryResult(null);

      const res = await request(app)
        .get("/v1/publisher/analytics")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Publisher not found");
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/v1/publisher/analytics");
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // POST /v1/publisher/withdraw
  // ============================================

  describe("POST /v1/publisher/withdraw", () => {
    it("should create withdrawal request successfully", async () => {
      const mockPublisher = { id: "pub-1" };
      const newWithdrawal = {
        id: "w-new",
        publisherId: "pub-1",
        amount: "1000000",
        destinationAddress: "0xdest1234567890abcdef1234567890abcdef12",
        destinationChain: "base",
        status: "pending",
        createdAt: new Date("2024-01-01"),
      };

      // Query 1: findFirst returns publisher
      pushQueryResult(mockPublisher);
      // Query 2: insert.returning returns new withdrawal
      pushQueryResult([newWithdrawal]);

      const res = await request(app)
        .post("/v1/publisher/withdraw")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          amount: "1000000",
          destinationAddress: "0xdest1234567890abcdef1234567890abcdef12",
          destinationChain: "base",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("w-new");
      expect(res.body.amount).toBe("1000000");
      expect(res.body.status).toBe("pending");
    });

    it("should validate amount", async () => {
      const res1 = await request(app)
        .post("/v1/publisher/withdraw")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          destinationAddress: "0xdest1234567890abcdef1234567890abcdef12",
        });

      expect(res1.status).toBe(400);
      expect(res1.body.error).toContain("Invalid amount");

      const res2 = await request(app)
        .post("/v1/publisher/withdraw")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          amount: "0",
          destinationAddress: "0xdest1234567890abcdef1234567890abcdef12",
        });

      expect(res2.status).toBe(400);
      expect(res2.body.error).toContain("Invalid amount");

      const res3 = await request(app)
        .post("/v1/publisher/withdraw")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          amount: "-1000",
          destinationAddress: "0xdest1234567890abcdef1234567890abcdef12",
        });

      expect(res3.status).toBe(400);
      expect(res3.body.error).toContain("Invalid amount");
    });

    it("should require destination address", async () => {
      const res = await request(app)
        .post("/v1/publisher/withdraw")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          amount: "1000000",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Destination address is required");
    });

    it("should return 404 when publisher not found", async () => {
      // Query 1: findFirst returns null
      pushQueryResult(null);

      const res = await request(app)
        .post("/v1/publisher/withdraw")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          amount: "1000000",
          destinationAddress: "0xdest1234567890abcdef1234567890abcdef12",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Publisher not found");
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app)
        .post("/v1/publisher/withdraw")
        .send({
          amount: "1000000",
          destinationAddress: "0xdest1234567890abcdef1234567890abcdef12",
        });
      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // POST /v1/publisher/verify-github
  // ============================================

  describe("POST /v1/publisher/verify-github", () => {
    let mockGithubService: any;

    beforeEach(async () => {
      mockGithubService = await import("../../services/github.service.js");
    });

    it("should verify github successfully", async () => {
      // Query 1: findFirst returns publisher
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: false,
        githubId: null,
        githubUsername: null,
        avatarUrl: null,
      });

      mockGithubService.getAuthenticatedUser.mockResolvedValueOnce({
        id: 12345,
        login: "testuser",
        avatar_url: "https://avatar.url",
        name: "Test",
        bio: null,
      });

      // Query 2: findFirst for existing githubId check -> null
      pushQueryResult(null);

      // Query 3: update returning
      pushQueryResult([{
        id: "pub-1",
        githubId: 12345,
        githubUsername: "testuser",
        githubVerified: true,
        githubVerifiedAt: new Date(),
      }]);

      const res = await request(app)
        .post("/v1/publisher/verify-github")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx");

      expect(res.status).toBe(200);
      expect(res.body.githubVerified).toBe(true);
      expect(res.body.githubUsername).toBe("testuser");
    });

    it("should return 400 without X-GitHub-Token header", async () => {
      const res = await request(app)
        .post("/v1/publisher/verify-github")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("X-GitHub-Token");
    });

    it("should return 400 for invalid github token format", async () => {
      const res = await request(app)
        .post("/v1/publisher/verify-github")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_short");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid GitHub token format");
    });

    it("should return 401 for invalid github token", async () => {
      // Query 1: findFirst returns publisher
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: false,
        githubId: null,
      });

      mockGithubService.getAuthenticatedUser.mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/v1/publisher/verify-github")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_invalidtokenformat0123456789abcdefABCD");

      expect(res.status).toBe(401);
      expect(res.body.error).toContain("Invalid GitHub token");
    });

    it("should return idempotent response when already verified with same id", async () => {
      // Query 1: findFirst returns already-verified publisher
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: true,
        githubId: 12345,
        githubUsername: "testuser",
        githubVerifiedAt: new Date(),
      });

      mockGithubService.getAuthenticatedUser.mockResolvedValueOnce({
        id: 12345,
        login: "testuser",
        avatar_url: "https://avatar.url",
        name: "Test",
        bio: null,
      });

      const res = await request(app)
        .post("/v1/publisher/verify-github")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx");

      expect(res.status).toBe(200);
      expect(res.body.githubVerified).toBe(true);
    });

    it("should return 409 when github id already taken by another publisher", async () => {
      // Query 1: findFirst returns publisher
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: false,
        githubId: null,
      });

      mockGithubService.getAuthenticatedUser.mockResolvedValueOnce({
        id: 12345,
        login: "testuser",
        avatar_url: "https://avatar.url",
        name: "Test",
        bio: null,
      });

      // Query 2: findFirst for existing githubId check -> another publisher
      pushQueryResult({
        id: "pub-other",
        githubId: 12345,
      });

      const res = await request(app)
        .post("/v1/publisher/verify-github")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx");

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already linked");
    });
  });

  // ============================================
  // GET /v1/publisher/github-repos
  // ============================================

  describe("GET /v1/publisher/github-repos", () => {
    let mockGithubService: any;

    beforeEach(async () => {
      mockGithubService = await import("../../services/github.service.js");
    });

    it("should return repos for verified publisher", async () => {
      // Query 1: findFirst returns verified publisher
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: true,
      });

      mockGithubService.listUserRepos.mockResolvedValueOnce([
        { githubId: 100, owner: "testuser", name: "repo1", fullName: "testuser/repo1", description: "Test", language: "TS", stars: 50 },
      ]);

      const res = await request(app)
        .get("/v1/publisher/github-repos")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].fullName).toBe("testuser/repo1");
    });

    it("should return 400 without X-GitHub-Token header", async () => {
      const res = await request(app)
        .get("/v1/publisher/github-repos")
        .set("Authorization", `Bearer ${publisherToken}`);

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid PAT format", async () => {
      const res = await request(app)
        .get("/v1/publisher/github-repos")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_short");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid GitHub token format");
    });

    it("should return 403 for unverified publisher", async () => {
      // Query 1: findFirst returns unverified publisher
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: false,
      });

      const res = await request(app)
        .get("/v1/publisher/github-repos")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx");

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("verification required");
    });
  });

  // ============================================
  // POST /v1/publisher/apis + githubRepo
  // ============================================

  describe("POST /v1/publisher/apis with githubRepo", () => {
    let mockGithubService: any;

    beforeEach(async () => {
      mockGithubService = await import("../../services/github.service.js");
    });

    it("should create API with github repo link", async () => {
      // Query 1: findFirst publisher
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: true,
        githubId: 12345,
      });

      // Query 2: findFirst existing slug check -> null
      pushQueryResult(null);

      // PAT identity check
      mockGithubService.getAuthenticatedUser.mockResolvedValueOnce({
        id: 12345,
        login: "testuser",
        avatar_url: "https://avatar.url",
        name: "Test",
        bio: null,
      });

      // GitHub repo lookup
      mockGithubService.getRepoByOwnerName.mockResolvedValueOnce({
        id: "repo-uuid-1",
        githubId: 100,
        owner: "testuser",
        name: "my-api",
      });

      // Verify ownership
      mockGithubService.verifyRepoOwnership.mockResolvedValueOnce(true);

      // Query 3: insert API returning
      pushQueryResult([{
        id: "api-1",
        name: "Test API",
        slug: "test-api",
        githubRepoId: "repo-uuid-1",
        status: "draft",
      }]);

      // Query 4: findFirst for created API with endpoints
      pushQueryResult({
        id: "api-1",
        name: "Test API",
        slug: "test-api",
        githubRepoId: "repo-uuid-1",
        status: "draft",
        endpoints: [],
      });

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx")
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
          githubRepo: "testuser/my-api",
        });

      expect(res.status).toBe(201);
    });

    it("should return 403 when unverified publisher tries to link repo", async () => {
      // Query 1: findFirst publisher (unverified)
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: false,
      });

      // Query 2: findFirst existing slug check -> null
      pushQueryResult(null);

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx")
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
          githubRepo: "testuser/my-api",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("GitHub verification required");
    });

    it("should return 403 when not admin on repo", async () => {
      // Query 1: findFirst publisher (verified)
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: true,
        githubId: 12345,
      });

      // Query 2: findFirst existing slug check -> null
      pushQueryResult(null);

      // PAT identity check
      mockGithubService.getAuthenticatedUser.mockResolvedValueOnce({
        id: 12345, login: "testuser", avatar_url: "", name: "Test", bio: null,
      });

      mockGithubService.getRepoByOwnerName.mockResolvedValueOnce({
        id: "repo-uuid-1",
        githubId: 100,
      });
      mockGithubService.verifyRepoOwnership.mockResolvedValueOnce(false);

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx")
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
          githubRepo: "testuser/my-api",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Admin access required");
    });

    it("should return 404 when repo not found", async () => {
      // Query 1: findFirst publisher (verified)
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: true,
        githubId: 12345,
      });

      // Query 2: findFirst existing slug check -> null
      pushQueryResult(null);

      // PAT identity check
      mockGithubService.getAuthenticatedUser.mockResolvedValueOnce({
        id: 12345, login: "testuser", avatar_url: "", name: "Test", bio: null,
      });

      mockGithubService.getRepoByOwnerName.mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx")
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
          githubRepo: "testuser/nonexistent",
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("repository not found");
    });

    it("should return 400 for invalid githubRepo format", async () => {
      // Query 1: findFirst publisher (verified)
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: true,
        githubId: 12345,
      });

      // Query 2: findFirst existing slug check -> null
      pushQueryResult(null);

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx")
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
          githubRepo: "invalid-format",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid githubRepo format");
    });

    it("should create API without githubRepo (existing behavior)", async () => {
      // Query 1: findFirst publisher
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: false,
      });

      // Query 2: findFirst existing slug check -> null
      pushQueryResult(null);

      // Query 3: insert returning
      pushQueryResult([{
        id: "api-1",
        name: "Test API",
        slug: "test-api",
        status: "draft",
      }]);

      // Query 4: findFirst for created API
      pushQueryResult({
        id: "api-1",
        name: "Test API",
        slug: "test-api",
        status: "draft",
        endpoints: [],
      });

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
        });

      expect(res.status).toBe(201);
    });

    it("should return 403 when PAT identity does not match publisher", async () => {
      // Query 1: findFirst publisher (verified with githubId 12345)
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: true,
        githubId: 12345,
      });

      // Query 2: findFirst existing slug check -> null
      pushQueryResult(null);

      // PAT identity check returns DIFFERENT githubId
      mockGithubService.getAuthenticatedUser.mockResolvedValueOnce({
        id: 99999,
        login: "someoneelse",
        avatar_url: "",
        name: "Someone",
        bio: null,
      });

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .set("X-GitHub-Token", "ghp_testauthtoken0123456789abcdefABCDEFxx")
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
          githubRepo: "testuser/my-api",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("does not match verified identity");
    });

    it("should return 400 when githubRepo requires missing X-GitHub-Token", async () => {
      // Query 1: findFirst publisher (verified)
      pushQueryResult({
        id: "pub-1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        githubVerified: true,
      });

      // Query 2: findFirst existing slug check -> null
      pushQueryResult(null);

      const res = await request(app)
        .post("/v1/publisher/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
          githubRepo: "testuser/my-api",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("X-GitHub-Token");
    });
  });
});
