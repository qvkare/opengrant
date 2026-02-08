"use client";

import React, { useState, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const PARTICLE_PROJECT_ID = process.env.NEXT_PUBLIC_PARTICLE_PROJECT_ID;
const PARTICLE_CLIENT_KEY = process.env.NEXT_PUBLIC_PARTICLE_CLIENT_KEY;
const PARTICLE_APP_ID = process.env.NEXT_PUBLIC_PARTICLE_APP_ID;

const isParticleConfigured = !!(
  PARTICLE_PROJECT_ID &&
  PARTICLE_CLIENT_KEY &&
  PARTICLE_APP_ID
);

/**
 * Dynamically loaded Particle ConnectKit wrapper.
 * Only imports @particle-network/connectkit (and its transitive deps
 * like @privy-io, @reown) when credentials are configured.
 */
function ParticleProvider({ children }: { children: ReactNode }) {
  const [Provider, setProvider] = useState<React.ComponentType<{
    children: ReactNode;
  }> | null>(null);

  useEffect(() => {
    if (!isParticleConfigured) return;

    (async () => {
      const { ConnectKitProvider, createConfig } = await import(
        "@particle-network/connectkit"
      );
      const { authWalletConnectors } = await import(
        "@particle-network/connectkit/auth"
      );
      const { evmWalletConnectors } = await import(
        "@particle-network/connectkit/evm"
      );
      const { wallet, EntryPosition } = await import(
        "@particle-network/connectkit/wallet"
      );
      const { base, baseSepolia } = await import(
        "@particle-network/connectkit/chains"
      );

      const config = createConfig({
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
              url: window.location.origin,
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

      // Wrap ConnectKitProvider with its config into a simple component
      setProvider(() => {
        return function ConfiguredProvider({
          children,
        }: {
          children: ReactNode;
        }) {
          return (
            <ConnectKitProvider config={config}>{children}</ConnectKitProvider>
          );
        };
      });
    })();
  }, []);

  if (!isParticleConfigured) {
    return <>{children}</>;
  }

  if (!Provider) {
    // Loading Particle ConnectKit...
    return <>{children}</>;
  }

  return <Provider>{children}</Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60 * 1000 } },
      })
  );

  if (!isParticleConfigured) {
    console.warn(
      "Particle Network not configured. Set NEXT_PUBLIC_PARTICLE_PROJECT_ID, NEXT_PUBLIC_PARTICLE_CLIENT_KEY, and NEXT_PUBLIC_PARTICLE_APP_ID."
    );
  }

  return (
    <ParticleProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ParticleProvider>
  );
}
