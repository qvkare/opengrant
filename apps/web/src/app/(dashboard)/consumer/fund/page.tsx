"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUSDC, formatAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Preset amounts
const presetAmounts = [10, 25, 50, 100];

export default function ConsumerFundPage() {
  const { address } = useWallet();
  const walletAddress = address || "";

  const [selectedAmount, setSelectedAmount] = useState<number | null>(25);
  const [customAmount, setCustomAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fundingMethod, setFundingMethod] = useState<"card" | "crypto">("card");

  const amount = selectedAmount || parseFloat(customAmount) || 0;

  const handleFundWithCard = async () => {
    if (!amount) return;

    setIsLoading(true);

    // Open Coinbase Onramp in new window
    const onrampUrl = new URL("https://pay.coinbase.com/buy/select-asset");
    onrampUrl.searchParams.set("appId", process.env.NEXT_PUBLIC_COINBASE_APP_ID || "");
    onrampUrl.searchParams.set("destinationWallets", JSON.stringify([
      {
        address: walletAddress,
        assets: ["USDC"],
        supportedNetworks: ["base"],
      },
    ]));
    onrampUrl.searchParams.set("presetFiatAmount", amount.toString());
    onrampUrl.searchParams.set("fiatCurrency", "USD");
    onrampUrl.searchParams.set("defaultAsset", "USDC");
    onrampUrl.searchParams.set("defaultNetwork", "base");

    window.open(onrampUrl.toString(), "_blank", "width=500,height=700");

    setIsLoading(false);
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add Funds</h1>
        <p className="text-muted-foreground">
          Add USDC to your wallet to start using APIs
        </p>
      </div>

      {/* Funding Method Selection */}
      <div className="flex rounded-lg bg-muted p-1">
        <button
          onClick={() => setFundingMethod("card")}
          className={cn(
            "flex-1 py-3 text-sm font-medium rounded-md transition-colors",
            fundingMethod === "card"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <svg
            className="w-4 h-4 inline-block mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
          Card / Bank
        </button>
        <button
          onClick={() => setFundingMethod("crypto")}
          className={cn(
            "flex-1 py-3 text-sm font-medium rounded-md transition-colors",
            fundingMethod === "crypto"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <svg
            className="w-4 h-4 inline-block mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Crypto Transfer
        </button>
      </div>

      {fundingMethod === "card" ? (
        <Card>
          <CardHeader>
            <CardTitle>Buy USDC with Card</CardTitle>
            <CardDescription>
              Powered by Coinbase Onramp - buy USDC directly with your debit card or bank account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Amount Selection */}
            <div>
              <label className="text-sm font-medium">Select Amount</label>
              <div className="grid grid-cols-4 gap-3 mt-2">
                {presetAmounts.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setSelectedAmount(preset);
                      setCustomAmount("");
                    }}
                    className={cn(
                      "py-3 rounded-lg border text-center font-medium transition-colors",
                      selectedAmount === preset
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted hover:border-primary/50"
                    )}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Amount */}
            <div>
              <label className="text-sm font-medium">Or enter custom amount</label>
              <div className="relative mt-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setSelectedAmount(null);
                  }}
                  placeholder="Enter amount"
                  className="w-full pl-8 pr-4 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">${amount.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">You'll receive</span>
                <span className="font-medium">~{amount.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Network</span>
                <span className="font-medium">Base</span>
              </div>
            </div>

            {/* Coinbase Branding */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>Powered by</span>
              <svg viewBox="0 0 100 100" className="w-5 h-5" fill="currentColor">
                <circle cx="50" cy="50" r="50" fill="#0052FF" />
                <path
                  d="M50 14c-19.882 0-36 16.118-36 36s16.118 36 36 36 36-16.118 36-36-16.118-36-36-36zm-8.5 45.5c-5.247 0-9.5-4.253-9.5-9.5s4.253-9.5 9.5-9.5 9.5 4.253 9.5 9.5-4.253 9.5-9.5 9.5zm17 0c-5.247 0-9.5-4.253-9.5-9.5s4.253-9.5 9.5-9.5 9.5 4.253 9.5 9.5-4.253 9.5-9.5 9.5z"
                  fill="white"
                />
              </svg>
              <span>Coinbase</span>
            </div>

            <Button
              onClick={handleFundWithCard}
              disabled={!amount || isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? "Opening Coinbase..." : `Buy $${amount.toFixed(2)} USDC`}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Direct Crypto Transfer</CardTitle>
            <CardDescription>
              Send USDC directly to your wallet address on Base network
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Wallet Address */}
            <div>
              <label className="text-sm font-medium">Your Wallet Address</label>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-sm break-all">
                  {walletAddress}
                </div>
                <Button variant="outline" size="sm" onClick={handleCopyAddress}>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </Button>
              </div>
            </div>

            {/* Network Info */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Network</span>
                <span className="font-medium">Base (Chain ID: 8453)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Token</span>
                <span className="font-medium">USDC</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Contract</span>
                <span className="font-mono text-xs">
                  0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
                </span>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex gap-3">
                <svg
                  className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <h4 className="font-medium text-yellow-500">Important</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Make sure you're sending USDC on the <strong>Base network</strong>, not
                    Ethereum mainnet. Sending on the wrong network may result in loss of funds.
                  </p>
                </div>
              </div>
            </div>

            {/* QR Code placeholder */}
            <div className="flex justify-center">
              <div className="w-48 h-48 bg-white rounded-lg p-4 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <svg
                    className="w-24 h-24 mx-auto"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                    />
                  </svg>
                  <p className="text-xs mt-2">QR Code</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <svg
                className="w-6 h-6 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h4 className="font-medium">About USDC on Base</h4>
              <p className="text-sm text-muted-foreground mt-1">
                OpenGrant uses USDC on the Base network for fast, low-cost payments.
                Base is an Ethereum Layer 2 with ~$0.001 transaction fees and 2-second
                finality. Your funds are used automatically when you make API calls
                via x402 micropayments.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
