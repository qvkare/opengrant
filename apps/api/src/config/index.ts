import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

// Load environment variables
dotenvConfig();

// Supported chain IDs for validation
const SUPPORTED_CHAIN_IDS = [1, 8453, 42161, 59144, 137, 84532, 421614, 59141, 80002];

// USDC addresses per chain (native Circle-issued, EIP-3009 compatible)
const CHAIN_USDC_ADDRESSES: Record<number, string> = {
  1:      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
  8453:   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
  42161:  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum One
  59144:  "0xfece4462d57bd51a6a552365a011b95f0e16d9b7", // Linea
  137:    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon
  84532:  "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
  421614: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Arbitrum Sepolia
  59141:  "0xB33a204B04C0BBe78eB4252c6264c5C94e2Fb0dB", // Linea Sepolia
  80002:  "0x41E94Eb71Ef8C9770bAd3BbD3E492065b2B8cE75", // Polygon Amoy
};

// Default RPC URLs per chain
const CHAIN_RPC_DEFAULTS: Record<number, string> = {
  1:      "https://eth.llamarpc.com",
  8453:   "https://mainnet.base.org",
  42161:  "https://arb1.arbitrum.io/rpc",
  59144:  "https://rpc.linea.build",
  137:    "https://polygon-rpc.com",
  84532:  "https://sepolia.base.org",
  421614: "https://sepolia-rollup.arbitrum.io/rpc",
  59141:  "https://rpc.sepolia.linea.build",
  80002:  "https://rpc-amoy.polygon.technology",
};

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.string().default("3001"),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Blockchain
  CHAIN_ID: z.string().default("8453"),
  RPC_URL: z.string().optional(),

  // x402
  X402_FACILITATOR_URL: z.string().default("https://x402.org/facilitator"),
  PLATFORM_WALLET: z.string(),

  // Contract addresses
  OPENGRANT_REGISTRY_ADDRESS: z.string().optional(),
  OPENGRANT_PAYMENTS_ADDRESS: z.string().optional(),
  USDC_ADDRESS: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("30d"),

  // Web
  WEB_URL: z.string().default("http://localhost:3000"),

  // GitHub (Fund feature)
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Escrow (Fund feature)
  OPENGRANT_ESCROW_ADDRESS: z.string().optional(),
  ESCROW_SIGNER_PRIVATE_KEY: z.string().optional(),
});

function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env);

    // Validate chain ID is supported
    const chainId = parseInt(parsed.CHAIN_ID, 10);
    if (!SUPPORTED_CHAIN_IDS.includes(chainId)) {
      console.error(`❌ Unsupported CHAIN_ID: ${chainId}`);
      console.error(`   Supported: ${SUPPORTED_CHAIN_IDS.join(", ")}`);
      process.exit(1);
    }

    // Validate RPC URL uses HTTPS in production
    const rpcUrl = parsed.RPC_URL || CHAIN_RPC_DEFAULTS[chainId];
    if (parsed.NODE_ENV === "production" && !rpcUrl.startsWith("https://")) {
      console.error("❌ RPC_URL must use HTTPS in production");
      process.exit(1);
    }

    return { ...parsed, _chainId: chainId, _rpcUrl: rpcUrl };
  } catch (error) {
    console.error("❌ Invalid environment variables:");
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}

export const env = validateEnv();

const chainId = env._chainId;

export const config = {
  server: {
    port: parseInt(env.PORT, 10),
    nodeEnv: env.NODE_ENV,
    isDev: env.NODE_ENV === "development",
    isProd: env.NODE_ENV === "production",
  },
  database: {
    url: env.DATABASE_URL,
    poolSize: 10,
  },
  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
  },
  web: {
    url: env.WEB_URL,
  },
  redis: {
    url: env.REDIS_URL,
  },
  blockchain: {
    chainId,
    rpcUrl: env._rpcUrl,
    network: `eip155:${chainId}`,
  },
  x402: {
    facilitatorUrl: env.X402_FACILITATOR_URL,
    platformWallet: env.PLATFORM_WALLET,
  },
  contracts: {
    registry: env.OPENGRANT_REGISTRY_ADDRESS,
    payments: env.OPENGRANT_PAYMENTS_ADDRESS,
    usdc: env.USDC_ADDRESS || CHAIN_USDC_ADDRESSES[chainId],
    escrow: env.OPENGRANT_ESCROW_ADDRESS,
    // Hard-fail if payments address is missing in production (USDC would go to wrong address permanently)
    _paymentsRequired: env.NODE_ENV === "production" && !env.OPENGRANT_PAYMENTS_ADDRESS
      ? (() => { console.error("❌ OPENGRANT_PAYMENTS_ADDRESS is required in production. Without it, x402 USDC payments cannot enter the settlement flow."); process.exit(1); })()
      : true,
  },
  github: {
    token: env.GITHUB_TOKEN,
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  },
  escrow: {
    signerPrivateKey: env.ESCROW_SIGNER_PRIVATE_KEY,
  },
  jwt: {
    secret: env.JWT_SECRET,
  },
} as const;

export type Config = typeof config;
