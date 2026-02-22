export const contracts = {
  base: {
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const,
    registry: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as
      | `0x${string}`
      | undefined,
    payments: process.env.NEXT_PUBLIC_PAYMENTS_ADDRESS as
      | `0x${string}`
      | undefined,
    escrow: (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ||
      undefined) as `0x${string}` | undefined,
  },
  baseSepolia: {
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
    registry: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_SEPOLIA as
      | `0x${string}`
      | undefined,
    payments: process.env.NEXT_PUBLIC_PAYMENTS_ADDRESS_SEPOLIA as
      | `0x${string}`
      | undefined,
    escrow: ((process.env.NEXT_PUBLIC_ESCROW_ADDRESS_SEPOLIA ||
      "0x6c21371a0758c525f8632ee6466d0b7c35538953") as `0x${string}`),
  },
  worldchain: {
    usdc: "0x79A02482A880bCe3F13E09da970dC34dB4cD24D1" as const,
    registry: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_WORLD as
      | `0x${string}`
      | undefined,
    payments: process.env.NEXT_PUBLIC_PAYMENTS_ADDRESS_WORLD as
      | `0x${string}`
      | undefined,
    escrow: (process.env.NEXT_PUBLIC_ESCROW_ADDRESS_WORLD ||
      undefined) as `0x${string}` | undefined,
  },
  worldchainSepolia: {
    usdc: "0x66145f38cBAC35Ca6F1Dfb4914dF98F1614aeA88" as const,
    registry: (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_WORLD_SEPOLIA ||
      "0x9E82afb28b87957AFe50464A5717b5B53E395D0D") as `0x${string}`,
    payments: (process.env.NEXT_PUBLIC_PAYMENTS_ADDRESS_WORLD_SEPOLIA ||
      "0x2a5766F112666B52d2D7E2280dBa76CC3FC6d135") as `0x${string}`,
    escrow: (process.env.NEXT_PUBLIC_ESCROW_ADDRESS_WORLD_SEPOLIA ||
      "0x2e5c75c560D4877899a49206c629d04b58faD51A") as `0x${string}`,
  },
};
