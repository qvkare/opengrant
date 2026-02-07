import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenGrant } from "../client.js";
import {
  UnauthorizedError,
  APINotFoundError,
  RateLimitError,
  PaymentRequiredError,
  TimeoutError,
  NetworkError,
} from "../errors.js";
import { HTTP_STATUS } from "../constants.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("OpenGrant Client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create client with minimal config", () => {
      const client = new OpenGrant({
        apiKey: "og_test_key",
      });

      expect(client).toBeInstanceOf(OpenGrant);
      expect(client.address).toBeUndefined();
    });

    it("should create client with private key", () => {
      const client = new OpenGrant({
        apiKey: "og_test_key",
        privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      });

      expect(client.address).toBeDefined();
      expect(client.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should use custom base URL", () => {
      const client = new OpenGrant({
        apiKey: "og_test_key",
        baseUrl: "https://custom.api.com",
      });

      expect(client).toBeInstanceOf(OpenGrant);
    });
  });

  describe("call", () => {
    it("should make successful GET request", async () => {
      const responseData = { result: "success" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseData),
        headers: new Headers({
          "content-type": "application/json",
        }),
      });

      const client = new OpenGrant({ apiKey: "og_test_key" });
      const response = await client.get("test-api", "/v1/test");

      expect(response.status).toBe(200);
      expect(response.data).toEqual(responseData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/proxy/test-api/v1/test"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer og_test_key",
          }),
        })
      );
    });

    it("should make successful POST request with body", async () => {
      const responseData = { id: 123 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responseData),
        headers: new Headers(),
      });

      const client = new OpenGrant({ apiKey: "og_test_key" });
      const response = await client.post("test-api", "/v1/create", { name: "test" });

      expect(response.data).toEqual(responseData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "test" }),
        })
      );
    });

    it("should handle query parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      });

      const client = new OpenGrant({ apiKey: "og_test_key" });
      await client.get("test-api", "/v1/search", {
        params: { q: "test", limit: 10 },
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("q=test");
      expect(calledUrl).toContain("limit=10");
    });

    it("should throw UnauthorizedError on 401", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: HTTP_STATUS.UNAUTHORIZED,
        headers: new Headers(),
      });

      const client = new OpenGrant({ apiKey: "invalid_key", autoRetry: false });

      await expect(client.get("test-api", "/v1/test")).rejects.toThrow(UnauthorizedError);
    });

    it("should throw APINotFoundError on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: HTTP_STATUS.NOT_FOUND,
        headers: new Headers(),
      });

      const client = new OpenGrant({ apiKey: "og_test_key", autoRetry: false });

      await expect(client.get("unknown-api", "/v1/test")).rejects.toThrow(APINotFoundError);
    });

    it("should throw RateLimitError on 429", async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue({
        ok: false,
        status: HTTP_STATUS.TOO_MANY_REQUESTS,
        headers: new Headers({
          "Retry-After": "30",
        }),
      });

      const client = new OpenGrant({ apiKey: "og_test_key", autoRetry: false });

      const promise = client.get("test-api", "/v1/test");

      // Attach rejection handler immediately to prevent unhandled rejection
      const errorPromise = promise.then(
        () => { throw new Error("Should have thrown"); },
        (error) => error
      );

      await vi.runAllTimersAsync();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfter).toBe(30);

      vi.useRealTimers();
    });

    it("should extract payment info from response headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ result: "data" }),
        headers: new Headers({
          "X-402-Payment-Amount": "1000000",
          "X-402-Payment-Tx": "0xabc123",
        }),
      });

      const client = new OpenGrant({ apiKey: "og_test_key" });
      const response = await client.get("test-api", "/v1/test");

      expect(response.payment).toEqual({
        amount: "1000000",
        txHash: "0xabc123",
      });
    });
  });

  describe("402 Payment Required handling", () => {
    it("should throw PaymentRequiredError when no wallet configured", async () => {
      const paymentDetails = {
        version: "1",
        network: "base",
        amount: "1000000",
        token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        recipient: "0x1234567890123456789012345678901234567890",
        facilitator: "https://facilitator.example.com",
        description: "API call",
        resource: "/v1/test",
        validUntil: Math.floor(Date.now() / 1000) + 3600,
        nonce: "0x1234",
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: HTTP_STATUS.PAYMENT_REQUIRED,
        headers: new Headers({
          "X-402-Payment": JSON.stringify(paymentDetails),
        }),
      });

      const client = new OpenGrant({ apiKey: "og_test_key", autoRetry: false });

      await expect(client.get("test-api", "/v1/test")).rejects.toThrow(PaymentRequiredError);
    });

    it("should throw PaymentRequiredError when missing X-402-Payment header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: HTTP_STATUS.PAYMENT_REQUIRED,
        headers: new Headers(),
      });

      const client = new OpenGrant({ apiKey: "og_test_key", autoRetry: false });

      await expect(client.get("test-api", "/v1/test")).rejects.toThrow(
        /Missing X-402-Payment header/
      );
    });

    it("should throw PaymentRequiredError when X-402-Payment is invalid JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: HTTP_STATUS.PAYMENT_REQUIRED,
        headers: new Headers({
          "X-402-Payment": "invalid json",
        }),
      });

      const client = new OpenGrant({ apiKey: "og_test_key", autoRetry: false });

      await expect(client.get("test-api", "/v1/test")).rejects.toThrow(
        /Invalid X-402-Payment header/
      );
    });
  });

  describe("retry logic", () => {
    it("should retry on network error", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network failed"))
        .mockRejectedValueOnce(new Error("Network failed"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
          headers: new Headers(),
        });

      const client = new OpenGrant({
        apiKey: "og_test_key",
        autoRetry: true,
        maxRetries: 3,
      });

      // Mock setTimeout to avoid actual delays in tests
      vi.useFakeTimers();
      const promise = client.get("test-api", "/v1/test");

      // Advance timers for retry backoffs
      await vi.runAllTimersAsync();

      const response = await promise;
      expect(response.data).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it("should not retry on unauthorized error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: HTTP_STATUS.UNAUTHORIZED,
        headers: new Headers(),
      });

      const client = new OpenGrant({
        apiKey: "invalid_key",
        autoRetry: true,
        maxRetries: 3,
      });

      await expect(client.get("test-api", "/v1/test")).rejects.toThrow(UnauthorizedError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should not retry when autoRetry is false", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network failed"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
          headers: new Headers(),
        });

      const client = new OpenGrant({
        apiKey: "og_test_key",
        autoRetry: false,
      });

      await expect(client.get("test-api", "/v1/test")).rejects.toThrow(NetworkError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("timeout", () => {
    it("should throw TimeoutError when request times out", async () => {
      mockFetch.mockImplementationOnce((_url: string, options?: RequestInit) =>
        new Promise((_, reject) => {
          // Listen for abort signal like real fetch does
          const signal = options?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              const error = new Error("The operation was aborted.");
              error.name = "AbortError";
              reject(error);
            });
          }
        })
      );

      const client = new OpenGrant({
        apiKey: "og_test_key",
        timeout: 10,
        autoRetry: false,
      });

      await expect(client.get("test-api", "/v1/test")).rejects.toThrow(TimeoutError);
    });
  });

  describe("getAPIInfo", () => {
    it("should fetch API info successfully", async () => {
      const apiInfo = {
        slug: "test-api",
        name: "Test API",
        description: "A test API",
        publisher: "Test Publisher",
        baseUrl: "https://api.test.com",
        endpoints: [
          {
            path: "/v1/test",
            method: "GET",
            description: "Test endpoint",
            pricePerCall: "1000000",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(apiInfo),
      });

      const client = new OpenGrant({ apiKey: "og_test_key" });
      const result = await client.getAPIInfo("test-api");

      expect(result).toEqual(apiInfo);
    });

    it("should throw APINotFoundError when API does not exist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const client = new OpenGrant({ apiKey: "og_test_key" });

      await expect(client.getAPIInfo("nonexistent")).rejects.toThrow(APINotFoundError);
    });
  });
});
