"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/contexts/wallet-context";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const TOKEN_KEY_PREFIX = "opengrant_api_token";

export function useApiAuth(type: "consumer" | "publisher" = "consumer") {
  const TOKEN_KEY = `${TOKEN_KEY_PREFIX}_${type}`;
  const { address, isConnected, status, wallets } = useWallet();
  const primaryWallet = wallets[0];
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const authenticatingRef = useRef(false);

  // Try to load cached token on mount
  useEffect(() => {
    const cached = sessionStorage.getItem(TOKEN_KEY);
    if (cached) {
      setToken(cached);
    }
  }, [TOKEN_KEY]);

  const authenticate = useCallback(async (): Promise<string | null> => {
    if (token) return token;
    if (!address || !primaryWallet || authenticatingRef.current) return null;

    authenticatingRef.current = true;
    setLoading(true);

    try {
      const message = `OpenGrant Login\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
      const walletClient = primaryWallet.getWalletClient();
      const signature = await walletClient.signMessage({
        account: address as `0x${string}`,
        message,
      });

      const res = await fetch(`${API_BASE}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          signature,
          message,
          type,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Authentication failed");
      }

      const { token: newToken } = await res.json();
      sessionStorage.setItem(TOKEN_KEY, newToken);
      setToken(newToken);
      return newToken;
    } catch (err) {
      console.error("API auth error:", err);
      return null;
    } finally {
      setLoading(false);
      authenticatingRef.current = false;
    }
  }, [token, address, primaryWallet, type, TOKEN_KEY]);

  // Auto-authenticate when wallet is connected and no token exists
  useEffect(() => {
    if (status !== "connecting" && isConnected && address && !token) {
      authenticate();
    }
  }, [status, isConnected, address, token, authenticate]);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, [TOKEN_KEY]);

  return {
    token,
    loading,
    authenticated: !!token,
    authenticate,
    logout,
  };
}
