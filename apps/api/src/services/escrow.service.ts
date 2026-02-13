import {
  createPublicClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { config } from "../config/index.js";

// Minimal ABI for reading escrow contract state
const ESCROW_ABI = [
  {
    name: "getRepoInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "repoHash", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalBalance", type: "uint256" },
          { name: "totalDonated", type: "uint256" },
          { name: "totalClaimed", type: "uint256" },
          { name: "claimedWallet", type: "address" },
          { name: "donorCount", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getDonation",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "repoHash", type: "bytes32" },
      { name: "donor", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "amount", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "redistributeOnTimeout", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "totalDonated",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalClaimed",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getFundedRepoCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface RepoInfo {
  totalBalance: bigint;
  totalDonated: bigint;
  totalClaimed: bigint;
  claimedWallet: Address;
  donorCount: bigint;
}

export interface DonationInfo {
  amount: bigint;
  timestamp: bigint;
  redistributeOnTimeout: boolean;
}

function getPublicClient() {
  return createPublicClient({
    chain: base,
    transport: http(config.blockchain.rpcUrl),
  });
}

/**
 * Get the deployed escrow contract address
 */
export function getEscrowAddress(): Address {
  const addr = config.contracts.escrow;
  if (!addr) {
    throw new Error("OPENGRANT_ESCROW_ADDRESS not configured");
  }
  return addr as Address;
}

/**
 * Read on-chain repo info from the escrow contract
 */
export async function getEscrowRepoInfo(
  repoHash: `0x${string}`
): Promise<RepoInfo> {
  const client = getPublicClient();
  const result = await client.readContract({
    address: getEscrowAddress(),
    abi: ESCROW_ABI,
    functionName: "getRepoInfo",
    args: [repoHash as `0x${string}`],
  });

  return {
    totalBalance: result.totalBalance,
    totalDonated: result.totalDonated,
    totalClaimed: result.totalClaimed,
    claimedWallet: result.claimedWallet,
    donorCount: result.donorCount,
  };
}

/**
 * Read on-chain donation info for a specific donor
 */
export async function getDonationInfo(
  repoHash: `0x${string}`,
  donor: `0x${string}`
): Promise<DonationInfo> {
  const client = getPublicClient();
  const result = await client.readContract({
    address: getEscrowAddress(),
    abi: ESCROW_ABI,
    functionName: "getDonation",
    args: [repoHash as `0x${string}`, donor],
  });

  return {
    amount: result.amount,
    timestamp: result.timestamp,
    redistributeOnTimeout: result.redistributeOnTimeout,
  };
}

/**
 * Sign a claim authorization for user-initiated claim using EIP-712 structured data
 * The backend signs: EIP-712 typed data with domain "OpenGrantEscrow" v1
 * Claim(bytes32 repoHash, address wallet, uint256 nonce)
 */
export async function signClaimAuthorization(
  repoHash: `0x${string}`,
  wallet: `0x${string}`,
  nonce: bigint
): Promise<`0x${string}`> {
  const signerKey = config.escrow.signerPrivateKey;
  if (!signerKey) {
    throw new Error("ESCROW_SIGNER_PRIVATE_KEY not configured");
  }

  const account = privateKeyToAccount(signerKey as `0x${string}`);
  const escrowAddress = getEscrowAddress();
  const chainId = config.blockchain.chainId;

  const signature = await account.signTypedData({
    domain: {
      name: "OpenGrantEscrow",
      version: "1",
      chainId,
      verifyingContract: escrowAddress,
    },
    types: {
      Claim: [
        { name: "repoHash", type: "bytes32" },
        { name: "wallet", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "Claim",
    message: {
      repoHash,
      wallet,
      nonce,
    },
  });

  return signature;
}

/**
 * Get global escrow stats from chain
 */
export async function getEscrowStats(): Promise<{
  totalDonated: bigint;
  totalClaimed: bigint;
  fundedRepoCount: bigint;
}> {
  const client = getPublicClient();
  const address = getEscrowAddress();

  const [totalDonated, totalClaimed, fundedRepoCount] = await Promise.all([
    client.readContract({
      address,
      abi: ESCROW_ABI,
      functionName: "totalDonated",
    }),
    client.readContract({
      address,
      abi: ESCROW_ABI,
      functionName: "totalClaimed",
    }),
    client.readContract({
      address,
      abi: ESCROW_ABI,
      functionName: "getFundedRepoCount",
    }),
  ]);

  return { totalDonated, totalClaimed, fundedRepoCount };
}
