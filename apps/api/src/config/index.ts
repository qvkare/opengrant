import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

// Load environment variables
dotenvConfig();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.string().default("3001"),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Blockchain
  CHAIN_ID: z.string().default("8453"), // Base mainnet
  RPC_URL: z.string().default("https://mainnet.base.org").refine(
    (url) => url.startsWith("https://") || process.env.NODE_ENV !== "production",
    "RPC_URL must use HTTPS in production"
  ),

  // x402
  X402_FACILITATOR_URL: z.string().default("https://x402.org/facilitator"),
  PLATFORM_WALLET: z.string(),

  // Contract addresses
  OPENGRANT_REGISTRY_ADDRESS: z.string().optional(),
  OPENGRANT_PAYMENTS_ADDRESS: z.string().optional(),
  USDC_ADDRESS: z.string().default("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"),

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("30d"),

  // Web
  WEB_URL: z.string().default("http://localhost:3000"),
});

function validateEnv() {
  try {
    return envSchema.parse(process.env);
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
    chainId: parseInt(env.CHAIN_ID, 10),
    rpcUrl: env.RPC_URL,
  },
  x402: {
    facilitatorUrl: env.X402_FACILITATOR_URL,
    platformWallet: env.PLATFORM_WALLET,
  },
  contracts: {
    registry: env.OPENGRANT_REGISTRY_ADDRESS,
    payments: env.OPENGRANT_PAYMENTS_ADDRESS,
    usdc: env.USDC_ADDRESS,
  },
  jwt: {
    secret: env.JWT_SECRET,
  },
} as const;

export type Config = typeof config;
