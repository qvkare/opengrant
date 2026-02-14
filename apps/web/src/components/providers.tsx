"use client";

// This module is loaded via dynamic({ ssr: false }) in client-shell.tsx
// so we are guaranteed to be in the browser — safe to import ConnectKit synchronously.

import React, { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ConnectKitProvider,
  createConfig,
  useAccount,
  useModal,
  useDisconnect,
  useWallets,
} from "@particle-network/connectkit";
import { authWalletConnectors } from "@particle-network/connectkit/auth";
import { evmWalletConnectors } from "@particle-network/connectkit/evm";
import { wallet, EntryPosition } from "@particle-network/connectkit/wallet";
import { base, baseSepolia } from "@particle-network/connectkit/chains";
import { WalletContext } from "@/contexts/wallet-context";

const PARTICLE_PROJECT_ID = process.env.NEXT_PUBLIC_PARTICLE_PROJECT_ID;
const PARTICLE_CLIENT_KEY = process.env.NEXT_PUBLIC_PARTICLE_CLIENT_KEY;
const PARTICLE_APP_ID = process.env.NEXT_PUBLIC_PARTICLE_APP_ID;

const isParticleConfigured = !!(
  PARTICLE_PROJECT_ID &&
  PARTICLE_CLIENT_KEY &&
  PARTICLE_APP_ID
);

// Create config once at module level (only when configured)
const particleConfig = isParticleConfigured
  ? createConfig({
      projectId: PARTICLE_PROJECT_ID!,
      clientKey: PARTICLE_CLIENT_KEY!,
      appId: PARTICLE_APP_ID!,
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
    })
  : null;

/**
 * Bridges ConnectKit hooks into WalletContext so that page components
 * never need to import directly from @particle-network/connectkit.
 * This component MUST be rendered inside ConnectKitProvider.
 */
function WalletBridge({ children }: { children: ReactNode }) {
  const { address, isConnected, status } = useAccount();
  const { setOpen } = useModal();
  const { disconnect } = useDisconnect();
  const wallets = useWallets();

  return (
    <WalletContext.Provider
      value={{ address, isConnected, status, setOpen, disconnect, wallets }}
    >
      {children}
    </WalletContext.Provider>
  );
}

function ParticleProvider({ children }: { children: ReactNode }) {
  if (!isParticleConfigured || !particleConfig) {
    return <>{children}</>;
  }

  return (
    <ConnectKitProvider config={particleConfig}>
      <WalletBridge>{children}</WalletBridge>
    </ConnectKitProvider>
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
    <ParticleProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ParticleProvider>
  );
}
