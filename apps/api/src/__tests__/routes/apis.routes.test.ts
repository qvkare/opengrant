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

// Create a thenable chainable mock
const mockDb: any = {};
const chainMethods = [
  "select", "from", "where", "orderBy", "limit", "offset",
  "innerJoin", "insert", "update", "values", "set", "returning", "groupBy",
];
for (const method of chainMethods) {
  mockDb[method] = vi.fn(() => mockDb);
}
// Make the mock thenable - when awaited, shift from queue
mockDb.then = function (resolve: any, reject: any) {
  const result = queryQueue.shift();
  if (result && result.__isError) {
    return reject ? reject(result.error) : Promise.reject(result.error);
  }
  return resolve(result ?? []);
};

vi.mock("@opengrant/database", () => ({
  getDb: vi.fn(() => mockDb),
  apis: { id: "id", slug: "slug", publisherId: "publisher_id", status: "status", name: "name", description: "description", logoUrl: "logo_url", category: "category", tags: "tags", totalCalls: "total_calls", totalRevenue: "total_revenue", publishedAt: "published_at" },
  endpoints: { id: "id", apiId: "api_id", path: "path", method: "method", isActive: "is_active", pricePerCall: "price_per_call", description: "description" },
  publishers: { id: "id", walletAddress: "wallet_address" },
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
}));

const app = createTestApp();

describe("APIs Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryQueue = [];
    // Reset chainable methods
    for (const method of chainMethods) {
      mockDb[method] = vi.fn(() => mockDb);
    }
  });

  // ============================================
  // GET /v1/apis (Public - List APIs)
  // ============================================

  describe("GET /v1/apis", () => {
    it("should return a list of active APIs", async () => {
      const mockApis = [
        {
          id: "api-1",
          slug: "weather-api",
          name: "Weather API",
          description: "Real-time weather data",
          category: "data",
          totalCalls: 1000,
        },
        {
          id: "api-2",
          slug: "ai-api",
          name: "AI API",
          description: "AI inference",
          category: "ai",
          totalCalls: 500,
        },
      ];

      pushQueryResult(mockApis);

      const res = await request(app).get("/v1/apis");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockApis);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.limit).toBe(20);
      expect(res.body.pagination.offset).toBe(0);
    });

    it("should support pagination parameters", async () => {
      pushQueryResult([]);

      const res = await request(app).get("/v1/apis?limit=5&offset=10");
      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.pagination.offset).toBe(10);
    });

    it("should handle database errors gracefully", async () => {
      pushQueryError(new Error("DB error"));

      const res = await request(app).get("/v1/apis");
      expect(res.status).toBe(500);
      expect(res.body.error).toContain("Failed to fetch");
    });
  });

  // ============================================
  // GET /v1/apis/:slug (Public - API Details)
  // ============================================

  describe("GET /v1/apis/:slug", () => {
    it("should return API details with endpoints", async () => {
      const mockApi = {
        id: "api-1",
        slug: "weather-api",
        name: "Weather API",
        description: "Real-time weather data",
        baseUrl: "https://api.weather.com",
        status: "active",
      };
      const mockEndpoints = [
        {
          id: "ep-1",
          path: "/v1/forecast",
          method: "GET",
          pricePerCall: 1000,
          isActive: true,
        },
      ];

      // First query: find API by slug (returns array, destructured as [api])
      pushQueryResult([mockApi]);
      // Second query: find endpoints
      pushQueryResult(mockEndpoints);

      const res = await request(app).get("/v1/apis/weather-api");
      expect(res.status).toBe(200);
      expect(res.body.slug).toBe("weather-api");
      expect(res.body.endpoints).toEqual(mockEndpoints);
    });

    it("should return 404 for non-existent API", async () => {
      pushQueryResult([]); // No API found

      const res = await request(app).get("/v1/apis/nonexistent");
      expect(res.status).toBe(404);
      expect(res.body.error).toContain("not found");
    });
  });

  // ============================================
  // GET /v1/apis/:slug/endpoints (Public)
  // ============================================

  describe("GET /v1/apis/:slug/endpoints", () => {
    it("should return endpoints for an API", async () => {
      const mockEndpoints = [
        { id: "ep-1", path: "/v1/forecast", method: "GET", pricePerCall: 1000 },
        { id: "ep-2", path: "/v1/current", method: "GET", pricePerCall: 500 },
      ];

      // First query: find API
      pushQueryResult([{ id: "api-1" }]);
      // Second query: find endpoints
      pushQueryResult(mockEndpoints);

      const res = await request(app).get("/v1/apis/weather-api/endpoints");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockEndpoints);
    });

    it("should return 404 if API not found", async () => {
      pushQueryResult([]); // No API found

      const res = await request(app).get("/v1/apis/nonexistent/endpoints");
      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // POST /v1/apis (Authenticated - Create API)
  // ============================================

  describe("POST /v1/apis", () => {
    const publisherToken = generateTestToken({
      sub: "publisher-1",
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      type: "publisher",
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app)
        .post("/v1/apis")
        .send({ name: "Test API", slug: "test-api", baseUrl: "https://api.test.com" });
      expect(res.status).toBe(401);
    });

    it("should return 403 for consumer accounts", async () => {
      const consumerToken = generateTestToken({
        sub: "consumer-1",
        wallet: "0xabcdef1234567890abcdef1234567890abcdef12",
        type: "consumer",
      });

      const res = await request(app)
        .post("/v1/apis")
        .set("Authorization", `Bearer ${consumerToken}`)
        .send({ name: "Test API", slug: "test-api", baseUrl: "https://api.test.com" });
      expect(res.status).toBe(403);
    });

    it("should return 400 for invalid payload", async () => {
      const res = await request(app)
        .post("/v1/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({ name: "" }); // Missing required fields
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Validation failed");
    });

    it("should create a new API successfully", async () => {
      const newApi = {
        id: "api-new",
        slug: "test-api",
        name: "Test API",
        baseUrl: "https://api.test.com",
        status: "draft",
      };

      // Query 1: publisher lookup
      pushQueryResult([{ id: "publisher-1" }]);
      // Query 2: slug uniqueness check
      pushQueryResult([]);
      // Query 3: insert returning
      pushQueryResult([newApi]);

      const res = await request(app)
        .post("/v1/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
        });
      expect(res.status).toBe(201);
      expect(res.body.slug).toBe("test-api");
      expect(res.body.status).toBe("draft");
    });

    it("should return 409 for duplicate slug", async () => {
      // Query 1: publisher found
      pushQueryResult([{ id: "publisher-1" }]);
      // Query 2: slug already exists
      pushQueryResult([{ id: "existing-api" }]);

      const res = await request(app)
        .post("/v1/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Test API",
          slug: "existing-slug",
          baseUrl: "https://api.test.com",
        });
      expect(res.status).toBe(409);
    });

    it("should return 403 if not registered as publisher", async () => {
      // Query 1: publisher not found
      pushQueryResult([]);

      const res = await request(app)
        .post("/v1/apis")
        .set("Authorization", `Bearer ${publisherToken}`)
        .send({
          name: "Test API",
          slug: "test-api",
          baseUrl: "https://api.test.com",
        });
      expect(res.status).toBe(403);
    });
  });
});
