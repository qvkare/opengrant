"use client";

import React, { useState, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, createConfig } from "@particle-network/connectkit";
import { authWalletConnectors } from "@particle-network/connectkit/auth";
import { evmWalletConnectors } from "@particle-network/connectkit/evm";
import { wallet, EntryPosition } from "@particle-network/connectkit/wallet";
import { base, baseSepolia } from "@particle-network/connectkit/chains";

const config = createConfig({
  projectId: process.env.NEXT_PUBLIC_PARTICLE_PROJECT_ID!,
  clientKey: process.env.NEXT_PUBLIC_PARTICLE_CLIENT_KEY!,
  appId: process.env.NEXT_PUBLIC_PARTICLE_APP_ID!,
  chains: [baseSepolia, base],
  walletConnectors: [
    authWalletConnectors({
      authTypes: ["email", "google", "apple", "twitter", "github"],
      fiatCoin: "USD",
      promptSettingConfig: {
        promptMasterPasswordSettingWhenLogin: 1,
        promptPaymentPasswordSettingWhenSign: 1,
      },
    }),
    evmWalletConnectors({
      metadata: {
        name: "OpenGrant",
        icon: "",
        description: "Crypto-native API marketplace",
        url: typeof window !== "undefined" ? window.location.origin : "",
      },
      multiInjectedProviderDiscovery: true,
    }),
  ],
  plugins: [
    wallet({
      entryPosition: EntryPosition.BR,
      visible: true,
    }),
  ],
  appearance: {
    mode: "dark",
    theme: {
      "--pcm-accent-color": "#3B82F6",
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60 * 1000 } },
      })
  );

  return (
    <ConnectKitProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConnectKitProvider>
  );
}
