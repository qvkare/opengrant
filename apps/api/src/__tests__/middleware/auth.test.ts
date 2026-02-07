import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hashApiKey,
  generateApiKey,
  verifyToken,
  generateToken,
  decodeToken,
  requireType,
  type JWTPayload,
  type AuthRequest,
} from "../../middleware/auth.middleware.js";
import jwt from "jsonwebtoken";
import type { Response, NextFunction } from "express";

// Use the test JWT secret
const JWT_SECRET = "test-jwt-secret-for-testing-only";

// Mock the config module
vi.mock("../../config/index.js", () => ({
  config: {
    auth: {
      jwtSecret: "test-jwt-secret-for-testing-only",
      jwtExpiresIn: "1h",
    },
  },
}));

describe("Auth Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hashApiKey", () => {
    it("should hash an API key consistently", () => {
      const key = "og_live_abc123";
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it("should produce different hashes for different keys", () => {
      const hash1 = hashApiKey("og_live_abc123");
      const hash2 = hashApiKey("og_live_xyz789");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("generateApiKey", () => {
    it("should generate valid API key with prefix and hash", () => {
      const result = generateApiKey();

      expect(result.key).toMatch(/^og_live_[a-f0-9]{48}$/);
      expect(result.prefix).toBe("og_live_abc1".slice(0, 12) ? result.key.slice(0, 12) : result.prefix);
      expect(result.prefix.length).toBe(12);
      expect(result.hash).toHaveLength(64);
    });

    it("should generate unique keys each time", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1.key).not.toBe(key2.key);
      expect(key1.hash).not.toBe(key2.hash);
    });

    it("should produce correct hash for the generated key", () => {
      const result = generateApiKey();
      const expectedHash = hashApiKey(result.key);

      expect(result.hash).toBe(expectedHash);
    });
  });

  describe("generateToken / verifyToken", () => {
    it("should generate a valid JWT token", () => {
      const payload: Omit<JWTPayload, "iat" | "exp"> = {
        sub: "user-123",
        wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        type: "consumer",
      };

      const token = generateToken(payload);

      expect(token).toBeDefined();
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
    });

    it("should verify a valid token", () => {
      const payload: Omit<JWTPayload, "iat" | "exp"> = {
        sub: "user-456",
        wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        type: "publisher",
      };

      const token = generateToken(payload);
      const verified = verifyToken(token);

      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe(payload.sub);
      expect(verified?.wallet).toBe(payload.wallet);
      expect(verified?.type).toBe(payload.type);
    });

    it("should return null for invalid token", () => {
      const result = verifyToken("invalid.token.here");
      expect(result).toBeNull();
    });

    it("should return null for expired token", () => {
      const payload: JWTPayload = {
        sub: "user-123",
        wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        type: "consumer",
      };

      // Create an expired token
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "-1h" });
      const result = verifyToken(token);

      expect(result).toBeNull();
    });
  });

  describe("decodeToken", () => {
    it("should decode a token without verification", () => {
      const payload: Omit<JWTPayload, "iat" | "exp"> = {
        sub: "user-123",
        wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        type: "consumer",
      };

      const token = generateToken(payload);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe(payload.sub);
      expect(decoded?.wallet).toBe(payload.wallet);
    });

    it("should decode even expired tokens", () => {
      const payload: JWTPayload = {
        sub: "user-123",
        wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        type: "consumer",
      };

      // Create an expired token
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "-1h" });
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe(payload.sub);
    });

    it("should return null for invalid token format", () => {
      const result = decodeToken("not-a-valid-jwt");
      expect(result).toBeNull();
    });
  });

  describe("requireType", () => {
    const mockResponse = () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      } as unknown as Response;
      return res;
    };

    const mockNext = vi.fn() as NextFunction;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should call next() when user type matches", () => {
      const middleware = requireType("consumer");
      const req = {
        user: {
          sub: "user-123",
          wallet: "0x123",
          type: "consumer",
        },
      } as AuthRequest;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 401 when no user is present", () => {
      const middleware = requireType("consumer");
      const req = {} as AuthRequest;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 when user type does not match", () => {
      const middleware = requireType("publisher");
      const req = {
        user: {
          sub: "user-123",
          wallet: "0x123",
          type: "consumer",
        },
      } as AuthRequest;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "publisher access required" });
      expect(next).not.toHaveBeenCalled();
    });

    it("should work for publisher type", () => {
      const middleware = requireType("publisher");
      const req = {
        user: {
          sub: "pub-123",
          wallet: "0x456",
          type: "publisher",
        },
      } as AuthRequest;
      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
