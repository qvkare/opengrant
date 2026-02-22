import type { Account, Chain, Transport, WalletClient } from "viem";

/**
 * OpenGrant SDK configuration options
 */
export interface OpenGrantConfig {
  /** Your OpenGrant API key */
  apiKey: string;
  /** Base URL for OpenGrant API (defaults to https://api.opengrant.dev) */
  baseUrl?: string;
  /** Chain ID for payment network (default: 4801 = World Chain Sepolia). Supports World Chain, Base, Arbitrum, Linea, Polygon. */
  chainId?: number;
  /** Custom RPC URL (overrides the default for the selected chain) */
  rpcUrl?: string;
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
  /** Auto-tip percentage for linked OSS projects on paid API calls (0-100, default: 0) */
  tipPercentage?: number;
  /** Callback when an auto-tip completes (success or failure) */
  onTip?: (result: TipResult) => void;
}

/**
 * Result of an auto-tip attempt after a paid API call
 */
export interface TipResult {
  /** Whether the tip succeeded */
  success: boolean;
  /** Repo that was tipped (owner/name) */
  repo?: string;
  /** USDC amount tipped (human-readable) */
  amount?: string;
  /** Transaction hash (if successful) */
  txHash?: string;
  /** Error message (if failed) */
  error?: string;
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
  /** Linked GitHub repo info (if any) */
  githubRepo?: {
    owner: string;
    name: string;
    repoHash: string;
  } | null;
}

/**
 * Donation configuration
 */
export interface DonationConfig {
  /** GitHub repository owner (e.g. "facebook") */
  repoOwner: string;
  /** GitHub repository name (e.g. "react") */
  repoName: string;
  /** USDC amount (human-readable, e.g. "10.00") */
  amount: string;
  /** If unclaimed after timeout, allow redistribution (default: false) */
  redistributeOnTimeout?: boolean;
}

/**
 * Donation result
 */
export interface DonationResult {
  /** On-chain transaction hash */
  txHash: string;
  /** Repository hash (bytes32) */
  repoHash: string;
  /** Amount donated in USDC */
  amount: string;
  /** Chain ID where donation was made */
  chainId: number;
}

/**
 * Batch donation configuration — donate to multiple repos in a single transaction
 */
export interface BatchDonationConfig {
  /** Array of donation targets */
  donations: Array<{
    /** GitHub repository owner (e.g. "facebook") */
    repoOwner: string;
    /** GitHub repository name (e.g. "react") */
    repoName: string;
    /** USDC amount (human-readable, e.g. "10.00") */
    amount: string;
    /** If unclaimed after timeout, allow redistribution (default: false) */
    redistributeOnTimeout?: boolean;
  }>;
}

/**
 * Batch donation result
 */
export interface BatchDonationResult {
  /** On-chain transaction hash */
  txHash: string;
  /** Number of repos funded */
  repoCount: number;
  /** Total USDC amount donated */
  totalAmount: string;
  /** Chain ID where donation was made */
  chainId: number;
}

/**
 * Claim configuration — claim escrow funds for a repo you own
 */
export interface ClaimConfig {
  /** GitHub repository owner (e.g. "facebook") */
  repoOwner: string;
  /** GitHub repository name (e.g. "react") */
  repoName: string;
  /** GitHub personal access token for ownership verification */
  githubToken: string;
}

/**
 * Claim result
 */
export interface ClaimResult {
  /** On-chain claim transaction hash */
  txHash: string;
  /** Repository hash (bytes32) */
  repoHash: string;
  /** Chain ID where claim was executed */
  chainId: number;
}

/**
 * Repository funding info
 */
export interface RepoFundInfo {
  /** Repo ID in backend */
  id: string;
  /** GitHub owner */
  owner: string;
  /** GitHub repo name */
  name: string;
  /** Total funded in USDC */
  totalFunded: string;
  /** Number of unique donors */
  donorCount: number;
  /** Claim status */
  claimStatus: string;
  /** Repository hash (bytes32) */
  repoHash: string;
}

/**
 * Donation record
 */
export interface Donation {
  id: string;
  amount: string;
  txHash: string;
  chainId: number;
  status: string;
  source: string;
  createdAt: string;
  repoOwner: string;
  repoName: string;
  repoFullName: string;
}
