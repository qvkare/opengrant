import { ERROR_CODES } from "./constants.js";
import type { APIError } from "./types.js";

/**
 * Base OpenGrant error class
 */
export class OpenGrantError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(error: APIError) {
    super(error.message);
    this.name = "OpenGrantError";
    this.code = error.code;
    this.status = error.status;
    this.details = error.details;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OpenGrantError);
    }
  }

  toJSON(): APIError {
    return {
      message: this.message,
      code: this.code,
      status: this.status,
      details: this.details,
    };
  }
}

/**
 * Payment required error (402)
 */
export class PaymentRequiredError extends OpenGrantError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      message,
      code: ERROR_CODES.PAYMENT_REQUIRED,
      status: 402,
      details,
    });
    this.name = "PaymentRequiredError";
  }
}

/**
 * Insufficient balance error
 */
export class InsufficientBalanceError extends OpenGrantError {
  public readonly required: bigint;
  public readonly available: bigint;

  constructor(required: bigint, available: bigint) {
    super({
      message: `Insufficient USDC balance. Required: ${required}, Available: ${available}`,
      code: ERROR_CODES.INSUFFICIENT_BALANCE,
      status: 402,
      details: {
        required: required.toString(),
        available: available.toString(),
      },
    });
    this.name = "InsufficientBalanceError";
    this.required = required;
    this.available = available;
  }
}

/**
 * Payment failed error
 */
export class PaymentFailedError extends OpenGrantError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      message,
      code: ERROR_CODES.PAYMENT_FAILED,
      status: 402,
      details,
    });
    this.name = "PaymentFailedError";
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends OpenGrantError {
  constructor(message = "Invalid or missing API key") {
    super({
      message,
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401,
    });
    this.name = "UnauthorizedError";
  }
}

/**
 * API not found error (404)
 */
export class APINotFoundError extends OpenGrantError {
  constructor(apiSlug: string) {
    super({
      message: `API not found: ${apiSlug}`,
      code: ERROR_CODES.API_NOT_FOUND,
      status: 404,
      details: { apiSlug },
    });
    this.name = "APINotFoundError";
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends OpenGrantError {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number) {
    super({
      message: "Rate limit exceeded",
      code: ERROR_CODES.RATE_LIMITED,
      status: 429,
      details: retryAfter ? { retryAfter } : undefined,
    });
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Network error
 */
export class NetworkError extends OpenGrantError {
  constructor(message: string) {
    super({
      message,
      code: ERROR_CODES.NETWORK_ERROR,
      status: 0,
    });
    this.name = "NetworkError";
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends OpenGrantError {
  constructor(timeout: number) {
    super({
      message: `Request timed out after ${timeout}ms`,
      code: ERROR_CODES.TIMEOUT,
      status: 0,
      details: { timeout },
    });
    this.name = "TimeoutError";
  }
}
