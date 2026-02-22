"use client";

import { createContext, useContext } from "react";

export interface WalletState {
  address?: string;
  isConnected: boolean;
  status: string;
  chainId?: number;
  setOpen: (open?: boolean) => void;
  disconnect: () => void;
  wallets: any[];
}

const defaultState: WalletState = {
  isConnected: false,
  status: "disconnected",
  setOpen: () => {},
  disconnect: () => {},
  wallets: [],
};

export const WalletContext = createContext<WalletState>(defaultState);

export function useWallet() {
  return useContext(WalletContext);
}
