import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/opengrant_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.CHAIN_ID = "84532";
process.env.RPC_URL = "https://sepolia.base.org";
process.env.PLATFORM_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
process.env.JWT_SECRET = "test-jwt-secret-for-testing-only";
process.env.GITHUB_TOKEN = "ghp_testtoken";

// Use vi.hoisted() to avoid mock hoisting issues
const { mockDb, mockFetch } = vi.hoisted(() => {
  const mockDb: any = {
    query: {
      githubRepos: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  const mockFetch = vi.fn();

  return { mockDb, mockFetch };
});

global.fetch = mockFetch;

vi.mock("../../db/index.js", () => ({
  db: mockDb,
}));

vi.mock("@opengrant/database", () => ({
  githubRepos: {
    id: "id", githubId: "github_id", owner: "owner", name: "name",
    fullName: "full_name", repoHash: "repo_hash", language: "language",
    stars: "stars", totalFunded: "total_funded", donorCount: "donor_count",
    description: "description", lastSyncedAt: "last_synced_at",
  },
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

import {
  computeRepoHash,
  getRepoByOwnerName,
  resolveNpmToGithub,
  resolveCrateToGithub,
  resolveGoModToGithub,
  verifyRepoOwnership,
  checkFundingYml,
  syncTopRepos,
  getAuthenticatedUser,
  listUserRepos,
} from "../../services/github.service.js";

describe("GitHub Service", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
  });

  // ============================================
  // computeRepoHash
  // ============================================

  describe("computeRepoHash", () => {
    it("should produce deterministic hash for same ID", () => {
      const hash1 = computeRepoHash(12345);
      const hash2 = computeRepoHash(12345);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different IDs", () => {
      const hash1 = computeRepoHash(12345);
      const hash2 = computeRepoHash(67890);
      expect(hash1).not.toBe(hash2);
    });

    it("should return hex string starting with 0x", () => {
      const hash = computeRepoHash(12345);
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  // ============================================
  // getRepoByOwnerName
  // ============================================

  describe("getRepoByOwnerName", () => {
    it("should return cached repo if fresh", async () => {
      const cached = {
        id: "r1",
        owner: "facebook",
        name: "react",
        lastSyncedAt: new Date(),
      };
      mockDb.query.githubRepos.findFirst.mockResolvedValueOnce(cached);

      const result = await getRepoByOwnerName("facebook", "react");
      expect(result).toEqual(cached);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should fetch from GitHub if cache is stale", async () => {
      const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const cached = {
        id: "r1",
        owner: "facebook",
        name: "react",
        lastSyncedAt: staleDate,
      };
      mockDb.query.githubRepos.findFirst.mockResolvedValueOnce(cached);

      const githubRepo = {
        id: 10270250,
        owner: { login: "facebook", avatar_url: "https://avatar.url" },
        name: "react",
        full_name: "facebook/react",
        description: "A JavaScript library",
        language: "JavaScript",
        stargazers_count: 200000,
        forks_count: 40000,
        homepage: "https://react.dev",
        topics: ["javascript", "ui"],
        license: { spdx_id: "MIT" },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => githubRepo,
      });

      const upserted = { ...cached, stars: 200000 };
      mockDb.returning.mockResolvedValueOnce([upserted]);

      const result = await getRepoByOwnerName("facebook", "react");
      expect(mockFetch).toHaveBeenCalled();
      expect(result).toEqual(upserted);
    });

    it("should return null if not found anywhere", async () => {
      mockDb.query.githubRepos.findFirst.mockResolvedValueOnce(null);
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await getRepoByOwnerName("unknown", "repo");
      expect(result).toBeNull();
    });
  });

  // ============================================
  // resolveNpmToGithub
  // ============================================

  describe("resolveNpmToGithub", () => {
    it("should resolve npm package to GitHub repo", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            repository: { url: "git+https://github.com/facebook/react.git" },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 10270250 }),
        });

      const result = await resolveNpmToGithub("react");
      expect(result).toEqual({
        owner: "facebook",
        repo: "react",
        githubId: 10270250,
      });
    });

    it("should return null for package without GitHub repo", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ repository: { url: "https://gitlab.com/foo/bar" } }),
      });

      const result = await resolveNpmToGithub("some-pkg");
      expect(result).toBeNull();
    });

    it("should return null for npm 404", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await resolveNpmToGithub("nonexistent-package-xyz");
      expect(result).toBeNull();
    });
  });

  // ============================================
  // resolveCrateToGithub
  // ============================================

  describe("resolveCrateToGithub", () => {
    it("should resolve crate to GitHub repo", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            crate: { repository: "https://github.com/serde-rs/serde" },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 88888 }),
        });

      const result = await resolveCrateToGithub("serde");
      expect(result).toEqual({
        owner: "serde-rs",
        repo: "serde",
        githubId: 88888,
      });
    });
  });

  // ============================================
  // resolveGoModToGithub
  // ============================================

  describe("resolveGoModToGithub", () => {
    it("should resolve go module to GitHub repo", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 77777 }),
      });

      const result = await resolveGoModToGithub("github.com/gin-gonic/gin");
      expect(result).toEqual({
        owner: "gin-gonic",
        repo: "gin",
        githubId: 77777,
      });
    });

    it("should return null for non-GitHub module", async () => {
      const result = await resolveGoModToGithub("golang.org/x/text");
      expect(result).toBeNull();
    });
  });

  // ============================================
  // verifyRepoOwnership
  // ============================================

  describe("verifyRepoOwnership", () => {
    it("should return true for admin", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ permissions: { admin: true } }),
      });

      const result = await verifyRepoOwnership("ghp_token", 12345);
      expect(result).toBe(true);
    });

    it("should return false for non-admin", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ permissions: { admin: false } }),
      });

      const result = await verifyRepoOwnership("ghp_token", 12345);
      expect(result).toBe(false);
    });

    it("should return false on API error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      const result = await verifyRepoOwnership("bad_token", 12345);
      expect(result).toBe(false);
    });
  });

  // ============================================
  // checkFundingYml
  // ============================================

  describe("checkFundingYml", () => {
    it("should extract opengrant wallet from FUNDING.yml", async () => {
      const content = Buffer.from(
        "github: [user]\nopengrant: 0x1234567890abcdef1234567890abcdef12345678\n"
      ).toString("base64");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content }),
      });

      const result = await checkFundingYml("owner", "repo");
      expect(result).toBe("0x1234567890abcdef1234567890abcdef12345678");
    });

    it("should return null if no FUNDING.yml", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await checkFundingYml("owner", "repo");
      expect(result).toBeNull();
    });
  });

  // ============================================
  // syncTopRepos
  // ============================================

  describe("syncTopRepos", () => {
    it("should sync repos from GitHub search API", async () => {
      const items = [
        {
          id: 1,
          owner: { login: "user1", avatar_url: "https://avatar1.url" },
          name: "repo1",
          full_name: "user1/repo1",
          description: "Repo 1",
          language: "JavaScript",
          stargazers_count: 50000,
          forks_count: 10000,
          homepage: null,
          topics: [],
          license: { spdx_id: "MIT" },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items }),
      });

      const count = await syncTopRepos(1);
      expect(count).toBe(1);
    });
  });

  // ============================================
  // getAuthenticatedUser
  // ============================================

  describe("getAuthenticatedUser", () => {
    it("should return user info for valid token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 12345,
          login: "testuser",
          avatar_url: "https://avatars.githubusercontent.com/u/12345",
          name: "Test User",
          bio: "Test bio",
        }),
      });

      const user = await getAuthenticatedUser("ghp_valid_token");
      expect(user).not.toBeNull();
      expect(user!.id).toBe(12345);
      expect(user!.login).toBe("testuser");
      expect(user!.name).toBe("Test User");
    });

    it("should return null for invalid token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const user = await getAuthenticatedUser("ghp_invalid");
      expect(user).toBeNull();
    });
  });

  // ============================================
  // listUserRepos
  // ============================================

  describe("listUserRepos", () => {
    it("should return repos with admin access", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 100,
            owner: { login: "testuser" },
            name: "my-repo",
            full_name: "testuser/my-repo",
            description: "My repo",
            language: "TypeScript",
            stargazers_count: 50,
            permissions: { admin: true, push: true, pull: true },
          },
          {
            id: 200,
            owner: { login: "org" },
            name: "shared-repo",
            full_name: "org/shared-repo",
            description: "Not admin",
            language: "Go",
            stargazers_count: 100,
            permissions: { admin: false, push: true, pull: true },
          },
        ],
      });

      const repos = await listUserRepos("ghp_valid_token");
      expect(repos).toHaveLength(1);
      expect(repos[0].fullName).toBe("testuser/my-repo");
      expect(repos[0].githubId).toBe(100);
    });

    it("should return empty array on error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const repos = await listUserRepos("ghp_invalid");
      expect(repos).toEqual([]);
    });
  });
});
