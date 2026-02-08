/** Default OpenGrant API base URL */
export const DEFAULT_BASE_URL = "https://api.opengrant.dev";

/** x402 Protocol version */
export const X402_VERSION = "2";

/** USDC decimals (same on all chains) */
export const USDC_DECIMALS = 6;

/** Default request timeout in ms */
export const DEFAULT_TIMEOUT = 30000;

/** Default max retries */
export const DEFAULT_MAX_RETRIES = 3;

// ============================================
// MULTI-CHAIN CONFIGURATION
// ============================================

/**
 * Chain configuration for supported networks.
 * All USDC addresses are native Circle-issued contracts with EIP-3009 support.
 */
export interface ChainConfig {
  /** Chain ID */
  chainId: number;
  /** Human-readable network name */
  name: string;
  /** CAIP-2 network identifier for x402 */
  network: string;
  /** Native USDC contract address */
  usdc: `0x${string}`;
  /** Default RPC URL */
  rpcUrl: string;
  /** Whether this is a testnet */
  testnet: boolean;
}

/**
 * Supported chains with their USDC addresses and configuration.
 * Add new chains here to extend multi-chain support.
 */
export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  // Mainnets
  1: {
    chainId: 1,
    name: "Ethereum Mainnet",
    network: "eip155:1",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    rpcUrl: "https://eth.llamarpc.com",
    testnet: false,
  },
  8453: {
    chainId: 8453,
    name: "Base",
    network: "eip155:8453",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    rpcUrl: "https://mainnet.base.org",
    testnet: false,
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    network: "eip155:42161",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    testnet: false,
  },
  59144: {
    chainId: 59144,
    name: "Linea",
    network: "eip155:59144",
    usdc: "0xfece4462d57bd51a6a552365a011b95f0e16d9b7",
    rpcUrl: "https://rpc.linea.build",
    testnet: false,
  },
  137: {
    chainId: 137,
    name: "Polygon PoS",
    network: "eip155:137",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    rpcUrl: "https://polygon-rpc.com",
    testnet: false,
  },

  // Testnets
  84532: {
    chainId: 84532,
    name: "Base Sepolia",
    network: "eip155:84532",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    rpcUrl: "https://sepolia.base.org",
    testnet: true,
  },
  421614: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    network: "eip155:421614",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    testnet: true,
  },
  59141: {
    chainId: 59141,
    name: "Linea Sepolia",
    network: "eip155:59141",
    usdc: "0xB33a204B04C0BBe78eB4252c6264c5C94e2Fb0dB",
    rpcUrl: "https://rpc.sepolia.linea.build",
    testnet: true,
  },
  80002: {
    chainId: 80002,
    name: "Polygon Amoy",
    network: "eip155:80002",
    usdc: "0x41E94Eb71Ef8C9770bAd3BbD3E492065b2B8cE75",
    rpcUrl: "https://rpc-amoy.polygon.technology",
    testnet: true,
  },
} as const;

/** Default chain ID (Base) */
export const DEFAULT_CHAIN_ID = 8453;

/**
 * Get chain config by chain ID.
 * @throws if chain is not supported
 */
export function getChainConfig(chainId: number): ChainConfig {
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) {
    const supported = Object.values(SUPPORTED_CHAINS)
      .map((c) => `${c.name} (${c.chainId})`)
      .join(", ");
    throw new Error(
      `Unsupported chain ID: ${chainId}. Supported chains: ${supported}`
    );
  }
  return chain;
}

/**
 * Get USDC address for a chain.
 * @throws if chain is not supported
 */
export function getUSDCAddress(chainId: number): `0x${string}` {
  return getChainConfig(chainId).usdc;
}

/**
 * Get CAIP-2 network identifier for a chain.
 * @throws if chain is not supported
 */
export function getNetworkId(chainId: number): string {
  return getChainConfig(chainId).network;
}

/**
 * Build EIP-712 domain for USDC on a specific chain.
 * USDC uses name "USD Coin" and version "2" on all chains.
 */
export function getUSDCDomain(chainId: number) {
  const chain = getChainConfig(chainId);
  return {
    name: "USD Coin",
    version: "2",
    chainId: chain.chainId,
    verifyingContract: chain.usdc,
  } as const;
}

// Legacy exports for backward compatibility
export const BASE_CHAIN_ID = DEFAULT_CHAIN_ID;
export const USDC_ADDRESS = SUPPORTED_CHAINS[8453].usdc;
export const USDC_DOMAIN = getUSDCDomain(DEFAULT_CHAIN_ID);

/** EIP-3009 TransferWithAuthorization type hash */
export const TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
  "0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267" as const;

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
