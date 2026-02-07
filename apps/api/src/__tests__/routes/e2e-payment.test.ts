import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { createX402Middleware, getX402Payment } from "../../middleware/x402.middleware.js";

// Mock viem with actual utility functions
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    verifyMessage: vi.fn(),
  };
});

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

/**
 * Build a valid x402 payment-signature header value
 */
function buildPaymentSignature(opts: {
  from: string;
  to: string;
  value: string;
  network?: string;
}): string {
  const payload = {
    x402Version: 2,
    scheme: "exact",
    network: opts.network || "eip155:84532",
    payload: {
      signature: "0xfakesig",
      authorization: {
        from: opts.from,
        to: opts.to,
        value: opts.value,
        validAfter: "0",
        validBefore: String(Math.floor(Date.now() / 1000) + 3600),
        nonce: "0x" + "0".repeat(64),
      },
    },
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * E2E Payment Flow Tests
 *
 * Tests the complete x402 payment middleware:
 * 1. Consumer requests a paid endpoint -> 402 with PAYMENT-REQUIRED header
 * 2. Consumer submits payment-signature header
 * 3. Facilitator verifies payment
 * 4. Server returns response with PAYMENT-RESPONSE header
 */
describe("E2E Payment Flow", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
  });

  describe("402 Payment Required Flow", () => {
    it("should return 402 with payment requirement for a paid endpoint", async () => {
      const x402 = createX402Middleware({
        routes: {
          "GET /v1/data": {
            price: "$0.001000",
            description: "Get data endpoint",
          },
        },
        payTo: "0x1234567890abcdef1234567890abcdef12345678",
      });

      app.get("/v1/data", x402, (req: Request, res: Response) => {
        res.json({ data: "secret" });
      });

      const res = await request(app).get("/v1/data");

      expect(res.status).toBe(402);
      // Check PAYMENT-REQUIRED header (base64 encoded)
      const paymentHeader = res.headers["payment-required"];
      expect(paymentHeader).toBeDefined();

      const paymentDetails = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
      expect(paymentDetails.scheme).toBe("exact");
      expect(paymentDetails.payTo).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(paymentDetails.maxAmountRequired).toBe("1000"); // $0.001 = 1000 (6 decimals)

      // Check response body
      expect(res.body.error).toBe("Payment Required");
      expect(res.body.x402Version).toBe(2);
      expect(res.body.accepts).toBeDefined();
      expect(res.body.accepts[0].scheme).toBe("exact");
    });

    it("should allow free endpoints without payment", async () => {
      const x402 = createX402Middleware({
        routes: {
          "GET /v1/free": {
            price: "$0.000000",
            description: "Free endpoint",
          },
        },
        payTo: "0x1234567890abcdef1234567890abcdef12345678",
      });

      app.get("/v1/free", x402, (req: Request, res: Response) => {
        res.json({ data: "free data" });
      });

      const res = await request(app).get("/v1/free");
      expect(res.status).toBe(200);
      expect(res.body.data).toBe("free data");
    });

    it("should pass through routes not in the pricing config", async () => {
      const x402 = createX402Middleware({
        routes: {
          "GET /v1/paid": {
            price: "$0.001000",
            description: "Paid endpoint",
          },
        },
        payTo: "0x1234567890abcdef1234567890abcdef12345678",
      });

      app.get("/v1/other", x402, (req: Request, res: Response) => {
        res.json({ data: "unpriced endpoint" });
      });

      const res = await request(app).get("/v1/other");
      expect(res.status).toBe(200);
      expect(res.body.data).toBe("unpriced endpoint");
    });
  });

  describe("Payment Verification", () => {
    it("should verify payment and allow access", async () => {
      // Mock facilitator verification to succeed
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          txHash: "0xtxhash123",
        }),
      } as any);

      const x402 = createX402Middleware({
        routes: {
          "GET /v1/data": {
            price: "$0.001000",
            description: "Get data",
          },
        },
        payTo: "0x1234567890abcdef1234567890abcdef12345678",
      });

      app.get("/v1/data", x402, (req: Request, res: Response) => {
        const payment = getX402Payment(req);
        res.json({
          data: "secret data",
          paid: !!payment,
          txHash: payment?.txHash,
        });
      });

      const paymentSig = buildPaymentSignature({
        from: "0xpayer",
        to: "0x1234567890abcdef1234567890abcdef12345678",
        value: "1000", // Enough for $0.001
      });

      const res = await request(app)
        .get("/v1/data")
        .set("payment-signature", paymentSig);

      expect(res.status).toBe(200);
      expect(res.body.data).toBe("secret data");
      expect(res.body.paid).toBe(true);
      expect(res.body.txHash).toBe("0xtxhash123");
    });

    it("should reject insufficient payment", async () => {
      const x402 = createX402Middleware({
        routes: {
          "GET /v1/data": {
            price: "$0.001000",
            description: "Get data",
          },
        },
        payTo: "0x1234567890abcdef1234567890abcdef12345678",
      });

      app.get("/v1/data", x402, (req: Request, res: Response) => {
        res.json({ data: "should not reach" });
      });

      const paymentSig = buildPaymentSignature({
        from: "0xpayer",
        to: "0x1234567890abcdef1234567890abcdef12345678",
        value: "500", // Less than required 1000
      });

      const res = await request(app)
        .get("/v1/data")
        .set("payment-signature", paymentSig);

      expect(res.status).toBe(402);
      expect(res.body.error).toContain("Insufficient");
    });

    it("should reject failed facilitator verification", async () => {
      // Mock facilitator to fail
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          success: false,
          errorReason: "Invalid signature",
        }),
      } as any);

      const x402 = createX402Middleware({
        routes: {
          "GET /v1/data": {
            price: "$0.001000",
            description: "Get data",
          },
        },
        payTo: "0x1234567890abcdef1234567890abcdef12345678",
      });

      app.get("/v1/data", x402, (req: Request, res: Response) => {
        res.json({ data: "should not reach" });
      });

      const paymentSig = buildPaymentSignature({
        from: "0xpayer",
        to: "0x1234567890abcdef1234567890abcdef12345678",
        value: "1000",
      });

      const res = await request(app)
        .get("/v1/data")
        .set("payment-signature", paymentSig);

      expect(res.status).toBe(402);
      expect(res.body.error).toContain("verification failed");
    });

    it("should reject invalid payment-signature format", async () => {
      const x402 = createX402Middleware({
        routes: {
          "GET /v1/data": {
            price: "$0.001000",
            description: "Get data",
          },
        },
        payTo: "0x1234567890abcdef1234567890abcdef12345678",
      });

      app.get("/v1/data", x402, (req: Request, res: Response) => {
        res.json({ data: "should not reach" });
      });

      const res = await request(app)
        .get("/v1/data")
        .set("payment-signature", "not-valid-base64-json");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid");
    });
  });

  describe("Multiple Endpoint Pricing", () => {
    it("should apply different prices to different endpoints", async () => {
      const x402 = createX402Middleware({
        routes: {
          "GET /v1/cheap": {
            price: "$0.000100",
            description: "Cheap endpoint",
          },
          "POST /v1/expensive": {
            price: "$0.010000",
            description: "Expensive endpoint",
          },
        },
        payTo: "0x1234567890abcdef1234567890abcdef12345678",
      });

      app.get("/v1/cheap", x402, (req: Request, res: Response) => {
        res.json({ data: "cheap" });
      });

      app.post("/v1/expensive", x402, (req: Request, res: Response) => {
        res.json({ data: "expensive" });
      });

      // GET cheap endpoint - should return 402
      const cheapRes = await request(app).get("/v1/cheap");
      expect(cheapRes.status).toBe(402);

      // POST expensive endpoint - should return 402
      const expensiveRes = await request(app).post("/v1/expensive");
      expect(expensiveRes.status).toBe(402);

      // Compare prices from response body
      expect(cheapRes.body.accepts[0].maxAmountRequired).toBe("100"); // $0.0001
      expect(expensiveRes.body.accepts[0].maxAmountRequired).toBe("10000"); // $0.01
    });
  });

  describe("Consumer Auth + Payment Flow", () => {
    it("should enforce auth first, then payment", async () => {
      const mockAuth = (req: any, res: Response, next: NextFunction) => {
        const apiKey = req.headers["x-api-key"];
        if (apiKey === "og_live_testkey") {
          req.user = { sub: "consumer-1", wallet: "0xconsumer", type: "consumer" };
          next();
        } else {
          res.status(401).json({ error: "Unauthorized" });
        }
      };

      const x402 = createX402Middleware({
        routes: {
          "GET /v1/data": {
            price: "$0.001000",
            description: "Get data",
          },
        },
        payTo: "0x1234567890abcdef1234567890abcdef12345678",
      });

      app.get("/v1/data", mockAuth, x402, (req: Request, res: Response) => {
        res.json({ data: "authenticated and paid" });
      });

      // Without API key - should return 401
      const noAuthRes = await request(app).get("/v1/data");
      expect(noAuthRes.status).toBe(401);

      // With API key but no payment - should return 402
      const noPaymentRes = await request(app)
        .get("/v1/data")
        .set("X-API-Key", "og_live_testkey");
      expect(noPaymentRes.status).toBe(402);

      // With API key and valid payment - should succeed
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          txHash: "0xtx",
        }),
      } as any);

      const paymentSig = buildPaymentSignature({
        from: "0xconsumer",
        to: "0x1234567890abcdef1234567890abcdef12345678",
        value: "1000",
      });

      const fullRes = await request(app)
        .get("/v1/data")
        .set("X-API-Key", "og_live_testkey")
        .set("payment-signature", paymentSig);
      expect(fullRes.status).toBe(200);
      expect(fullRes.body.data).toBe("authenticated and paid");
    });
  });
});
