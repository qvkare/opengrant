"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/utils";
import { useWallet } from "@/contexts/wallet-context";

function Logo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      className="text-black"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="26" height="26" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M18 7 H9 A2 2 0 0 0 7 9 V19 A2 2 0 0 0 9 21 H19 A2 2 0 0 0 21 19 V14 H14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="14" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ConnectedHeader() {
  const { address, isConnected, setOpen, disconnect } = useWallet();

  const handleOpen = () => {
    setOpen(true);
  };

  if (!isConnected) {
    return (
      <>
        <button
          onClick={handleOpen}
          className="text-sm font-medium text-gray-600 hover:text-black hidden sm:block transition-colors"
        >
          Sign In
        </button>
        <Button onClick={handleOpen}>Get Started</Button>
      </>
    );
  }

  return (
    <>
      <Link href="/publisher">
        <Button variant="ghost" size="sm">
          Dashboard
        </Button>
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
          {address ? formatAddress(address) : "Connected"}
        </span>
        <button
          onClick={() => disconnect()}
          className="text-xs text-gray-400 hover:text-black transition-colors"
        >
          Sign Out
        </button>
      </div>
    </>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <a href={process.env.NEXT_PUBLIC_LANDING_URL || "https://opengrant.dev"} className="flex items-center gap-3">
            <Logo />
            <span className="font-semibold text-lg tracking-tight">
              OpenGrant
            </span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
            <Link
              href="/explore"
              className="hover:text-black transition-colors"
            >
              Explore APIs
            </Link>
            <Link href="/fund" className="hover:text-black transition-colors">
              Fund
            </Link>
            <a
              href="https://github.com/qvkare/opengrant#readme"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              Docs
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <ConnectedHeader />
        </div>
      </div>
    </header>
  );
}
