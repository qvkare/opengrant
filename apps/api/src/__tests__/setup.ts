import { vi, beforeAll, afterAll, afterEach } from "vitest";

// Mock environment variables before anything loads the config
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/opengrant_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.CHAIN_ID = "84532"; // Base Sepolia
process.env.RPC_URL = "https://sepolia.base.org";
process.env.PLATFORM_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
process.env.JWT_SECRET = "test-jwt-secret-for-testing-only";
process.env.JWT_EXPIRES_IN = "1h";
process.env.X402_FACILITATOR_URL = "https://facilitator.x402.org";

// Mock database module
vi.mock("../db/index.js", () => ({
  db: {
    query: {
      apiKeys: {
        findFirst: vi.fn(),
      },
      consumers: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    from: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
  },
}));

// Mock Redis
vi.mock("ioredis", () => {
  class MockRedis {
    get = vi.fn();
    set = vi.fn();
    setex = vi.fn();
    del = vi.fn();
    incr = vi.fn();
    expire = vi.fn();
    quit = vi.fn();
    on = vi.fn();
    zremrangebyscore = vi.fn();
    multi() {
      const chain: any = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 0],
          [null, 0],
          [null, 1],
          [null, 1],
        ]),
      };
      return chain;
    }
  }
  return { default: MockRedis };
});

// Mock fetch for facilitator calls
global.fetch = vi.fn();

beforeAll(() => {
  // Setup before all tests
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});
