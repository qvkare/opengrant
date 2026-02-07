/** Default OpenGrant API base URL */
export const DEFAULT_BASE_URL = "https://api.opengrant.dev";

/** x402 Protocol version */
export const X402_VERSION = "1";

/** Base network chain ID */
export const BASE_CHAIN_ID = 8453;

/** USDC contract address on Base */
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

/** USDC decimals */
export const USDC_DECIMALS = 6;

/** Default request timeout in ms */
export const DEFAULT_TIMEOUT = 30000;

/** Default max retries */
export const DEFAULT_MAX_RETRIES = 3;

/** EIP-3009 TransferWithAuthorization type hash */
export const TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
  "0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267" as const;

/** EIP-712 domain for USDC on Base */
export const USDC_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: BASE_CHAIN_ID,
  verifyingContract: USDC_ADDRESS,
} as const;

/** EIP-3009 TransferWithAuthorization types */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** HTTP status codes */
export const HTTP_STATUS = {
  OK: 200,
  PAYMENT_REQUIRED: 402,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
} as const;

/** Error codes */
export const ERROR_CODES = {
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  UNAUTHORIZED: "UNAUTHORIZED",
  API_NOT_FOUND: "API_NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  UNKNOWN: "UNKNOWN",
} as const;
