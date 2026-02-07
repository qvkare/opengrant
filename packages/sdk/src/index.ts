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

// Constants
export {
  DEFAULT_BASE_URL,
  X402_VERSION,
  BASE_CHAIN_ID,
  USDC_ADDRESS,
  USDC_DECIMALS,
  USDC_DOMAIN,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  HTTP_STATUS,
  ERROR_CODES,
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
} from "./types.js";
