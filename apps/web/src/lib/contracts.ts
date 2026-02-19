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
};
