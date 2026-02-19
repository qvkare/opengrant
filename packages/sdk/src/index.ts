// Main client
export { OpenGrant } from "./client.js";

// Signer utilities
export { PaymentSigner, createSigner, createSignerFromWallet } from "./signer.js";

// Errors
export {
  OpenGrantError,
  PaymentRequiredError,
  InsufficientBalanceError,
  PaymentFailedError,
  UnauthorizedError,
  APINotFoundError,
  RateLimitError,
  NetworkError,
  TimeoutError,
} from "./errors.js";

// Constants & Multi-chain
export {
  DEFAULT_BASE_URL,
  X402_VERSION,
  USDC_DECIMALS,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  HTTP_STATUS,
  ERROR_CODES,
  // Multi-chain
  SUPPORTED_CHAINS,
  DEFAULT_CHAIN_ID,
  getChainConfig,
  getUSDCAddress,
  getNetworkId,
  getUSDCDomain,
  // Escrow
  ESCROW_ADDRESSES,
  getEscrowAddress,
  // Legacy (backward compat)
  BASE_CHAIN_ID,
  USDC_ADDRESS,
  USDC_DOMAIN,
} from "./constants.js";

// Types
export type {
  OpenGrantConfig,
  CallOptions,
  PaymentDetails,
  PaymentAuthorization,
  APIResponse,
  APIError,
  UsageStats,
  WalletBalance,
  APIInfo,
  DonationConfig,
  DonationResult,
  BatchDonationConfig,
  BatchDonationResult,
  ClaimConfig,
  ClaimResult,
  TipResult,
  RepoFundInfo,
  Donation,
} from "./types.js";

export type { ChainConfig } from "./constants.js";
