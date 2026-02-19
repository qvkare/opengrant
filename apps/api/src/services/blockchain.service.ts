import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import {
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  linea,
  lineaSepolia,
  polygon,
  polygonAmoy,
  mainnet,
} from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../config/index.js";

// Map chain ID to viem chain object
const CHAIN_MAP: Record<number, any> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
  59144: linea,
  137: polygon,
  84532: baseSepolia,
  421614: arbitrumSepolia,
  59141: lineaSepolia,
  80002: polygonAmoy,
};

function getViemChain() {
  return CHAIN_MAP[config.blockchain.chainId] ?? base;
}

// USDC contract on Base
const USDC_ADDRESS = config.contracts.usdc as Address;
const USDC_DECIMALS = 6;

// Minimal ERC20 ABI
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "transferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// EIP-3009 TransferWithAuthorization ABI
const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    name: "authorizationState",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Create public client for reading blockchain state
const publicClient = createPublicClient({
  chain: getViemChain(),
  transport: http(config.blockchain.rpcUrl),
});

/**
 * Get USDC balance for an address
 */
export async function getUSDCBalance(address: Address): Promise<{
  raw: bigint;
  formatted: string;
}> {
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  return {
    raw: balance,
    formatted: formatUnits(balance, USDC_DECIMALS),
  };
}

/**
 * Get ETH balance for an address
 */
export async function getETHBalance(address: Address): Promise<{
  raw: bigint;
  formatted: string;
}> {
  const balance = await publicClient.getBalance({ address });

  return {
    raw: balance,
    formatted: formatUnits(balance, 18),
  };
}

/**
 * Check if a TransferWithAuthorization has been used
 */
export async function isAuthorizationUsed(
  authorizer: Address,
  nonce: `0x${string}`
): Promise<boolean> {
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: TRANSFER_WITH_AUTHORIZATION_ABI,
    functionName: "authorizationState",
    args: [authorizer, nonce],
  });
}

/**
 * Get transaction receipt
 */
export async function getTransactionReceipt(
  txHash: Hash
): Promise<TransactionReceipt | null> {
  try {
    return await publicClient.getTransactionReceipt({ hash: txHash });
  } catch {
    return null;
  }
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  txHash: Hash,
  confirmations = 1
): Promise<TransactionReceipt> {
  return publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations,
  });
}

/**
 * Get current block number
 */
export async function getBlockNumber(): Promise<bigint> {
  return publicClient.getBlockNumber();
}

/**
 * Get block timestamp
 */
export async function getBlockTimestamp(): Promise<bigint> {
  const block = await publicClient.getBlock();
  return block.timestamp;
}

/**
 * Verify a signed message
 */
export async function verifySignature(
  address: Address,
  message: string,
  signature: `0x${string}`
): Promise<boolean> {
  try {
    const { verifyMessage } = await import("viem");
    return await verifyMessage({
      address,
      message,
      signature,
    });
  } catch {
    return false;
  }
}

/**
 * Parse USDC amount to raw units
 */
export function parseUSDC(amount: string): bigint {
  return parseUnits(amount, USDC_DECIMALS);
}

/**
 * Format USDC amount from raw units
 */
export function formatUSDC(amount: bigint): string {
  return formatUnits(amount, USDC_DECIMALS);
}

/**
 * Create a wallet client for signing transactions (server-side only)
 * Requires PLATFORM_PRIVATE_KEY env variable
 */
export function createPlatformWallet() {
  const privateKey = process.env.PLATFORM_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PLATFORM_PRIVATE_KEY not configured");
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: getViemChain(),
    transport: http(config.blockchain.rpcUrl),
  });

  return {
    address: account.address,
    walletClient,

    /**
     * Transfer USDC from platform wallet
     */
    async transferUSDC(to: Address, amount: bigint): Promise<Hash> {
      const hash = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [to, amount],
      });

      return hash;
    },
  };
}

/**
 * Get chain info
 */
export function getChainInfo() {
  return {
    chainId: config.blockchain.chainId,
    name: base.name,
    rpcUrl: config.blockchain.rpcUrl,
    usdcAddress: USDC_ADDRESS,
  };
}

export { publicClient };
