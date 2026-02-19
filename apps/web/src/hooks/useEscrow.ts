"use client";

import { useState, useCallback } from "react";
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  type Hash,
} from "viem";
import { baseSepolia } from "viem/chains";
import { useWallet } from "@/contexts/wallet-context";
import { contracts } from "@/lib/contracts";
import { ESCROW_ABI, ERC20_ABI } from "@/lib/escrow-abi";

// Use baseSepolia for now; switch to base for mainnet
const chain = baseSepolia;
const chainContracts = contracts.baseSepolia;

const publicClient = createPublicClient({
  chain,
  transport: http(),
});

export type TxStatus = "idle" | "approving" | "sending" | "confirming" | "success" | "error";

export function useEscrow() {
  const { address, wallets, chainId: walletChainId } = useWallet();
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only true when wallet IS connected but on the wrong chain.
  // undefined chainId (disconnected) is NOT "wrong chain" — it's "not connected".
  const isWrongChain = walletChainId !== undefined && walletChainId !== chain.id;

  function assertCorrectChain() {
    if (walletChainId === undefined) {
      throw new Error("Wallet not connected or chain not detected yet.");
    }
    if (walletChainId !== chain.id) {
      throw new Error(
        `Wrong network: please switch to ${chain.name} (chain ID ${chain.id})`
      );
    }
  }

  const getWalletClient = useCallback(() => {
    if (!wallets[0]) throw new Error("No wallet connected");
    return wallets[0].getWalletClient();
  }, [wallets]);

  const escrowAddress = chainContracts.escrow;
  const usdcAddress = chainContracts.usdc as `0x${string}`;

  const ensureAllowance = useCallback(
    async (amount: bigint) => {
      if (!address || !escrowAddress) throw new Error("Not configured");

      const allowance = await publicClient.readContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address as `0x${string}`, escrowAddress],
      });

      if (allowance >= amount) return;

      setTxStatus("approving");
      const walletClient = getWalletClient();
      const approveHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [escrowAddress, amount],
        chain,
        account: address as `0x${string}`,
      });

      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    },
    [address, escrowAddress, usdcAddress, getWalletClient]
  );

  const donate = useCallback(
    async (
      repoHash: `0x${string}`,
      usdcAmount: string,
      redistributeOnTimeout: boolean
    ): Promise<Hash> => {
      if (!escrowAddress) throw new Error("Escrow address not configured");
      // assertCorrectChain uses walletChainId from the current render closure
      if (walletChainId === undefined) throw new Error("Wallet not connected or chain not detected yet.");
      if (walletChainId !== chain.id) throw new Error(`Wrong network: please switch to ${chain.name} (chain ID ${chain.id})`);

      setError(null);
      setTxHash(null);

      try {
        const amount = parseUnits(usdcAmount, 6);

        await ensureAllowance(amount);

        setTxStatus("sending");
        const walletClient = getWalletClient();
        const hash = await walletClient.writeContract({
          address: escrowAddress,
          abi: ESCROW_ABI,
          functionName: "donate",
          args: [repoHash, amount, redistributeOnTimeout],
          chain,
          account: address as `0x${string}`,
        });

        setTxHash(hash);
        setTxStatus("confirming");
        await publicClient.waitForTransactionReceipt({ hash });
        setTxStatus("success");

        return hash;
      } catch (err) {
        setTxStatus("error");
        throw err;
      }
    },
    [escrowAddress, address, ensureAllowance, getWalletClient, walletChainId]
  );

  const batchDonate = useCallback(
    async (
      repoHashes: `0x${string}`[],
      usdcAmounts: string[],
      redistributeFlags: boolean[]
    ): Promise<Hash> => {
      if (!escrowAddress) throw new Error("Escrow address not configured");
      if (walletChainId === undefined) throw new Error("Wallet not connected or chain not detected yet.");
      if (walletChainId !== chain.id) throw new Error(`Wrong network: please switch to ${chain.name} (chain ID ${chain.id})`);

      setError(null);
      setTxHash(null);

      try {
        const amounts = usdcAmounts.map((a) => parseUnits(a, 6));
        const totalAmount = amounts.reduce((sum, a) => sum + a, BigInt(0));

        await ensureAllowance(totalAmount);

        setTxStatus("sending");
        const walletClient = getWalletClient();
        const hash = await walletClient.writeContract({
          address: escrowAddress,
          abi: ESCROW_ABI,
          functionName: "batchDonate",
          args: [repoHashes, amounts, redistributeFlags],
          chain,
          account: address as `0x${string}`,
        });

        setTxHash(hash);
        setTxStatus("confirming");
        await publicClient.waitForTransactionReceipt({ hash });
        setTxStatus("success");

        return hash;
      } catch (err) {
        setTxStatus("error");
        throw err;
      }
    },
    [escrowAddress, address, ensureAllowance, getWalletClient, walletChainId]
  );

  const claim = useCallback(
    async (
      repoHash: `0x${string}`,
      wallet: `0x${string}`,
      nonce: bigint,
      signature: `0x${string}`
    ): Promise<Hash> => {
      if (!escrowAddress) throw new Error("Escrow address not configured");
      if (walletChainId === undefined) throw new Error("Wallet not connected or chain not detected yet.");
      if (walletChainId !== chain.id) throw new Error(`Wrong network: please switch to ${chain.name} (chain ID ${chain.id})`);

      setError(null);
      setTxHash(null);

      try {
        setTxStatus("sending");

        const walletClient = getWalletClient();
        const hash = await walletClient.writeContract({
          address: escrowAddress,
          abi: ESCROW_ABI,
          functionName: "claim",
          args: [repoHash, wallet, nonce, signature],
          chain,
          account: address as `0x${string}`,
        });

        setTxHash(hash);
        setTxStatus("confirming");
        await publicClient.waitForTransactionReceipt({ hash });
        setTxStatus("success");

        return hash;
      } catch (err) {
        setTxStatus("error");
        throw err;
      }
    },
    [escrowAddress, address, getWalletClient, walletChainId]
  );

  const getRepoInfo = useCallback(
    async (repoHash: `0x${string}`) => {
      if (!escrowAddress) throw new Error("Escrow address not configured");

      const result = await publicClient.readContract({
        address: escrowAddress,
        abi: ESCROW_ABI,
        functionName: "getRepoInfo",
        args: [repoHash],
      });

      return {
        totalBalance: formatUnits(result.totalBalance, 6),
        totalDonated: formatUnits(result.totalDonated, 6),
        totalClaimed: formatUnits(result.totalClaimed, 6),
        claimedWallet: result.claimedWallet,
        donorCount: Number(result.donorCount),
      };
    },
    [escrowAddress]
  );

  const getUsdcBalance = useCallback(async (): Promise<string> => {
    if (!address) return "0";
    const balance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    return formatUnits(balance, 6);
  }, [address, usdcAddress]);

  const reset = useCallback(() => {
    setTxStatus("idle");
    setTxHash(null);
    setError(null);
  }, []);

  return {
    donate,
    batchDonate,
    claim,
    getRepoInfo,
    getUsdcBalance,
    txStatus,
    txHash,
    error,
    setError,
    reset,
    escrowAddress,
    chainId: chain.id,
    chainName: chain.name,
    isWrongChain,
  };
}
