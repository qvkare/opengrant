export const contracts = {
  base: {
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const,
    registry: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as
      | `0x${string}`
      | undefined,
    payments: process.env.NEXT_PUBLIC_PAYMENTS_ADDRESS as
      | `0x${string}`
      | undefined,
  },
  baseSepolia: {
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
    registry: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_SEPOLIA as
      | `0x${string}`
      | undefined,
    payments: process.env.NEXT_PUBLIC_PAYMENTS_ADDRESS_SEPOLIA as
      | `0x${string}`
      | undefined,
  },
};
