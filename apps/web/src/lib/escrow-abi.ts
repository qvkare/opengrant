/**
 * Minimal ABIs for interacting with the OpenGrantEscrow contract and USDC (ERC20).
 * Extracted from the compiled contract artifacts.
 */

export const ESCROW_ABI = [
  {
    name: "donate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "repoHash", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "redistributeOnTimeout", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "batchDonate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "repoHashes", type: "bytes32[]" },
      { name: "amounts", type: "uint256[]" },
      { name: "redistributeFlags", type: "bool[]" },
    ],
    outputs: [],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "repoHash", type: "bytes32" },
      { name: "wallet", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "refund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "repoHash", type: "bytes32" }],
    outputs: [],
  },
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
] as const;

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
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
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
