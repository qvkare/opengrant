import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Use vi.hoisted so these are available in vi.mock factories
const { queryQueue, pushQueryResult, pushQueryError, mockDb, chainMethods } = vi.hoisted(() => {
  const queryQueue: any[] = [];
  function pushQueryResult(result: any) { queryQueue.push(result); }
  function pushQueryError(error: Error) { queryQueue.push({ __isError: true, error }); }

  const chainMethods = [
    "select", "from", "where", "orderBy", "limit", "offset",
    "innerJoin", "insert", "update", "values", "set", "returning",
    "groupBy", "onConflictDoUpdate",
  ];
  const mockDb: any = {};
  for (const method of chainMethods) {
    mockDb[method] = vi.fn(() => mockDb);
  }
  mockDb.then = function (resolve: any, reject: any) {
    const result = queryQueue.shift();
    if (result && result.__isError) {
      return reject ? reject(result.error) : Promise.reject(result.error);
    }
    return resolve(result ?? []);
  };
  mockDb.query = {
    githubRepos: { findFirst: vi.fn(), findMany: vi.fn() },
    fundDonations: { findFirst: vi.fn() },
    dependencyAnalyses: { findFirst: vi.fn() },
    apiKeys: { findFirst: vi.fn() },
    consumers: { findFirst: vi.fn() },
  };

  return { queryQueue, pushQueryResult, pushQueryError, mockDb, chainMethods };
});

vi.mock("../../db/index.js", () => ({
  db: mockDb,
}));

vi.mock("@opengrant/database", () => ({
  githubRepos: {
    id: "id", githubId: "github_id", owner: "owner", name: "name",
    fullName: "full_name", repoHash: "repo_hash", language: "language",
    stars: "stars", totalFunded: "total_funded", donorCount: "donor_count",
    claimStatus: "claim_status", description: "description",
  },
  fundDonations: {
    id: "id", repoId: "repo_id", donorWallet: "donor_wallet",
    amount: "amount", txHash: "tx_hash", chainId: "chain_id",
    status: "status", source: "source", createdAt: "created_at",
    redistributeOnTimeout: "redistribute_on_timeout",
    refundEligibleAt: "refund_eligible_at",
  },
  dependencyAnalyses: {
    id: "id", requestedBy: "requested_by", packageManager: "package_manager",
    inputHash: "input_hash", executedTxHash: "executed_tx_hash",
  },
  consumers: { id: "id", walletAddress: "wallet_address" },
  apiKeys: { id: "id", keyHash: "key_hash", consumerId: "consumer_id" },
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    verifyMessage: vi.fn(),
    createPublicClient: vi.fn(() => ({})),
    http: vi.fn(),
  };
});

vi.mock("../../services/blockchain.service.js", () => ({
  getUSDCBalance: vi.fn().mockResolvedValue({ raw: 0n, formatted: "0" }),
  getETHBalance: vi.fn().mockResolvedValue({ raw: 0n, formatted: "0" }),
  getTransactionReceipt: vi.fn().mockResolvedValue({
    status: "success",
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  }),
}));

vi.mock("../../services/github.service.js", () => ({
  searchRepos: vi.fn().mockResolvedValue({
    data: [],
    pagination: { limit: 20, offset: 0, total: 0 },
  }),
  getRepoByOwnerName: vi.fn(),
  computeRepoHash: vi.fn().mockReturnValue("0xabcdef"),
  verifyRepoOwnership: vi.fn(),
}));

vi.mock("../../services/dependency.service.js", () => ({
  analyzePackageJson: vi.fn(),
  analyzeCargoToml: vi.fn(),
  analyzeGoMod: vi.fn(),
  scoreDependencies: vi.fn().mockReturnValue([]),
  computeDistribution: vi.fn().mockReturnValue([]),
}));

vi.mock("../../services/escrow.service.js", () => ({
  signClaimAuthorization: vi.fn().mockResolvedValue("0xsignature"),
  getEscrowRepoInfo: vi.fn().mockRejectedValue(new Error("Not configured")),
}));

vi.mock("../../services/redis.service.js", () => ({
  initRedis: vi.fn(),
  closeRedis: vi.fn(),
  getRedis: vi.fn(),
}));

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
      return {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[null, 0], [null, 0], [null, 1], [null, 1]]),
      };
    }
  }
  return { default: MockRedis };
});

// Import after mocks
import fundRoutes from "../../routes/v1/fund.routes.js";
import { searchRepos, getRepoByOwnerName, verifyRepoOwnership } from "../../services/github.service.js";
import { analyzePackageJson } from "../../services/dependency.service.js";
import { getTransactionReceipt } from "../../services/blockchain.service.js";

function createFundTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/fund", fundRoutes);
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "Not Found" });
  });
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

const app = createFundTestApp();

function generateTestToken(payload: {
  sub: string;
  wallet: string;
  type: "consumer" | "publisher";
}): string {
  return jwt.sign(payload, "test-jwt-secret-for-testing-only", { expiresIn: "1h" });
}

const testToken = generateTestToken({
  sub: "user-1",
  wallet: "0x1234567890abcdef1234567890abcdef12345678",
  type: "consumer",
});

describe("Fund Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryQueue.length = 0;
    for (const method of chainMethods) {
      mockDb[method] = vi.fn(() => mockDb);
    }
  });

  // ============================================
  // GET /v1/fund/repos
  // ============================================

  describe("GET /v1/fund/repos", () => {
    it("should return paginated repos", async () => {
      const mockRepos = [
        { id: "r1", owner: "facebook", name: "react", stars: 200000 },
      ];
      vi.mocked(searchRepos).mockResolvedValueOnce({
        data: mockRepos as any,
        pagination: { limit: 20, offset: 0, total: 1 },
      });

      const res = await request(app).get("/v1/fund/repos");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockRepos);
      expect(res.body.pagination.total).toBe(1);
    });

    it("should pass language filter", async () => {
      vi.mocked(searchRepos).mockResolvedValueOnce({
        data: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      });

      await request(app).get("/v1/fund/repos?language=Rust&sort=funded");
      expect(searchRepos).toHaveBeenCalledWith(
        expect.objectContaining({ language: "Rust", sort: "funded" })
      );
    });

    it("should enforce bounds on limit and offset", async () => {
      vi.mocked(searchRepos).mockResolvedValueOnce({
        data: [],
        pagination: { limit: 100, offset: 0, total: 0 },
      });

      await request(app).get("/v1/fund/repos?limit=9999&offset=-5");
      expect(searchRepos).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100, offset: 0 })
      );
    });
  });

  // ============================================
  // GET /v1/fund/repos/:owner/:name
  // ============================================

  describe("GET /v1/fund/repos/:owner/:name", () => {
    it("should return repo details", async () => {
      const mockRepo = {
        id: "r1",
        owner: "facebook",
        name: "react",
        fullName: "facebook/react",
        stars: 200000,
        repoHash: "0xabcdef",
      };
      vi.mocked(getRepoByOwnerName).mockResolvedValueOnce(mockRepo as any);

      const res = await request(app).get("/v1/fund/repos/facebook/react");
      expect(res.status).toBe(200);
      expect(res.body.owner).toBe("facebook");
      expect(res.body.name).toBe("react");
    });

    it("should return 404 for unknown repo", async () => {
      vi.mocked(getRepoByOwnerName).mockResolvedValueOnce(null);

      const res = await request(app).get("/v1/fund/repos/unknown/repo");
      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // GET /v1/fund/repos/:owner/:name/donors
  // ============================================

  describe("GET /v1/fund/repos/:owner/:name/donors", () => {
    it("should return donor list", async () => {
      mockDb.query.githubRepos.findFirst.mockResolvedValueOnce({
        id: "r1",
        owner: "facebook",
        name: "react",
      });
      // Donations query
      pushQueryResult([
        { donorWallet: "0xabc...", amount: "10", txHash: "0x123", createdAt: new Date() },
      ]);
      // Count query
      pushQueryResult([{ count: 1 }]);

      const res = await request(app).get("/v1/fund/repos/facebook/react/donors");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it("should return 404 for unknown repo", async () => {
      mockDb.query.githubRepos.findFirst.mockResolvedValueOnce(null);

      const res = await request(app).get("/v1/fund/repos/unknown/repo/donors");
      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // GET /v1/fund/stats
  // ============================================

  describe("GET /v1/fund/stats", () => {
    it("should return global stats", async () => {
      pushQueryResult([{ totalFunded: "1000", totalClaimed: "500", repoCount: 10 }]);
      pushQueryResult([{ donorCount: 50, donationCount: 200 }]);

      const res = await request(app).get("/v1/fund/stats");
      expect(res.status).toBe(200);
      expect(res.body.totalFunded).toBe("1000");
      expect(res.body.donorCount).toBe(50);
    });
  });

  // ============================================
  // POST /v1/fund/donate
  // ============================================

  describe("POST /v1/fund/donate", () => {
    it("should record a valid donation", async () => {
      mockDb.query.fundDonations.findFirst.mockResolvedValueOnce(null);
      mockDb.query.githubRepos.findFirst.mockResolvedValueOnce({
        id: "r1",
        owner: "facebook",
        name: "react",
      });

      const donationResult = {
        id: "d1",
        repoId: "r1",
        amount: "10",
        txHash: "0x" + "a".repeat(64),
      };
      pushQueryResult([donationResult]); // insert returning
      pushQueryResult([{ id: "r1" }]); // update repo

      const res = await request(app)
        .post("/v1/fund/donate")
        .set("Authorization", `Bearer ${testToken}`)
        .send({
          repoId: "r1",
          txHash: "0x" + "a".repeat(64),
          chainId: 8453,
          amount: "10",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("d1");
    });

    it("should reject duplicate txHash", async () => {
      mockDb.query.fundDonations.findFirst.mockResolvedValueOnce({
        id: "existing",
      });

      const res = await request(app)
        .post("/v1/fund/donate")
        .set("Authorization", `Bearer ${testToken}`)
        .send({
          repoId: "r1",
          txHash: "0x" + "b".repeat(64),
          chainId: 8453,
          amount: "10",
        });

      expect(res.status).toBe(409);
    });

    it("should reject invalid txHash format", async () => {
      const res = await request(app)
        .post("/v1/fund/donate")
        .set("Authorization", `Bearer ${testToken}`)
        .send({
          repoId: "r1",
          txHash: "invalid",
          chainId: 8453,
          amount: "10",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid transaction hash");
    });

    it("should reject missing fields", async () => {
      const res = await request(app)
        .post("/v1/fund/donate")
        .set("Authorization", `Bearer ${testToken}`)
        .send({ repoId: "r1" });

      expect(res.status).toBe(400);
    });

    it("should reject amount below minimum", async () => {
      const res = await request(app)
        .post("/v1/fund/donate")
        .set("Authorization", `Bearer ${testToken}`)
        .send({
          repoId: "r1",
          txHash: "0x" + "c".repeat(64),
          chainId: 8453,
          amount: "0.5",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Minimum donation");
    });

    it("should reject failed on-chain transaction", async () => {
      mockDb.query.fundDonations.findFirst.mockResolvedValueOnce(null);
      mockDb.query.githubRepos.findFirst.mockResolvedValueOnce({ id: "r1" });
      vi.mocked(getTransactionReceipt).mockResolvedValueOnce({
        status: "reverted",
      } as any);

      const res = await request(app)
        .post("/v1/fund/donate")
        .set("Authorization", `Bearer ${testToken}`)
        .send({
          repoId: "r1",
          txHash: "0x" + "d".repeat(64),
          chainId: 8453,
          amount: "10",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("failed on-chain");
    });

    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/fund/donate")
        .send({ repoId: "r1" });

      expect(res.status).toBe(401);
    });
  });

  // ============================================
  // POST /v1/fund/analyze
  // ============================================

  describe("POST /v1/fund/analyze", () => {
    it("should analyze npm package.json", async () => {
      const mockResult = {
        dependencies: [
          { name: "react", owner: "facebook", repo: "react", githubId: 123, repoHash: "0xabc" as `0x${string}`, isDirect: true },
        ],
        unresolved: ["some-private-pkg"],
        totalDependencies: 2,
        directDependencies: 1,
      };
      vi.mocked(analyzePackageJson).mockResolvedValueOnce(mockResult);

      const analysis = { id: "a1", requestedBy: "0x123" };
      pushQueryResult([analysis]); // insert returning

      const res = await request(app)
        .post("/v1/fund/analyze")
        .set("Authorization", `Bearer ${testToken}`)
        .send({
          content: JSON.stringify({ dependencies: { react: "^18.0.0" } }),
          packageManager: "npm",
        });

      expect(res.status).toBe(200);
      expect(res.body.analysisId).toBe("a1");
      expect(res.body.dependencies).toHaveLength(1);
    });

    it("should reject unknown package manager", async () => {
      const res = await request(app)
        .post("/v1/fund/analyze")
        .set("Authorization", `Bearer ${testToken}`)
        .send({
          content: "{}",
          packageManager: "pip",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid packageManager");
    });

    it("should reject missing content", async () => {
      const res = await request(app)
        .post("/v1/fund/analyze")
        .set("Authorization", `Bearer ${testToken}`)
        .send({ packageManager: "npm" });

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // POST /v1/fund/distribute
  // ============================================

  describe("POST /v1/fund/distribute", () => {
    it("should reject missing analysis", async () => {
      mockDb.query.dependencyAnalyses.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/v1/fund/distribute")
        .set("Authorization", `Bearer ${testToken}`)
        .send({
          analysisId: "a1",
          txHash: "0x" + "e".repeat(64),
          chainId: 8453,
          budget: "100",
        });

      expect(res.status).toBe(404);
    });

    it("should reject already executed analysis", async () => {
      mockDb.query.dependencyAnalyses.findFirst.mockResolvedValueOnce({
        id: "a1",
        executedTxHash: "0xalready",
      });

      const res = await request(app)
        .post("/v1/fund/distribute")
        .set("Authorization", `Bearer ${testToken}`)
        .send({
          analysisId: "a1",
          txHash: "0x" + "f".repeat(64),
          chainId: 8453,
          budget: "100",
        });

      expect(res.status).toBe(409);
    });
  });

  // ============================================
  // GET /v1/fund/my-donations
  // ============================================

  describe("GET /v1/fund/my-donations", () => {
    it("should return paginated donations for authenticated user", async () => {
      const donations = [
        { id: "d1", amount: "10", repoOwner: "facebook", repoName: "react" },
      ];
      pushQueryResult(donations);
      pushQueryResult([{ count: 1 }]);

      const res = await request(app)
        .get("/v1/fund/my-donations")
        .set("Authorization", `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it("should return empty when no donations", async () => {
      pushQueryResult([]);
      pushQueryResult([{ count: 0 }]);

      const res = await request(app)
        .get("/v1/fund/my-donations")
        .set("Authorization", `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ============================================
  // POST /v1/fund/refund
  // ============================================

  describe("POST /v1/fund/refund", () => {
    it("should reject non-eligible refund", async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      mockDb.query.fundDonations.findFirst.mockResolvedValueOnce({
        id: "d1",
        status: "confirmed",
        refundEligibleAt: futureDate,
        donorWallet: "0x1234567890abcdef1234567890abcdef12345678",
      });

      const res = await request(app)
        .post("/v1/fund/refund")
        .set("Authorization", `Bearer ${testToken}`)
        .send({ donationId: "d1", txHash: "0x" + "a".repeat(64) });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Refund delay not elapsed");
    });

    it("should reject refund for non-existent donation", async () => {
      mockDb.query.fundDonations.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/v1/fund/refund")
        .set("Authorization", `Bearer ${testToken}`)
        .send({ donationId: "nonexist", txHash: "0x" + "b".repeat(64) });

      expect(res.status).toBe(404);
    });
  });

  // ============================================
  // POST /v1/fund/claim/authorize
  // ============================================

  describe("POST /v1/fund/claim/authorize", () => {
    it("should reject when GitHub token missing", async () => {
      const res = await request(app)
        .post("/v1/fund/claim/authorize")
        .set("Authorization", `Bearer ${testToken}`)
        .send({
          repoId: "r1",
          walletAddress: "0x" + "a".repeat(40),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("GitHub access token");
    });

    it("should reject non-admin user", async () => {
      mockDb.query.githubRepos.findFirst.mockResolvedValueOnce({
        id: "r1",
        githubId: 12345,
        claimStatus: "unclaimed",
        repoHash: "0xabc",
      });
      vi.mocked(verifyRepoOwnership).mockResolvedValueOnce(false);

      const res = await request(app)
        .post("/v1/fund/claim/authorize")
        .set("Authorization", `Bearer ${testToken}`)
        .set("X-GitHub-Token", "ghp_fake123")
        .send({
          repoId: "r1",
          walletAddress: "0x" + "a".repeat(40),
        });

      expect(res.status).toBe(403);
    });

    it("should reject already claimed repo", async () => {
      mockDb.query.githubRepos.findFirst.mockResolvedValueOnce({
        id: "r1",
        claimStatus: "claimed",
      });

      const res = await request(app)
        .post("/v1/fund/claim/authorize")
        .set("Authorization", `Bearer ${testToken}`)
        .set("X-GitHub-Token", "ghp_fake123")
        .send({
          repoId: "r1",
          walletAddress: "0x" + "a".repeat(40),
        });

      expect(res.status).toBe(400);
    });
  });

  // ============================================
  // POST /v1/fund/opt-out
  // ============================================

  describe("POST /v1/fund/opt-out", () => {
    it("should reject non-owner", async () => {
      mockDb.query.githubRepos.findFirst.mockResolvedValueOnce({
        id: "r1",
        githubId: 12345,
      });
      vi.mocked(verifyRepoOwnership).mockResolvedValueOnce(false);

      const res = await request(app)
        .post("/v1/fund/opt-out")
        .set("Authorization", `Bearer ${testToken}`)
        .set("X-GitHub-Token", "ghp_fake123")
        .send({ owner: "facebook", name: "react" });

      expect(res.status).toBe(403);
    });

    it("should require GitHub token", async () => {
      const res = await request(app)
        .post("/v1/fund/opt-out")
        .set("Authorization", `Bearer ${testToken}`)
        .send({ owner: "facebook", name: "react" });

      expect(res.status).toBe(400);
    });
  });
});
