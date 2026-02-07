import { describe, it, expect } from "vitest";
import {
  OpenGrantError,
  PaymentRequiredError,
  InsufficientBalanceError,
  PaymentFailedError,
  UnauthorizedError,
  APINotFoundError,
  RateLimitError,
  NetworkError,
  TimeoutError,
} from "../errors.js";
import { ERROR_CODES } from "../constants.js";

describe("OpenGrantError", () => {
  it("should create error with correct properties", () => {
    const error = new OpenGrantError({
      message: "Test error",
      code: "TEST_CODE",
      status: 500,
      details: { key: "value" },
    });

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.status).toBe(500);
    expect(error.details).toEqual({ key: "value" });
    expect(error.name).toBe("OpenGrantError");
  });

  it("should serialize to JSON correctly", () => {
    const error = new OpenGrantError({
      message: "Test error",
      code: "TEST_CODE",
      status: 400,
    });

    expect(error.toJSON()).toEqual({
      message: "Test error",
      code: "TEST_CODE",
      status: 400,
      details: undefined,
    });
  });

  it("should be instance of Error", () => {
    const error = new OpenGrantError({
      message: "Test",
      code: "TEST",
      status: 500,
    });

    expect(error).toBeInstanceOf(Error);
  });
});

describe("PaymentRequiredError", () => {
  it("should create error with correct defaults", () => {
    const error = new PaymentRequiredError("Payment needed");

    expect(error.message).toBe("Payment needed");
    expect(error.code).toBe(ERROR_CODES.PAYMENT_REQUIRED);
    expect(error.status).toBe(402);
    expect(error.name).toBe("PaymentRequiredError");
  });

  it("should include details when provided", () => {
    const error = new PaymentRequiredError("Payment required", {
      amount: "1000000",
      recipient: "0x123",
    });

    expect(error.details).toEqual({
      amount: "1000000",
      recipient: "0x123",
    });
  });
});

describe("InsufficientBalanceError", () => {
  it("should create error with balance info", () => {
    const error = new InsufficientBalanceError(BigInt("1000000"), BigInt("500000"));

    expect(error.message).toContain("Insufficient USDC balance");
    expect(error.message).toContain("1000000");
    expect(error.message).toContain("500000");
    expect(error.code).toBe(ERROR_CODES.INSUFFICIENT_BALANCE);
    expect(error.status).toBe(402);
    expect(error.required).toBe(BigInt("1000000"));
    expect(error.available).toBe(BigInt("500000"));
    expect(error.name).toBe("InsufficientBalanceError");
  });

  it("should include balance details", () => {
    const error = new InsufficientBalanceError(BigInt("2000000"), BigInt("100000"));

    expect(error.details).toEqual({
      required: "2000000",
      available: "100000",
    });
  });
});

describe("PaymentFailedError", () => {
  it("should create error with message", () => {
    const error = new PaymentFailedError("Transaction reverted");

    expect(error.message).toBe("Transaction reverted");
    expect(error.code).toBe(ERROR_CODES.PAYMENT_FAILED);
    expect(error.status).toBe(402);
    expect(error.name).toBe("PaymentFailedError");
  });
});

describe("UnauthorizedError", () => {
  it("should create error with default message", () => {
    const error = new UnauthorizedError();

    expect(error.message).toBe("Invalid or missing API key");
    expect(error.code).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(error.status).toBe(401);
    expect(error.name).toBe("UnauthorizedError");
  });

  it("should accept custom message", () => {
    const error = new UnauthorizedError("Token expired");

    expect(error.message).toBe("Token expired");
  });
});

describe("APINotFoundError", () => {
  it("should create error with API slug", () => {
    const error = new APINotFoundError("my-api");

    expect(error.message).toBe("API not found: my-api");
    expect(error.code).toBe(ERROR_CODES.API_NOT_FOUND);
    expect(error.status).toBe(404);
    expect(error.details).toEqual({ apiSlug: "my-api" });
    expect(error.name).toBe("APINotFoundError");
  });
});

describe("RateLimitError", () => {
  it("should create error without retry-after", () => {
    const error = new RateLimitError();

    expect(error.message).toBe("Rate limit exceeded");
    expect(error.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(error.status).toBe(429);
    expect(error.retryAfter).toBeUndefined();
    expect(error.name).toBe("RateLimitError");
  });

  it("should create error with retry-after", () => {
    const error = new RateLimitError(60);

    expect(error.retryAfter).toBe(60);
    expect(error.details).toEqual({ retryAfter: 60 });
  });
});

describe("NetworkError", () => {
  it("should create error with message", () => {
    const error = new NetworkError("Connection refused");

    expect(error.message).toBe("Connection refused");
    expect(error.code).toBe(ERROR_CODES.NETWORK_ERROR);
    expect(error.status).toBe(0);
    expect(error.name).toBe("NetworkError");
  });
});

describe("TimeoutError", () => {
  it("should create error with timeout value", () => {
    const error = new TimeoutError(30000);

    expect(error.message).toBe("Request timed out after 30000ms");
    expect(error.code).toBe(ERROR_CODES.TIMEOUT);
    expect(error.status).toBe(0);
    expect(error.details).toEqual({ timeout: 30000 });
    expect(error.name).toBe("TimeoutError");
  });
});

describe("Error inheritance", () => {
  it("all errors should be instanceof OpenGrantError", () => {
    expect(new PaymentRequiredError("test")).toBeInstanceOf(OpenGrantError);
    expect(new InsufficientBalanceError(BigInt(1), BigInt(0))).toBeInstanceOf(OpenGrantError);
    expect(new PaymentFailedError("test")).toBeInstanceOf(OpenGrantError);
    expect(new UnauthorizedError()).toBeInstanceOf(OpenGrantError);
    expect(new APINotFoundError("test")).toBeInstanceOf(OpenGrantError);
    expect(new RateLimitError()).toBeInstanceOf(OpenGrantError);
    expect(new NetworkError("test")).toBeInstanceOf(OpenGrantError);
    expect(new TimeoutError(1000)).toBeInstanceOf(OpenGrantError);
  });

  it("all errors should be instanceof Error", () => {
    expect(new PaymentRequiredError("test")).toBeInstanceOf(Error);
    expect(new InsufficientBalanceError(BigInt(1), BigInt(0))).toBeInstanceOf(Error);
    expect(new PaymentFailedError("test")).toBeInstanceOf(Error);
    expect(new UnauthorizedError()).toBeInstanceOf(Error);
    expect(new APINotFoundError("test")).toBeInstanceOf(Error);
    expect(new RateLimitError()).toBeInstanceOf(Error);
    expect(new NetworkError("test")).toBeInstanceOf(Error);
    expect(new TimeoutError(1000)).toBeInstanceOf(Error);
  });
});
