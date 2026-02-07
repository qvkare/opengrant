import type { Account, Chain, Transport, WalletClient } from "viem";

/**
 * OpenGrant SDK configuration options
 */
export interface OpenGrantConfig {
  /** Your OpenGrant API key */
  apiKey: string;
  /** Base URL for OpenGrant API (defaults to https://api.opengrant.dev) */
  baseUrl?: string;
  /** Wallet client for signing payment authorizations */
  walletClient?: WalletClient<Transport, Chain, Account>;
  /** Private key for signing (alternative to walletClient) */
  privateKey?: `0x${string}`;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Enable automatic retries (default: true) */
  autoRetry?: boolean;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * API call options
 */
export interface CallOptions {
  /** Request body for POST/PUT/PATCH */
  body?: Record<string, unknown>;
  /** Query parameters */
  params?: Record<string, string | number | boolean>;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Override timeout for this request */
  timeout?: number;
  /** Maximum price willing to pay (in USDC wei, 6 decimals) */
  maxPrice?: bigint;
}

/**
 * x402 Payment details returned in 402 response
 */
export interface PaymentDetails {
  /** x402 protocol version */
  version: string;
  /** Payment network (e.g., "base") */
  network: string;
  /** Payment amount in USDC wei */
  amount: string;
  /** Payment token address (USDC) */
  token: string;
  /** Recipient address */
  recipient: string;
  /** Facilitator URL */
  facilitator: string;
  /** Payment description */
  description: string;
  /** Resource being accessed */
  resource: string;
  /** Payment validity period */
  validUntil: number;
  /** Unique payment nonce */
  nonce: string;
}

/**
 * Payment authorization signature
 */
export interface PaymentAuthorization {
  /** EIP-3009 signature */
  signature: string;
  /** From address (payer) */
  from: string;
  /** To address (recipient) */
  to: string;
  /** Amount in USDC wei */
  value: string;
  /** Valid after timestamp */
  validAfter: number;
  /** Valid before timestamp */
  validBefore: number;
  /** Unique nonce */
  nonce: string;
}

/**
 * API response wrapper
 */
export interface APIResponse<T = unknown> {
  /** Response data */
  data: T;
  /** Response status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Payment details if payment was made */
  payment?: {
    /** Amount paid in USDC wei */
    amount: string;
    /** Transaction hash */
    txHash?: string;
  };
}

/**
 * API error
 */
export interface APIError {
  /** Error message */
  message: string;
  /** Error code */
  code: string;
  /** HTTP status code */
  status: number;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Usage statistics
 */
export interface UsageStats {
  /** Total API calls */
  totalCalls: number;
  /** Total amount spent in USDC wei */
  totalSpent: string;
  /** Usage breakdown by API */
  byApi: Array<{
    apiSlug: string;
    apiName: string;
    calls: number;
    spent: string;
  }>;
  /** Daily usage */
  daily: Array<{
    date: string;
    calls: number;
    spent: string;
  }>;
}

/**
 * Wallet balance
 */
export interface WalletBalance {
  /** USDC balance in wei */
  usdc: string;
  /** ETH balance in wei (for gas) */
  eth: string;
  /** Formatted USDC balance */
  usdcFormatted: string;
}

/**
 * API info
 */
export interface APIInfo {
  /** API slug */
  slug: string;
  /** API name */
  name: string;
  /** API description */
  description: string;
  /** Publisher name */
  publisher: string;
  /** Base URL */
  baseUrl: string;
  /** Available endpoints */
  endpoints: Array<{
    path: string;
    method: string;
    description: string;
    pricePerCall: string;
  }>;
}
