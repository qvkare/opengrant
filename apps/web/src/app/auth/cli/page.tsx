"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Terminal, CheckCircle2, AlertCircle, Wallet, Copy, Check } from "lucide-react";

type AuthState = "loading" | "connect" | "signing" | "success" | "error";

interface SessionData {
  sessionId: string;
  wallet: string;
  token: string;
}

function CLIAuthContent() {
  const { address, isConnected, status, wallets, setOpen } = useWallet();
  const primaryWallet = wallets[0];
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const ready = status !== "connecting";

  const [authState, setAuthState] = useState<AuthState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [copied, setCopied] = useState(false);

  // Authenticate with CLI after wallet connection
  const authenticateCLI = useCallback(async () => {
    if (!address || !primaryWallet || !sessionId) return;

    setAuthState("signing");

    try {
      // Create the message to sign
      const message = `OpenGrant CLI Authentication\n\nSession: ${sessionId}\nWallet: ${address}\nTimestamp: ${Date.now()}`;

      // Sign the message
      const walletClient = primaryWallet.getWalletClient();
      const signature = await walletClient.signMessage({
        account: address as `0x${string}`,
        message,
      });

      // Send to API
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/v1/auth/cli/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          walletAddress: address,
          message,
          signature,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Authentication failed");
      }

      const data = await response.json();
      setSessionData({
        sessionId,
        wallet: address,
        token: data.token,
      });
      setAuthState("success");

      // Also notify the CLI via the session poll endpoint
      // The CLI is polling for this result
    } catch (err) {
      console.error("CLI auth error:", err);
      setError(err instanceof Error ? err.message : "Authentication failed");
      setAuthState("error");
    }
  }, [address, primaryWallet, sessionId]);

  useEffect(() => {
    if (!ready) {
      setAuthState("loading");
      return;
    }

    if (!sessionId) {
      setError("Missing session ID. Please start authentication from the CLI.");
      setAuthState("error");
      return;
    }

    if (!isConnected) {
      setAuthState("connect");
      return;
    }

    // User is authenticated, proceed with CLI auth
    authenticateCLI();
  }, [ready, isConnected, sessionId, authenticateCLI]);

  const copyToClipboard = async () => {
    if (sessionData?.token) {
      await navigator.clipboard.writeText(sessionData.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (authState === "loading") {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (authState === "error") {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div className="text-center">
              <h2 className="text-lg font-semibold">Authentication Failed</h2>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={() => window.location.reload()} variant="outline">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authState === "connect") {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Terminal className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">CLI Authentication</CardTitle>
            <CardDescription>
              Connect your wallet to authenticate with the OpenGrant CLI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground">Session ID</p>
              <code className="text-sm font-mono">{sessionId?.slice(0, 20)}...</code>
            </div>
            <Button className="w-full" size="lg" onClick={() => setOpen(true)}>
              <Wallet className="mr-2 h-5 w-5" />
              Connect Wallet
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              After connecting, you&apos;ll be asked to sign a message to complete
              authentication.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authState === "signing") {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <div className="text-center">
              <h2 className="text-lg font-semibold">Signing Message</h2>
              <p className="text-sm text-muted-foreground">
                Please confirm the signature request in your wallet...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 pt-6">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">Successfully Authenticated</h2>
            <p className="text-sm text-muted-foreground">
              You can now close this window and return to your terminal.
            </p>
          </div>
          <div className="w-full space-y-2">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground">Connected Wallet</p>
              <code className="text-sm font-mono">
                {sessionData?.wallet.slice(0, 6)}...{sessionData?.wallet.slice(-4)}
              </code>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              The CLI has been automatically authenticated. If you need to manually
              copy the token:
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={copyToClipboard}
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Token
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CLIAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <CLIAuthContent />
    </Suspense>
  );
}
