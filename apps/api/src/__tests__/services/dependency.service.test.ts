import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/opengrant_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.CHAIN_ID = "84532";
process.env.RPC_URL = "https://sepolia.base.org";
process.env.PLATFORM_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
process.env.JWT_SECRET = "test-jwt-secret-for-testing-only";

vi.mock("../../db/index.js", () => ({
  db: {
    query: { githubRepos: { findFirst: vi.fn() } },
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@opengrant/database", () => ({
  githubRepos: { id: "id", githubId: "github_id" },
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({})),
    http: vi.fn(),
  };
});

vi.mock("ioredis", () => {
  class MockRedis {
    get = vi.fn(); set = vi.fn(); quit = vi.fn(); on = vi.fn();
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

// Mock the resolvers
vi.mock("../../services/github.service.js", () => ({
  resolveNpmToGithub: vi.fn(),
  resolveCrateToGithub: vi.fn(),
  resolveGoModToGithub: vi.fn(),
  computeRepoHash: vi.fn((id: number) => `0x${id.toString(16).padStart(64, "0")}`),
}));

import {
  scoreDependencies,
  computeDistribution,
  analyzePackageJson,
  analyzeCargoToml,
  analyzeGoMod,
  type ResolvedDep,
  type ScoredDep,
} from "../../services/dependency.service.js";
import {
  resolveNpmToGithub,
  resolveCrateToGithub,
  resolveGoModToGithub,
} from "../../services/github.service.js";

describe("Dependency Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // scoreDependencies
  // ============================================

  describe("scoreDependencies", () => {
    it("should return empty for empty deps", () => {
      const result = scoreDependencies([]);
      expect(result).toEqual([]);
    });

    it("should normalize scores to sum to 1", () => {
      const deps: ResolvedDep[] = [
        { name: "react", owner: "facebook", repo: "react", githubId: 1, repoHash: "0x1", isDirect: true, stars: 200000 },
        { name: "lodash", owner: "lodash", repo: "lodash", githubId: 2, repoHash: "0x2", isDirect: true, stars: 50000 },
      ];

      const scored = scoreDependencies(deps);
      const totalScore = scored.reduce((sum, d) => sum + d.score, 0);
      expect(totalScore).toBeCloseTo(1.0, 5);
    });

    it("should give higher scores to direct dependencies", () => {
      const deps: ResolvedDep[] = [
        { name: "react", owner: "facebook", repo: "react", githubId: 1, repoHash: "0x1", isDirect: true, stars: 100 },
        { name: "scheduler", owner: "facebook", repo: "react", githubId: 2, repoHash: "0x2", isDirect: false, stars: 100 },
      ];

      const scored = scoreDependencies(deps);
      const direct = scored.find(d => d.name === "react")!;
      const transitive = scored.find(d => d.name === "scheduler")!;
      expect(direct.score).toBeGreaterThan(transitive.score);
    });

    it("should give higher scores to more popular projects", () => {
      const deps: ResolvedDep[] = [
        { name: "react", owner: "facebook", repo: "react", githubId: 1, repoHash: "0x1", isDirect: true, stars: 200000 },
        { name: "tiny-lib", owner: "user", repo: "tiny", githubId: 2, repoHash: "0x2", isDirect: true, stars: 10 },
      ];

      const scored = scoreDependencies(deps);
      const popular = scored.find(d => d.name === "react")!;
      const tiny = scored.find(d => d.name === "tiny-lib")!;
      expect(popular.score).toBeGreaterThan(tiny.score);
    });
  });

  // ============================================
  // computeDistribution
  // ============================================

  describe("computeDistribution", () => {
    it("should return empty for zero budget", () => {
      const result = computeDistribution([], 0);
      expect(result).toEqual([]);
    });

    it("should distribute budget according to scores", () => {
      const scores: ScoredDep[] = [
        { name: "react", owner: "facebook", repo: "react", githubId: 1, repoHash: "0x1" as `0x${string}`, isDirect: true, stars: 200000, score: 0.7 },
        { name: "lodash", owner: "lodash", repo: "lodash", githubId: 2, repoHash: "0x2" as `0x${string}`, isDirect: true, stars: 50000, score: 0.3 },
      ];

      const dist = computeDistribution(scores, 100);
      expect(dist.length).toBe(2);

      const totalDistributed = dist.reduce((sum, d) => sum + d.amount, 0);
      expect(totalDistributed).toBeCloseTo(100, 2);
    });

    it("should filter out amounts below 1 USDC minimum", () => {
      const scores: ScoredDep[] = [
        { name: "react", owner: "facebook", repo: "react", githubId: 1, repoHash: "0x1" as `0x${string}`, isDirect: true, stars: 200000, score: 0.99 },
        { name: "tiny", owner: "user", repo: "tiny", githubId: 2, repoHash: "0x2" as `0x${string}`, isDirect: true, stars: 1, score: 0.01 },
      ];

      const dist = computeDistribution(scores, 10);
      // tiny would get 0.10 USDC, below minimum, should be filtered
      expect(dist.length).toBe(1);
      expect(dist[0].name).toBe("react");
    });

    it("should give all to top when budget too small for multiple", () => {
      const scores: ScoredDep[] = [
        { name: "a", owner: "o", repo: "a", githubId: 1, repoHash: "0x1" as `0x${string}`, isDirect: true, score: 0.5 },
        { name: "b", owner: "o", repo: "b", githubId: 2, repoHash: "0x2" as `0x${string}`, isDirect: true, score: 0.5 },
      ];

      const dist = computeDistribution(scores, 1.5);
      // Each would get 0.75, below min -> all goes to top
      expect(dist.length).toBe(1);
      expect(dist[0].amount).toBe(1.5);
    });
  });

  // ============================================
  // analyzePackageJson
  // ============================================

  describe("analyzePackageJson", () => {
    it("should parse package.json and resolve dependencies", async () => {
      vi.mocked(resolveNpmToGithub)
        .mockResolvedValueOnce({ owner: "facebook", repo: "react", githubId: 1 })
        .mockResolvedValueOnce(null); // unresolved

      const content = JSON.stringify({
        dependencies: { react: "^18.0.0", "private-pkg": "^1.0.0" },
      });

      const result = await analyzePackageJson(content);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].name).toBe("react");
      expect(result.unresolved).toContain("private-pkg");
      expect(result.totalDependencies).toBe(2);
      expect(result.directDependencies).toBe(2);
    });
  });

  // ============================================
  // analyzeCargoToml
  // ============================================

  describe("analyzeCargoToml", () => {
    it("should parse Cargo.toml dependencies", async () => {
      vi.mocked(resolveCrateToGithub)
        .mockResolvedValueOnce({ owner: "serde-rs", repo: "serde", githubId: 100 })
        .mockResolvedValueOnce({ owner: "tokio-rs", repo: "tokio", githubId: 200 });

      const content = `
[package]
name = "my-crate"

[dependencies]
serde = "1.0"
tokio = { version = "1", features = ["full"] }
`;

      const result = await analyzeCargoToml(content);
      expect(result.dependencies).toHaveLength(2);
      expect(result.totalDependencies).toBe(2);
    });
  });

  // ============================================
  // analyzeGoMod
  // ============================================

  describe("analyzeGoMod", () => {
    it("should parse go.mod dependencies", async () => {
      vi.mocked(resolveGoModToGithub)
        .mockResolvedValueOnce({ owner: "gin-gonic", repo: "gin", githubId: 300 });

      const content = `
module mymodule

go 1.21

require (
    github.com/gin-gonic/gin v1.9.0
    golang.org/x/text v0.3.0
)
`;

      const result = await analyzeGoMod(content);
      // Only github.com modules are included
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].name).toContain("gin-gonic/gin");
    });
  });
});
