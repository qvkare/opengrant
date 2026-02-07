/**
 * Chainlink CRE Configuration
 *
 * This configuration defines the workflows, triggers, and capabilities
 * for the OpenGrant CRE workflows.
 */
export default {
  // Project configuration
  project: {
    name: "opengrant",
    version: "0.1.0",
  },

  // Target environments
  targets: {
    // Local simulation
    simulation: {
      type: "simulation",
    },

    // Base Sepolia testnet
    staging: {
      type: "don",
      network: "base-sepolia",
      donId: process.env.CRE_DON_ID_STAGING,
    },

    // Base mainnet
    production: {
      type: "don",
      network: "base-mainnet",
      donId: process.env.CRE_DON_ID_PRODUCTION,
    },
  },

  // Workflows
  workflows: {
    // Payment verification workflow
    "payment-verification": {
      entry: "./src/workflows/payment-verification.ts",
      trigger: {
        type: "http",
        path: "/verify-payment",
        method: "POST",
      },
      capabilities: ["http-client"],
    },

    // Usage aggregation workflow
    "usage-aggregation": {
      entry: "./src/workflows/usage-aggregation.ts",
      trigger: {
        type: "cron",
        schedule: "*/5 * * * *", // Every 5 minutes
      },
      capabilities: ["http-client", "evm-client"],
    },

    // Health monitoring workflow
    "health-monitoring": {
      entry: "./src/workflows/health-monitoring.ts",
      trigger: {
        type: "cron",
        schedule: "*/1 * * * *", // Every minute
      },
      capabilities: ["http-client", "evm-client"],
    },
  },

  // Secrets (reference to Vault DON secrets)
  secrets: {
    // API keys for internal endpoints
    OPENGRANT_API_KEY: {
      source: "vault",
      key: "opengrant-api-key",
    },
    // x402 facilitator credentials (if needed)
    X402_FACILITATOR_KEY: {
      source: "vault",
      key: "x402-facilitator-key",
    },
  },

  // Contract addresses for EVM interactions
  contracts: {
    baseSepolia: {
      registry: process.env.OPENGRANT_REGISTRY_ADDRESS_SEPOLIA,
      payments: process.env.OPENGRANT_PAYMENTS_ADDRESS_SEPOLIA,
      usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
    },
    baseMainnet: {
      registry: process.env.OPENGRANT_REGISTRY_ADDRESS,
      payments: process.env.OPENGRANT_PAYMENTS_ADDRESS,
      usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Base Mainnet USDC
    },
  },
};
