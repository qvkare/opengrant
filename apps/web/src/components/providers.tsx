"use client";

import React, { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { base, baseSepolia, worldchain, worldchainSepolia } from "viem/chains";
import { WalletContext } from "@/contexts/wallet-context";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

const isPrivyConfigured = !!PRIVY_APP_ID;

/**
 * Bridges Privy hooks into WalletContext so that page components
 * never need to import directly from @privy-io/react-auth.
 */
function WalletBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const activeWallet = embeddedWallet || wallets[0];

  return (
    <WalletContext.Provider
      value={{
        address: activeWallet?.address,
        isConnected: authenticated && wallets.length > 0,
        status: !ready ? "connecting" : authenticated ? "connected" : "disconnected",
        chainId: activeWallet?.chainId ? parseInt(activeWallet.chainId.split(":")[1]) : undefined,
        setOpen: () => login(),
        disconnect: () => privyLogout(),
        wallets,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

function PrivyWrapper({ children }: { children: ReactNode }) {
  if (!isPrivyConfigured) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#3B82F6",
        },
        loginMethods: ["email", "wallet", "google", "apple", "twitter", "github"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia, base, worldchainSepolia, worldchain],
      }}
    >
      <WalletBridge>{children}</WalletBridge>
    </PrivyProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60 * 1000 } },
      })
  );

  return (
    <PrivyWrapper>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrivyWrapper>
  );
}
