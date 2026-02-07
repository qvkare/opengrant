import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  createX402Middleware,
  getX402Payment,
  type RouteConfig,
} from "../../middleware/x402.middleware.js";

// Mock config
vi.mock("../../config/index.js", () => ({
  config: {
    contracts: {
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
    x402: {
      facilitatorUrl: "https://facilitator.x402.org",
    },
    blockchain: {
      chainId: 84532, // Base Sepolia
    },
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("x402 Middleware", () => {
  const mockResponse = () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  };

  const mockNext = vi.fn() as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createX402Middleware", () => {
    const routeConfig: Record<string, RouteConfig> = {
      "POST /v1/generate": {
        price: "$0.001",
        description: "Generate content",
        mimeType: "application/json",
      },
      "GET /v1/status": {
        price: "$0",
        description: "Check status (free)",
      },
    };

    const payTo = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    it("should pass through for routes not requiring payment", async () => {
      const middleware = createX402Middleware({
        routes: routeConfig,
        payTo,
      });

      const req = {
        method: "GET",
        path: "/v1/unknown",
        protocol: "https",
        get: vi.fn().mockReturnValue("api.example.com"),
        originalUrl: "/v1/unknown",
        headers: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should pass through for free routes (price = $0)", async () => {
      const middleware = createX402Middleware({
        routes: routeConfig,
        payTo,
      });

      const req = {
        method: "GET",
        path: "/v1/status",
        protocol: "https",
        get: vi.fn().mockReturnValue("api.example.com"),
        originalUrl: "/v1/status",
        headers: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 402 when payment is required but not provided", async () => {
      const middleware = createX402Middleware({
        routes: routeConfig,
        payTo,
      });

      const req = {
        method: "POST",
        path: "/v1/generate",
        protocol: "https",
        get: vi.fn().mockReturnValue("api.example.com"),
        originalUrl: "/v1/generate",
        headers: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();

      // Check that PAYMENT-REQUIRED header is set
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          "Content-Type": "application/json",
        })
      );
    });

    it("should include correct payment info in 402 response", async () => {
      const middleware = createX402Middleware({
        routes: routeConfig,
        payTo,
      });

      const req = {
        method: "POST",
        path: "/v1/generate",
        protocol: "https",
        get: vi.fn().mockReturnValue("api.example.com"),
        originalUrl: "/v1/generate",
        headers: {},
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);

      const jsonCall = res.json as any;
      const responseBody = jsonCall.mock.calls[0][0];

      expect(responseBody.error).toBe("Payment Required");
      expect(responseBody.x402Version).toBe(2);
      expect(responseBody.accepts).toHaveLength(1);
      expect(responseBody.accepts[0].scheme).toBe("exact");
      expect(responseBody.accepts[0].payTo).toBe(payTo);
      expect(responseBody.accepts[0].maxAmountRequired).toBe("1000"); // $0.001 = 1000 micro USDC
    });

    it("should return 400 for invalid payment signature format", async () => {
      const middleware = createX402Middleware({
        routes: routeConfig,
        payTo,
      });

      const req = {
        method: "POST",
        path: "/v1/generate",
        protocol: "https",
        get: vi.fn().mockReturnValue("api.example.com"),
        originalUrl: "/v1/generate",
        headers: {
          "payment-signature": "not-valid-base64!!!",
        },
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid payment signature format",
      });
    });

    it("should return 402 for insufficient payment amount", async () => {
      const middleware = createX402Middleware({
        routes: routeConfig,
        payTo,
      });

      const paymentPayload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:84532",
        payload: {
          signature: "0x123...",
          authorization: {
            from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            to: payTo,
            value: "500", // Less than required 1000
            validAfter: "0",
            validBefore: String(Math.floor(Date.now() / 1000) + 3600),
            nonce: "0x" + "00".repeat(32),
          },
        },
      };

      const encodedPayload = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const req = {
        method: "POST",
        path: "/v1/generate",
        protocol: "https",
        get: vi.fn().mockReturnValue("api.example.com"),
        originalUrl: "/v1/generate",
        headers: {
          "payment-signature": encodedPayload,
        },
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(402);
      const jsonCall = res.json as any;
      expect(jsonCall.mock.calls[0][0].error).toBe("Insufficient payment amount");
    });

    it("should verify payment with facilitator and proceed on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            txHash: "0xabc123",
          }),
      });

      const middleware = createX402Middleware({
        routes: routeConfig,
        payTo,
      });

      const paymentPayload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:84532",
        payload: {
          signature: "0x123...",
          authorization: {
            from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            to: payTo,
            value: "1000", // Exactly required
            validAfter: "0",
            validBefore: String(Math.floor(Date.now() / 1000) + 3600),
            nonce: "0x" + "00".repeat(32),
          },
        },
      };

      const encodedPayload = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const req = {
        method: "POST",
        path: "/v1/generate",
        protocol: "https",
        get: vi.fn().mockReturnValue("api.example.com"),
        originalUrl: "/v1/generate",
        headers: {
          "payment-signature": encodedPayload,
        },
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://facilitator.x402.org/verify",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
      expect(next).toHaveBeenCalled();

      // Check payment info is attached to request
      const payment = getX402Payment(req as any);
      expect(payment).not.toBeNull();
      expect(payment?.verified).toBe(true);
      expect(payment?.txHash).toBe("0xabc123");
    });

    it("should return 402 when facilitator verification fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({
            success: false,
            errorReason: "Invalid signature",
          }),
      });

      const middleware = createX402Middleware({
        routes: routeConfig,
        payTo,
      });

      const paymentPayload = {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:84532",
        payload: {
          signature: "0x123...",
          authorization: {
            from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
            to: payTo,
            value: "1000",
            validAfter: "0",
            validBefore: String(Math.floor(Date.now() / 1000) + 3600),
            nonce: "0x" + "00".repeat(32),
          },
        },
      };

      const encodedPayload = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const req = {
        method: "POST",
        path: "/v1/generate",
        protocol: "https",
        get: vi.fn().mockReturnValue("api.example.com"),
        originalUrl: "/v1/generate",
        headers: {
          "payment-signature": encodedPayload,
        },
      } as unknown as Request;

      const res = mockResponse();
      const next = vi.fn() as NextFunction;

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(402);
      const jsonCall = res.json as any;
      expect(jsonCall.mock.calls[0][0].error).toBe("Payment verification failed");
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("getX402Payment", () => {
    it("should return null when no payment attached", () => {
      const req = {} as Request;
      expect(getX402Payment(req)).toBeNull();
    });

    it("should return payment info when attached", () => {
      const payment = {
        verified: true,
        txHash: "0xabc",
        amount: "1000",
        payer: "0x123",
        timestamp: Date.now(),
      };
      const req = { x402Payment: payment } as any;

      expect(getX402Payment(req)).toEqual(payment);
    });
  });
});
