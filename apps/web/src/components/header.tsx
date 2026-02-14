"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/utils";
import { useWallet } from "@/contexts/wallet-context";

function ConnectedHeader() {
  const { address, isConnected, setOpen, disconnect } = useWallet();

  const handleOpen = () => {
    setOpen(true);
  };

  if (!isConnected) {
    return (
      <>
        <Button variant="ghost" onClick={handleOpen}>
          Sign In
        </Button>
        <Button onClick={handleOpen}>Get Started</Button>
      </>
    );
  }

  return (
    <>
      <Link href="/dashboard">
        <Button variant="ghost">Dashboard</Button>
      </Link>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {address ? formatAddress(address) : "Connected"}
        </span>
        <Button variant="outline" size="sm" onClick={() => disconnect()}>
          Sign Out
        </Button>
      </div>
    </>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
              OpenGrant
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link
              href="/explore"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Explore APIs
            </Link>
            <Link
              href="/fund"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Fund
            </Link>
            <Link
              href="/docs"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Docs
            </Link>
            <Link
              href="/pricing"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <ConnectedHeader />
        </div>
      </div>
    </header>
  );
}
